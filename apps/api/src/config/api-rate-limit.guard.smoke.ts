/* eslint-disable no-console */
import assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { ApiRateLimitGuard } from "./api-rate-limit.guard";

function context(path: string, address: string): ExecutionContext {
  const headers = new Map<string, string>();
  const request = {
    originalUrl: path,
    method: "POST",
    ip: address,
    socket: { remoteAddress: address },
  };
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function main(): void {
  const original = process.env.AUTH_RATE_LIMIT_PER_MINUTE;
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = "2";
  try {
    const guard = new ApiRateLimitGuard();
    assert.equal(guard.canActivate(context("/api/auth/email", "127.0.0.1")), true);
    assert.equal(guard.canActivate(context("/api/auth/email", "127.0.0.1")), true);
    assert.throws(
      () => guard.canActivate(context("/api/auth/email", "127.0.0.1")),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
    );
    assert.equal(
      guard.canActivate(context("/api/auth/email", "127.0.0.2")),
      true,
      "不同客户端不得共享同一个认证额度",
    );
    console.log("✅ API rate limit smoke 全部通过");
  } finally {
    if (original === undefined) delete process.env.AUTH_RATE_LIMIT_PER_MINUTE;
    else process.env.AUTH_RATE_LIMIT_PER_MINUTE = original;
  }
}

main();
