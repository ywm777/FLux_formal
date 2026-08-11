/* eslint-disable no-console */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadGatewayException, NotFoundException } from "@nestjs/common";
import { FileAiConnectionsRepository } from "../../database/file/file-ai-connections.repository";
import { FileDb } from "../../database/file/file-db";
import { AiConnectionsService } from "./ai-connections.service";
import { AiCredentialService } from "./ai-credential.service";
import { AiProviderClient, AiProviderError } from "./ai-provider.client";
import { AiService } from "./ai.service";

async function main(): Promise<void> {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPrivateNetworkSetting = process.env.AI_ALLOW_PRIVATE_NETWORKS;
  const originalMaxResponseBytes = process.env.AI_MAX_RESPONSE_BYTES;
  const dataDir = await mkdtemp(join(tmpdir(), "flux-ai-smoke-"));
  process.env.FLUX_DATA_DIR = dataDir;
  process.env.AI_CREDENTIAL_ENCRYPTION_KEY =
    "smoke-test-only-credential-encryption-key";

  let requestCount = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requestCount += 1;
      if (request.url === "/redirect/chat/completions") {
        assert.equal(request.headers.authorization, "Bearer top-secret-key");
        response.writeHead(302, { Location: "/v1/chat/completions" });
        response.end();
        return;
      }
      if (request.url === "/api/generate") {
        assert.equal(request.headers.authorization, "Bearer top-secret-key");
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          model: string;
          prompt: string;
        };
        assert.ok(body.prompt);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            model: body.model,
            response: "真实 Ollama 响应",
            prompt_eval_count: 3,
            eval_count: 2,
          }),
        );
        return;
      }
      assert.equal(request.url, "/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer top-secret-key");
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        model: string;
        messages: Array<{ content: string }>;
      };
      assert.ok(body.messages[0]?.content);
      if (body.model === "missing-model") {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "not found" }));
        return;
      }
      if (body.model === "oversized-model") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.write(JSON.stringify({ choices: [{ message: { content: "" } }] }).slice(0, -5));
        response.end(`${"x".repeat(2048)}"}}]}`);
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          model: body.model,
          choices: [{ message: { content: "真实模型响应" } }],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        }),
      );
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;

    const repository = new FileAiConnectionsRepository(new FileDb());
    const credentials = new AiCredentialService();
    const provider = new AiProviderClient();

    process.env.NODE_ENV = "production";
    delete process.env.AI_ALLOW_PRIVATE_NETWORKS;
    await assert.rejects(
      () =>
        provider.complete(
          {
            provider: "openai-compatible",
            baseUrl,
            apiKey: "top-secret-key",
            defaultModel: "test-model",
          },
          { prompt: "不得访问私网" },
        ),
      (error: unknown) =>
        error instanceof AiProviderError && error.code === "unsafe_target",
    );
    await assert.rejects(
      () =>
        provider.complete(
          {
            provider: "openai-compatible",
            baseUrl: `http://[::ffff:7f00:1]:${address.port}/v1`,
            apiKey: "top-secret-key",
            defaultModel: "test-model",
          },
          { prompt: "不得通过 IPv4-mapped IPv6 绕过私网限制" },
        ),
      (error: unknown) =>
        error instanceof AiProviderError && error.code === "unsafe_target",
    );
    assert.equal(requestCount, 0, "被 SSRF 策略拒绝的请求不得到达上游");

    process.env.AI_ALLOW_PRIVATE_NETWORKS = "true";
    await assert.rejects(
      () =>
        provider.complete(
          {
            provider: "openai-compatible",
            baseUrl: `http://127.0.0.1:${address.port}/redirect`,
            apiKey: "top-secret-key",
            defaultModel: "test-model",
          },
          { prompt: "不得跟随重定向" },
        ),
      (error: unknown) =>
        error instanceof AiProviderError && error.code === "unreachable",
    );
    assert.equal(requestCount, 1, "AI 请求不得跟随可能泄露凭证的重定向");

    process.env.AI_MAX_RESPONSE_BYTES = "1024";
    await assert.rejects(
      () =>
        provider.complete(
          {
            provider: "openai-compatible",
            baseUrl,
            apiKey: "top-secret-key",
            defaultModel: "oversized-model",
          },
          { prompt: "拒绝超大响应" },
        ),
      (error: unknown) =>
        error instanceof AiProviderError && error.code === "response_too_large",
    );
    delete process.env.AI_MAX_RESPONSE_BYTES;

    const connections = new AiConnectionsService(
      repository,
      credentials,
      provider,
    );
    const ai = new AiService(connections, provider);

    const created = await connections.create("user-a", {
      label: "测试 OpenAI 兼容连接",
      provider: "openai-compatible",
      baseUrl: `${baseUrl}/`,
      defaultModel: "test-model",
      apiKey: "top-secret-key",
    });
    assert.equal(created.status, "untested");
    assert.equal(created.hasApiKey, true);
    assert.equal(created.baseUrl, baseUrl);
    assert.equal("apiKey" in created, false);
    assert.equal("encryptedApiKey" in created, false);
    assert.equal(JSON.stringify(created).includes("top-secret-key"), false);

    const raw = await repository.findByIdForUser(created.id, "user-a");
    const encryptedApiKey = raw?.encryptedApiKey;
    if (!encryptedApiKey) throw new Error("API Key 未加密持久化");
    assert.ok(encryptedApiKey.startsWith("v1."));
    assert.equal(encryptedApiKey.includes("top-secret-key"), false);
    const persisted = await readFile(join(dataDir, "api", "db.json"), "utf8");
    assert.equal(persisted.includes("top-secret-key"), false);

    const reloadedRepository = new FileAiConnectionsRepository(new FileDb());
    const reloadedConnections = new AiConnectionsService(
      reloadedRepository,
      credentials,
      provider,
    );
    assert.equal((await reloadedConnections.list("user-a")).length, 1);

    const tested = await connections.test("user-a", created.id);
    assert.equal(tested.status, "connected");
    assert.ok(tested.lastTestedAt);
    assert.equal("errorMessage" in tested, false);

    const explicit = await ai.complete("user-a", {
      connectionId: created.id,
      prompt: "你好",
      maxTokens: 12,
    });
    assert.equal(explicit.text, "真实模型响应");
    assert.deepEqual(explicit.usage, {
      promptTokens: 4,
      completionTokens: 2,
    });

    const usingDefault = await ai.complete("user-a", { prompt: "默认连接" });
    assert.equal(usingDefault.model, "test-model");

    const ollama = await connections.create("user-ollama", {
      label: "测试 Ollama 连接",
      provider: "ollama",
      baseUrl: `http://127.0.0.1:${address.port}`,
      defaultModel: "qwen-test",
      apiKey: "top-secret-key",
    });
    const ollamaResult = await ai.complete("user-ollama", {
      connectionId: ollama.id,
      prompt: "你好 Ollama",
    });
    assert.equal(ollamaResult.text, "真实 Ollama 响应");
    assert.deepEqual(ollamaResult.usage, {
      promptTokens: 3,
      completionTokens: 2,
    });
    await assert.rejects(
      () => connections.resolve("user-b", created.id),
      NotFoundException,
    );

    const unavailable = await connections.create("user-a", {
      label: "错误模型",
      provider: "openai-compatible",
      baseUrl,
      defaultModel: "missing-model",
      apiKey: "top-secret-key",
    });
    const failedTest = await connections.test("user-a", unavailable.id);
    assert.equal(failedTest.status, "unavailable");
    assert.equal(failedTest.errorMessage, "模型或接口地址不存在");
    assert.equal(JSON.stringify(failedTest).includes("top-secret-key"), false);

    const olderUnavailable = await connections.create("user-default", {
      label: "较早但不可用",
      provider: "openai-compatible",
      baseUrl,
      defaultModel: "missing-model",
      apiKey: "top-secret-key",
    });
    const newerConnected = await connections.create("user-default", {
      label: "较新且可用",
      provider: "openai-compatible",
      baseUrl,
      defaultModel: "test-model",
      apiKey: "top-secret-key",
    });
    const testedAt = new Date().toISOString();
    await repository.updateTestResult(olderUnavailable.id, "user-default", {
      status: "unavailable",
      errorMessage: "模型不可用",
      lastTestedAt: testedAt,
    });
    await repository.updateTestResult(newerConnected.id, "user-default", {
      status: "connected",
      errorMessage: null,
      lastTestedAt: testedAt,
    });
    assert.equal(
      (await connections.resolve("user-default"))?.id,
      newerConnected.id,
      "默认调用应优先选择最早的已连接服务",
    );

    await assert.rejects(
      () =>
        ai.complete("user-a", {
          connectionId: unavailable.id,
          prompt: "不能返回 mock",
        }),
      BadGatewayException,
    );

    assert.equal(requestCount, 8);
    assert.deepEqual(await connections.remove("user-a", created.id), {
      ok: true,
    });
    await assert.rejects(
      () => connections.remove("user-a", created.id),
      NotFoundException,
    );
    console.log("✅ AI 连接、加密、持久化与补全 smoke 全部通过");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalPrivateNetworkSetting === undefined) {
      delete process.env.AI_ALLOW_PRIVATE_NETWORKS;
    } else {
      process.env.AI_ALLOW_PRIVATE_NETWORKS = originalPrivateNetworkSetting;
    }
    if (originalMaxResponseBytes === undefined) {
      delete process.env.AI_MAX_RESPONSE_BYTES;
    } else {
      process.env.AI_MAX_RESPONSE_BYTES = originalMaxResponseBytes;
    }
  }
}

void main();
