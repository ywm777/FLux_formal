import { validateAuthRuntimeEnvironment } from "../modules/auth/auth-runtime-config";

type Environment = Record<string, string | undefined>;

function read(environment: Record<string, unknown>, key: string): string | undefined {
  const value = environment[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isProduction(environment: Record<string, unknown>): boolean {
  return read(environment, "NODE_ENV") === "production";
}

export function validateRuntimeEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  validateAuthRuntimeEnvironment(environment);
  if (isProduction(environment) && read(environment, "DB_SYNCHRONIZE") === "true") {
    throw new Error("生产环境禁止启用 DB_SYNCHRONIZE，请使用数据库迁移");
  }
  if (isProduction(environment) && !read(environment, "DATABASE_URL")) {
    throw new Error("生产环境必须配置 DATABASE_URL；文件仓储仅支持单进程本地运行");
  }
  if (isProduction(environment) && read(environment, "CORS_ORIGINS") === "*") {
    throw new Error("生产环境的 CORS_ORIGINS 必须是明确的来源列表");
  }
  resolveApiPort(environment as Environment);
  return environment;
}

export function resolveApiPort(environment: Environment = process.env): number {
  const raw = environment.API_PORT?.trim() || "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("API_PORT 必须是 1-65535 之间的整数");
  }
  return port;
}

export function resolveCorsOrigins(environment: Environment = process.env): string[] | string {
  const configured = environment.CORS_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured?.length) {
    return configured.length === 1 && configured[0] === "*" ? "*" : [...new Set(configured)];
  }
  if (environment.NODE_ENV === "production") return [];
  return [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "tauri://localhost",
    "http://tauri.localhost",
  ];
}
