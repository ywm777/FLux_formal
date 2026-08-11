use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
struct AppInfo {
    version: &'static str,
    platform: &'static str,
    data_dir: String,
}

const MAX_HTTP_RESPONSE_BYTES: usize = 1_048_576;
const HTTP_REQUEST_TIMEOUT_SECONDS: u64 = 12;
const MAX_MCP_STDIO_LINE_BYTES: usize = 1_048_576;
const MAX_MCP_STDERR_BYTES: u64 = 8_192;
static STORAGE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpRequestInput {
    url: String,
    method: String,
    headers: BTreeMap<String, String>,
    body: Option<String>,
}

#[derive(Serialize)]
struct HttpResponseOutput {
    status: u16,
    headers: BTreeMap<String, String>,
    body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpStdioInput {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    cwd: Option<String>,
    #[serde(default)]
    environment: BTreeMap<String, String>,
    action: String,
    tool_name: Option<String>,
    arguments: Option<Value>,
    idempotency_key: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct McpStdioOutput {
    protocol_version: String,
    server_name: Option<String>,
    server_version: Option<String>,
    tools: Vec<Value>,
    result: Option<Value>,
}

fn validate_mcp_stdio_input(input: &McpStdioInput) -> Result<(), String> {
    let command = input.command.trim();
    if command.is_empty() || command.len() > 512 || command.contains('\r') || command.contains('\n')
    {
        return Err("STDIO 启动命令无效".to_string());
    }
    if input.args.len() > 32 || input.args.iter().any(|arg| arg.len() > 1024) {
        return Err("STDIO 参数数量或长度超出限制".to_string());
    }
    if input.environment.len() > 32
        || input.environment.iter().any(|(key, value)| {
            let mut chars = key.chars();
            let valid_first = chars
                .next()
                .is_some_and(|c| c == '_' || c.is_ascii_alphabetic());
            !valid_first
                || !chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
                || key.len() > 64
                || value.len() > 4096
        })
    {
        return Err("STDIO 环境变量无效".to_string());
    }
    if let Some(cwd) = input.cwd.as_ref().filter(|value| !value.trim().is_empty()) {
        let path = PathBuf::from(cwd);
        if !path.is_dir() {
            return Err("STDIO 工作目录不存在或不是文件夹".to_string());
        }
    }
    if input.action != "discover" && input.action != "call" {
        return Err("不支持的 STDIO MCP 操作".to_string());
    }
    if input.action == "call"
        && input
            .tool_name
            .as_ref()
            .map_or(true, |name| name.trim().is_empty())
    {
        return Err("STDIO MCP 工具名称不能为空".to_string());
    }
    if input.idempotency_key.as_ref().is_some_and(|key| {
        key.len() > 128
            || !key
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
    }) {
        return Err("STDIO MCP 幂等键无效".to_string());
    }
    Ok(())
}

fn stderr_detail(stderr: &Arc<Mutex<String>>) -> String {
    let detail = stderr
        .lock()
        .ok()
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    if detail.is_empty() {
        String::new()
    } else {
        format!("：{detail}")
    }
}

fn send_stdio_message(stdin: &mut impl Write, message: &Value) -> Result<(), String> {
    serde_json::to_writer(&mut *stdin, message).map_err(|_| "无法写入 MCP 请求".to_string())?;
    stdin
        .write_all(b"\n")
        .map_err(|_| "无法写入 MCP 请求".to_string())?;
    stdin.flush().map_err(|_| "无法发送 MCP 请求".to_string())
}

fn read_bounded_stdio_line(reader: &mut impl BufRead) -> Result<Option<Vec<u8>>, String> {
    let mut line = Vec::new();
    let mut limited = Read::take(&mut *reader, (MAX_MCP_STDIO_LINE_BYTES + 1) as u64);
    let read = limited
        .read_until(b'\n', &mut line)
        .map_err(|_| "无法读取 MCP 本地进程输出".to_string())?;
    if read == 0 {
        return Ok(None);
    }
    if line.len() > MAX_MCP_STDIO_LINE_BYTES {
        return Err("MCP 本地进程返回内容超过 1MB".to_string());
    }
    Ok(Some(line))
}

fn apply_safe_child_environment(command: &mut Command) {
    command.env_clear();
    // MCP 服务默认只能继承启动与本地运行所需的基础环境。API Key、数据库连接、
    // Flux 自身令牌等必须由用户在该连接的 environment 中显式授权。
    const SAFE_KEYS: &[&str] = &[
        "PATH",
        "Path",
        "PATHEXT",
        "SystemRoot",
        "WINDIR",
        "COMSPEC",
        "HOME",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
    ];
    for key in SAFE_KEYS {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
}

fn wait_for_stdio_response(
    receiver: &mpsc::Receiver<Result<Value, String>>,
    id: u64,
    deadline: Instant,
    stderr: &Arc<Mutex<String>>,
) -> Result<Value, String> {
    loop {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .ok_or_else(|| format!("MCP 本地进程响应超时{}", stderr_detail(stderr)))?;
        let message = receiver
            .recv_timeout(remaining)
            .map_err(|error| match error {
                mpsc::RecvTimeoutError::Timeout => {
                    format!("MCP 本地进程响应超时{}", stderr_detail(stderr))
                }
                mpsc::RecvTimeoutError::Disconnected => {
                    format!("MCP 本地进程已结束{}", stderr_detail(stderr))
                }
            })??;
        let id_text = id.to_string();
        let matches_id = message.get("id").and_then(Value::as_u64) == Some(id)
            || message
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|value| value == id_text);
        if !matches_id {
            continue;
        }
        if let Some(error) = message.get("error") {
            let text = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("MCP 工具调用失败");
            return Err(text.to_string());
        }
        return message
            .get("result")
            .cloned()
            .ok_or_else(|| "MCP 响应缺少 result".to_string());
    }
}

fn run_mcp_stdio(input: McpStdioInput) -> Result<McpStdioOutput, String> {
    validate_mcp_stdio_input(&input)?;
    let timeout = if input.action == "call" {
        Duration::from_secs(60)
    } else {
        Duration::from_secs(15)
    };
    let deadline = Instant::now() + timeout;
    let mut command = Command::new(input.command.trim());
    apply_safe_child_environment(&mut command);
    command
        .args(&input.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = input.cwd.as_ref().filter(|value| !value.trim().is_empty()) {
        command.current_dir(cwd);
    }
    command.envs(&input.environment);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 MCP 本地进程：{error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法打开 MCP 进程输入".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 MCP 进程输出".to_string())?;
    let stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 MCP 进程错误输出".to_string())?;
    let stderr = Arc::new(Mutex::new(String::new()));
    let stderr_writer = Arc::clone(&stderr);
    thread::spawn(move || {
        let mut pipe = stderr_pipe;
        let mut buffer = [0_u8; 4_096];
        loop {
            match pipe.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    if let Ok(mut target) = stderr_writer.lock() {
                        let remaining = (MAX_MCP_STDERR_BYTES as usize).saturating_sub(target.len());
                        if remaining > 0 {
                            target.push_str(&String::from_utf8_lossy(
                                &buffer[..read.min(remaining)],
                            ));
                        }
                    }
                    // 即使展示缓冲区已满也持续 drain，避免子进程因 stderr 管道堵塞。
                }
            }
        }
    });
    let (sender, receiver) = mpsc::channel::<Result<Value, String>>();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_bounded_stdio_line(&mut reader) {
                Ok(None) => break,
                Ok(Some(line)) => {
                    if let Ok(message) = serde_json::from_slice::<Value>(&line) {
                        let _ = sender.send(Ok(message));
                    }
                }
                Err(error) => {
                    let _ = sender.send(Err(error));
                    break;
                }
            }
        }
    });

    let outcome = (|| {
        let initialize_id = 1_u64;
        send_stdio_message(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": initialize_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-11-25",
                    "capabilities": {},
                    "clientInfo": { "name": "Flux", "version": "0.1.0" }
                }
            }),
        )?;
        let initialized = wait_for_stdio_response(&receiver, initialize_id, deadline, &stderr)?;
        let protocol_version = initialized
            .get("protocolVersion")
            .and_then(Value::as_str)
            .unwrap_or("2025-11-25")
            .to_string();
        let server_info = initialized.get("serverInfo");
        let server_name = server_info
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::to_string);
        let server_version = server_info
            .and_then(|value| value.get("version"))
            .and_then(Value::as_str)
            .map(str::to_string);
        send_stdio_message(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }),
        )?;

        if input.action == "discover" {
            let mut tools = Vec::new();
            let mut cursor: Option<String> = None;
            for page in 0..10_u64 {
                let id = 2 + page;
                let mut request = json!({ "jsonrpc": "2.0", "id": id, "method": "tools/list" });
                if let Some(value) = cursor.as_ref() {
                    request["params"] = json!({ "cursor": value });
                }
                send_stdio_message(&mut stdin, &request)?;
                let result = wait_for_stdio_response(&receiver, id, deadline, &stderr)?;
                let page_tools = result
                    .get("tools")
                    .and_then(Value::as_array)
                    .ok_or_else(|| "MCP 服务返回了无效的工具目录".to_string())?;
                tools.extend(page_tools.iter().cloned());
                cursor = result
                    .get("nextCursor")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string);
                if cursor.is_none() {
                    break;
                }
            }
            tools.truncate(200);
            Ok(McpStdioOutput {
                protocol_version,
                server_name,
                server_version,
                tools,
                result: None,
            })
        } else {
            let id = 2_u64;
            let mut params = json!({
                "name": input.tool_name.unwrap_or_default(),
                "arguments": input.arguments.unwrap_or_else(|| json!({}))
            });
            if let Some(idempotency_key) = input.idempotency_key {
                params["_meta"] = json!({ "flux/idempotencyKey": idempotency_key });
            }
            send_stdio_message(
                &mut stdin,
                &json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": "tools/call",
                    "params": params
                }),
            )?;
            let result = wait_for_stdio_response(&receiver, id, deadline, &stderr)?;
            Ok(McpStdioOutput {
                protocol_version,
                server_name,
                server_version,
                tools: Vec::new(),
                result: Some(result),
            })
        }
    })();
    let _ = child.kill();
    let _ = child.wait();
    outcome
}

#[tauri::command]
async fn mcp_stdio_execute(request: McpStdioInput) -> Result<McpStdioOutput, String> {
    tauri::async_runtime::spawn_blocking(move || run_mcp_stdio(request))
        .await
        .map_err(|error| format!("MCP 本地进程任务失败：{error}"))?
}

fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("FLUX_DATA_DIR") {
        return Ok(PathBuf::from(dir).join("desktop"));
    }
    app.path()
        .app_data_dir()
        .map(|path| path.join("desktop"))
        .map_err(|error| error.to_string())
}

fn legacy_data_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/desktop")
}

fn ensure_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = resolve_data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_storage_key(key: &str) -> Result<&str, String> {
    if key.is_empty()
        || key.len() > 128
        || !key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err("存储键只能包含字母、数字、点号、连字符和下划线".to_string());
    }
    Ok(key)
}

fn storage_file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    Ok(ensure_data_dir(app)?.join(format!("{}.json", safe_storage_key(key)?)))
}

fn legacy_storage_file(key: &str) -> PathBuf {
    legacy_data_dir().join(format!("{key}.json"))
}

fn storage_sidecar(path: &PathBuf, suffix: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("storage.json");
    path.with_file_name(format!("{file_name}.{suffix}"))
}

#[tauri::command]
async fn http_request(request: HttpRequestInput) -> Result<HttpResponseOutput, String> {
    let url = reqwest::Url::parse(&request.url).map_err(|_| "接口地址无效".to_string())?;
    if !matches!(url.scheme(), "https" | "http") || url.username() != "" || url.password().is_some()
    {
        return Err("接口地址仅允许使用 HTTP 或 HTTPS，且不能包含账号信息".to_string());
    }
    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|_| "HTTP 请求方法无效".to_string())?;
    if !matches!(
        method,
        reqwest::Method::GET
            | reqwest::Method::POST
            | reqwest::Method::PUT
            | reqwest::Method::PATCH
            | reqwest::Method::DELETE
    ) {
        return Err("HTTP 请求方法未被允许".to_string());
    }

    let client = reqwest::Client::builder()
        // 不跟随重定向，避免认证请求头被带到连接可信根之外。
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(HTTP_REQUEST_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| "无法初始化安全 HTTP 客户端".to_string())?;
    let mut builder = client.request(method, url);
    for (name, value) in request.headers {
        let header_name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "HTTP 请求头名称无效".to_string())?;
        let header_value = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|_| "HTTP 请求头值无效".to_string())?;
        builder = builder.header(header_name, header_value);
    }
    if let Some(body) = request.body {
        if body.len() > 256 * 1024 {
            return Err("HTTP 请求 body 不能超过 256KB".to_string());
        }
        builder = builder.body(body);
    }

    let mut response = builder.send().await.map_err(|error| {
        if error.is_timeout() {
            "接口请求超时".to_string()
        } else {
            "接口请求失败".to_string()
        }
    })?;
    if response.content_length().unwrap_or(0) > MAX_HTTP_RESPONSE_BYTES as u64 {
        return Err("接口响应不能超过 1MB".to_string());
    }
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            let name = name.as_str().to_ascii_lowercase();
            matches!(
                name.as_str(),
                "content-type"
                    | "content-length"
                    | "etag"
                    | "last-modified"
                    | "mcp-session-id"
                    | "mcp-protocol-version"
                    | "www-authenticate"
            )
            .then(|| value.to_str().ok().map(|value| (name, value.to_string())))
            .flatten()
        })
        .collect::<BTreeMap<_, _>>();
    let mut bytes = Vec::with_capacity(
        response
            .content_length()
            .unwrap_or(0)
            .min(MAX_HTTP_RESPONSE_BYTES as u64) as usize,
    );
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "无法读取接口响应".to_string())?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_HTTP_RESPONSE_BYTES {
            return Err("接口响应不能超过 1MB".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body =
        String::from_utf8(bytes).map_err(|_| "接口响应不是 UTF-8 文本".to_string())?;
    Ok(HttpResponseOutput {
        status,
        headers,
        body,
    })
}

#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    let dir = ensure_data_dir(&app)?;
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        data_dir: dir.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn storage_read(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let _guard = STORAGE_LOCK
        .lock()
        .map_err(|_| "存储锁不可用".to_string())?;
    let path = storage_file(&app, &key)?;
    let backup = storage_sidecar(&path, "bak");
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(value) => return Ok(Some(value)),
            Err(primary_error) if !backup.exists() => return Err(primary_error.to_string()),
            Err(_) => {}
        }
    }
    if backup.exists() {
        return Ok(Some(fs::read_to_string(backup).map_err(|e| e.to_string())?));
    }
    let legacy = legacy_storage_file(&key);
    if legacy.exists() {
        let value = fs::read_to_string(legacy).map_err(|e| e.to_string())?;
        atomic_storage_write(&path, &value)?;
        return Ok(Some(value));
    }
    Ok(None)
}

fn atomic_storage_write(path: &PathBuf, value: &str) -> Result<(), String> {
    let temporary = storage_sidecar(&path, "tmp");
    let backup = storage_sidecar(&path, "bak");

    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    file.write_all(value.as_bytes())
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;

    if path.exists() {
        fs::copy(&path, &backup).map_err(|e| e.to_string())?;
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(&temporary, &path) {
        if backup.exists() {
            let _ = fs::copy(&backup, &path);
        }
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
fn storage_write(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let _guard = STORAGE_LOCK
        .lock()
        .map_err(|_| "存储锁不可用".to_string())?;
    let path = storage_file(&app, &key)?;
    atomic_storage_write(&path, &value)
}

#[tauri::command]
fn storage_remove(app: AppHandle, key: String) -> Result<(), String> {
    let _guard = STORAGE_LOCK
        .lock()
        .map_err(|_| "存储锁不可用".to_string())?;
    let path = storage_file(&app, &key)?;
    for candidate in [
        path.clone(),
        storage_sidecar(&path, "bak"),
        storage_sidecar(&path, "tmp"),
    ] {
        if candidate.exists() {
            fs::remove_file(candidate).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 已有实例运行时，聚焦主窗口而不是再开一个
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            app_info,
            storage_read,
            storage_write,
            storage_remove,
            http_request,
            mcp_stdio_execute
        ])
        .run(tauri::generate_context!())
        .expect("运行 Flux 桌面端失败");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn fixture_input(action: &str) -> McpStdioInput {
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test/fixtures/mcp-stdio-server.mjs");
        McpStdioInput {
            command: "node".to_string(),
            args: vec![fixture.to_string_lossy().into_owned()],
            cwd: None,
            environment: BTreeMap::new(),
            action: action.to_string(),
            tool_name: (action == "call").then(|| "echo".to_string()),
            arguments: (action == "call").then(|| json!({ "message": "hello" })),
            idempotency_key: (action == "call").then(|| "flux_test_key".to_string()),
        }
    }

    #[test]
    fn stdio_mcp_discovers_tools() {
        let output = run_mcp_stdio(fixture_input("discover")).expect("discover should succeed");
        assert_eq!(output.server_name.as_deref(), Some("Flux test MCP"));
        assert_eq!(output.tools.len(), 1);
        assert_eq!(
            output.tools[0].get("name").and_then(Value::as_str),
            Some("echo")
        );
    }

    #[test]
    fn stdio_mcp_calls_tools() {
        let output = run_mcp_stdio(fixture_input("call")).expect("call should succeed");
        let result = output.result.expect("result should exist");
        assert_eq!(
            result.pointer("/content/0/text").and_then(Value::as_str),
            Some("hello"),
        );
        assert_eq!(
            result
                .pointer("/structuredContent/idempotencyKey")
                .and_then(Value::as_str),
            Some("flux_test_key"),
        );
    }

    #[test]
    fn stdio_mcp_line_reader_rejects_oversized_messages_before_unbounded_growth() {
        let mut valid = BufReader::new(Cursor::new(b"{\"jsonrpc\":\"2.0\"}\n".to_vec()));
        assert!(read_bounded_stdio_line(&mut valid)
            .expect("valid line should be readable")
            .is_some());

        let mut oversized = vec![b'x'; MAX_MCP_STDIO_LINE_BYTES + 1];
        oversized.push(b'\n');
        let mut reader = BufReader::new(Cursor::new(oversized));
        assert_eq!(
            read_bounded_stdio_line(&mut reader).expect_err("oversized line must fail"),
            "MCP 本地进程返回内容超过 1MB",
        );
    }

    #[test]
    fn storage_keys_are_rejected_instead_of_colliding_after_sanitization() {
        assert_eq!(safe_storage_key("workflow-cache"), Ok("workflow-cache"));
        assert_eq!(safe_storage_key("flux.auth.tokens"), Ok("flux.auth.tokens"));
        assert!(safe_storage_key("workflow/cache").is_err());
        assert!(safe_storage_key("workflow_cache").is_ok());
        assert!(safe_storage_key("").is_err());
    }
}
