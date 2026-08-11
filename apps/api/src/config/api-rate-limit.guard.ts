import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface RateBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

function readLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > 100_000) {
    throw new Error(`${name} 必须是 1-100000 之间的整数`);
  }
  return value;
}

function routeClass(request: Request): "auth" | "expensive" | "default" {
  const path = request.originalUrl.split("?", 1)[0] ?? "";
  if (/\/api\/auth\/(?:register|email|wechat|sms|refresh)$/.test(path)) {
    return "auth";
  }
  if (/\/api\/ai(?:\/|$)/.test(path)) return "expensive";
  if (
    request.method === "POST" &&
    /\/api\/(?:workflows\/[^/]+\/)?executions(?:\/|$)/.test(path)
  ) {
    return "expensive";
  }
  return "default";
}

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>();
  private readonly limits = {
    auth: readLimit("AUTH_RATE_LIMIT_PER_MINUTE", 20),
    expensive: readLimit("EXPENSIVE_RATE_LIMIT_PER_MINUTE", 60),
    default: readLimit("API_RATE_LIMIT_PER_MINUTE", 300),
  };

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const category = routeClass(request);
    const limit = this.limits[category];
    const client = request.socket.remoteAddress ?? request.ip ?? "unknown";
    const key = `${client}:${category}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.ensureCapacity(now, key);
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      this.buckets.set(key, bucket);
    }

    const remaining = Math.max(0, limit - bucket.count - 1);
    response.setHeader("X-RateLimit-Limit", String(limit));
    response.setHeader("X-RateLimit-Remaining", String(remaining));
    response.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      response.setHeader("Retry-After", String(retryAfter));
      throw new HttpException(
        { message: "请求过于频繁，请稍后重试", code: "RATE_LIMITED" },
        429,
      );
    }
    bucket.count += 1;
    return true;
  }

  private ensureCapacity(now: number, incomingKey: string): void {
    if (this.buckets.has(incomingKey) || this.buckets.size < MAX_BUCKETS) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    if (this.buckets.size < MAX_BUCKETS) return;
    const oldest = this.buckets.keys().next().value as string | undefined;
    if (oldest) this.buckets.delete(oldest);
  }
}
