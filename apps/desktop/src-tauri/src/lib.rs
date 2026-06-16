use serde::Serialize;

#[derive(Serialize)]
struct AppInfo {
    version: &'static str,
    platform: &'static str,
}

/// 暴露给渲染进程的受限命令（对应原 preload 暴露的 window.flux）。
/// 本地 SQLite、文件对话框等能力后续以独立 command 逐项暴露。
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("运行 Flux 桌面端失败");
}
