import { randomBytes } from "node:crypto";

type Environment = Record<string, string | undefined>;

const MIN_SECRET_BYTES = 32;
const MAX_TOKEN_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const INSECURE_SECRET_VALUES = new Set([
  "change-me-access",
  "change-me-refresh",
  "flux-dev-access-secret",
  "flux-dev-refresh-secret",
]);

export interface AuthTokenRuntimeConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  generatedDevelopmentSecrets: boolean;
}

function read(environment: Record<string, unknown>, key: string): string | undefined {
  const value = environment[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isProduction(environment: Record<string, unknown>): boolean {
  return read(environment, "NODE_ENV") === "production";
}

function validateProductionSecret(name: string, value: string | undefined): string {
  if (!value) throw new Error(`生产环境必须配置 ${name}`);
  if (
    Buffer.byteLength(value, "utf8") < MIN_SECRET_BYTES ||
    INSECURE_SECRET_VALUES.has(value)
  ) {
    throw new Error(`${name} 必须是至少 ${MIN_SECRET_BYTES} 字节的随机密钥`);
  }
  return value;
}

/**
 * JWT 的 expiresIn 对纯数字字符串按毫秒解释，而我们的环境变量按秒约定。
 * 这里统一解析为秒，避免配置 `900` 实际只签发 900ms 的令牌。
 */
export function parseTokenTtlSeconds(
  rawValue: string | undefined,
  fallbackSeconds: number,
  name: string,
): number {
  const value = rawValue?.trim();
  if (!value) return fallbackSeconds;
  const match = /^(\d+)([smhd])?$/i.exec(value);
  if (!match) {
    throw new Error(`${name} 必须是秒数或带 s/m/h/d 单位的时长`);
  }
  const amount = Number(match[1]);
  const multiplier =
    match[2]?.toLowerCase() === "m"
      ? 60
      : match[2]?.toLowerCase() === "h"
        ? 60 * 60
        : match[2]?.toLowerCase() === "d"
          ? 24 * 60 * 60
          : 1;
  const seconds = amount * multiplier;
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > MAX_TOKEN_TTL_SECONDS) {
    throw new Error(`${name} 超出允许范围`);
  }
  return seconds;
}

export function resolveAuthTokenRuntimeConfig(
  environment: Environment = process.env,
  generateSecret: () => string = () => randomBytes(48).toString("base64url"),
): AuthTokenRuntimeConfig {
  const production = isProduction(environment);
  const configuredAccess = read(environment, "JWT_ACCESS_SECRET");
  const configuredRefresh = read(environment, "JWT_REFRESH_SECRET");
  const accessSecret = production
    ? validateProductionSecret("JWT_ACCESS_SECRET", configuredAccess)
    : configuredAccess ?? generateSecret();
  const refreshSecret = production
    ? validateProductionSecret("JWT_REFRESH_SECRET", configuredRefresh)
    : configuredRefresh ?? generateSecret();

  if (accessSecret === refreshSecret) {
    throw new Error("JWT_ACCESS_SECRET 与 JWT_REFRESH_SECRET 必须使用不同密钥");
  }

  const accessTtlSeconds = parseTokenTtlSeconds(
    read(environment, "JWT_ACCESS_TTL") ?? read(environment, "JWT_ACCESS_TTL_SECONDS"),
    15 * 60,
    "JWT_ACCESS_TTL",
  );
  const refreshTtlSeconds = parseTokenTtlSeconds(
    read(environment, "JWT_REFRESH_TTL"),
    30 * 24 * 60 * 60,
    "JWT_REFRESH_TTL",
  );

  return {
    accessSecret,
    refreshSecret,
    accessTtlSeconds,
    refreshTtlSeconds,
    generatedDevelopmentSecrets: !production && (!configuredAccess || !configuredRefresh),
  };
}

export function mockAuthChannelsEnabled(
  environment: Record<string, unknown> = process.env,
): boolean {
  return !isProduction(environment) && read(environment, "AUTH_MOCK_CHANNELS") === "true";
}

export function validateAuthRuntimeEnvironment(
  environment: Record<string, unknown>,
): void {
  if (isProduction(environment)) {
    resolveAuthTokenRuntimeConfig(environment as Environment);
    if (read(environment, "AUTH_MOCK_CHANNELS") === "true") {
      throw new Error("生产环境禁止启用 AUTH_MOCK_CHANNELS");
    }
  }
}
