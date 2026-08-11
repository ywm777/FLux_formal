import { Injectable } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { AiProvider } from "../../database/repositories/ai-connections.repository";

export interface ResolvedAiConnection {
  id?: string;
  provider: AiProvider;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
}

export interface ProviderCompletionInput {
  model?: string;
  prompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ProviderCompletionResult {
  model: string;
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "authentication_failed"
      | "model_not_found"
      | "timeout"
      | "unreachable"
      | "unsafe_target"
      | "upstream_error"
      | "invalid_response"
      | "response_too_large",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

const RESTRICTED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  RESTRICTED_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
RESTRICTED_ADDRESSES.addAddress("::", "ipv6");
RESTRICTED_ADDRESSES.addAddress("::1", "ipv6");
for (const [network, prefix] of [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const) {
  RESTRICTED_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

function privateNetworksAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.AI_ALLOW_PRIVATE_NETWORKS === "true"
  );
}

function isRestrictedAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return RESTRICTED_ADDRESSES.check(mapped[1], "ipv4");
  const family = isIP(address);
  if (family === 4) return RESTRICTED_ADDRESSES.check(address, "ipv4");
  if (family === 6) return RESTRICTED_ADDRESSES.check(address, "ipv6");
  return true;
}

async function assertSafeTarget(target: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new AiProviderError("AI 服务地址无效", "unsafe_target");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new AiProviderError("AI 服务地址不安全", "unsafe_target");
  }
  if (privateNetworksAllowed()) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new AiProviderError(
      "生产环境不允许连接本机或私有网络地址",
      "unsafe_target",
    );
  }

  let addresses: string[];
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    addresses = [hostname];
  } else {
    try {
      addresses = (await lookup(hostname, { all: true, verbatim: true })).map(
        (entry) => entry.address,
      );
    } catch {
      throw new AiProviderError("无法解析 AI 服务地址", "unreachable");
    }
  }
  if (addresses.length === 0 || addresses.some(isRestrictedAddress)) {
    throw new AiProviderError(
      "生产环境不允许连接本机或私有网络地址",
      "unsafe_target",
    );
  }
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function timeoutMs(): number {
  const configured = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30_000);
  if (!Number.isFinite(configured)) return 30_000;
  return Math.max(1_000, Math.min(120_000, Math.trunc(configured)));
}

function maxResponseBytes(): number {
  const configured = Number(process.env.AI_MAX_RESPONSE_BYTES ?? 2 * 1024 * 1024);
  if (!Number.isFinite(configured)) return 2 * 1024 * 1024;
  return Math.max(1024, Math.min(16 * 1024 * 1024, Math.trunc(configured)));
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const limit = maxResponseBytes();
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new AiProviderError(
      `AI 服务响应超过 ${limit} 字节上限`,
      "response_too_large",
    );
  }
  if (!response.body) {
    throw new AiProviderError("AI 服务返回了空响应", "invalid_response");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        throw new AiProviderError(
          `AI 服务响应超过 ${limit} 字节上限`,
          "response_too_large",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }

  try {
    return JSON.parse(Buffer.concat(chunks, received).toString("utf8")) as unknown;
  } catch {
    throw new AiProviderError("AI 服务返回了无效 JSON", "invalid_response");
  }
}

function upstreamError(status: number): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError("API Key 无效或没有模型访问权限", "authentication_failed");
  }
  if (status === 404) {
    return new AiProviderError("模型或接口地址不存在", "model_not_found");
  }
  return new AiProviderError(`AI 服务返回 HTTP ${status}`, "upstream_error");
}

function requestSignal(external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs());
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

function normalizeNetworkError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Error && error.name === "TimeoutError") {
    return new AiProviderError("连接 AI 服务超时", "timeout");
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new AiProviderError("AI 请求已取消或超时", "timeout");
  }
  return new AiProviderError("无法连接 AI 服务", "unreachable");
}

@Injectable()
export class AiProviderClient {
  async complete(
    connection: ResolvedAiConnection,
    input: ProviderCompletionInput,
  ): Promise<ProviderCompletionResult> {
    try {
      return connection.provider === "ollama"
        ? await this.completeOllama(connection, input)
        : await this.completeOpenAiCompatible(connection, input);
    } catch (error) {
      throw normalizeNetworkError(error);
    }
  }

  private async completeOpenAiCompatible(
    connection: ResolvedAiConnection,
    input: ProviderCompletionInput,
  ): Promise<ProviderCompletionResult> {
    const model = input.model ?? connection.defaultModel;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
    const target = endpoint(connection.baseUrl, "/chat/completions");
    await assertSafeTarget(target);
    const response = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: input.prompt }],
        max_tokens: input.maxTokens ?? 512,
        stream: false,
      }),
      signal: requestSignal(input.signal),
      redirect: "error",
    });
    if (!response.ok) throw upstreamError(response.status);
    const data = (await readBoundedJson(response)) as {
      model?: string;
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new AiProviderError("AI 服务响应中缺少文本内容", "invalid_response");
    }
    return {
      model: data.model ?? model,
      text: content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async completeOllama(
    connection: ResolvedAiConnection,
    input: ProviderCompletionInput,
  ): Promise<ProviderCompletionResult> {
    const model = input.model ?? connection.defaultModel;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
    const target = endpoint(connection.baseUrl, "/api/generate");
    await assertSafeTarget(target);
    const response = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        stream: false,
        options: { num_predict: input.maxTokens ?? 512 },
      }),
      signal: requestSignal(input.signal),
      redirect: "error",
    });
    if (!response.ok) throw upstreamError(response.status);
    const data = (await readBoundedJson(response)) as {
      model?: string;
      response?: unknown;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    if (typeof data.response !== "string") {
      throw new AiProviderError("Ollama 响应中缺少文本内容", "invalid_response");
    }
    return {
      model: data.model ?? model,
      text: data.response,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      },
    };
  }
}
