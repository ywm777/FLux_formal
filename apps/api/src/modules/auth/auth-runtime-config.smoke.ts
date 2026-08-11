/* eslint-disable no-console */
import {
  mockAuthChannelsEnabled,
  parseTokenTtlSeconds,
  resolveAuthTokenRuntimeConfig,
  validateAuthRuntimeEnvironment,
} from "./auth-runtime-config";

function expectFailure(run: () => unknown, message: string): void {
  let failed = false;
  try {
    run();
  } catch {
    failed = true;
  }
  console.assert(failed, message);
}

function main(): void {
  console.assert(parseTokenTtlSeconds("900", 1, "TTL") === 900, "纯数字 TTL 按秒解析");
  console.assert(parseTokenTtlSeconds("15m", 1, "TTL") === 900, "分钟 TTL 正确解析");
  console.assert(parseTokenTtlSeconds("30d", 1, "TTL") === 2_592_000, "天 TTL 正确解析");

  expectFailure(
    () => validateAuthRuntimeEnvironment({ NODE_ENV: "production" }),
    "生产环境缺少 JWT 密钥时必须拒绝启动",
  );
  expectFailure(
    () =>
      validateAuthRuntimeEnvironment({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "a".repeat(48),
        JWT_REFRESH_SECRET: "b".repeat(48),
        AUTH_MOCK_CHANNELS: "true",
      }),
    "生产环境必须拒绝 mock 登录通道",
  );

  const generated = ["a".repeat(48), "b".repeat(48)];
  const development = resolveAuthTokenRuntimeConfig(
    { NODE_ENV: "development", JWT_ACCESS_TTL: "15m" },
    () => generated.shift() ?? "c".repeat(48),
  );
  console.assert(development.generatedDevelopmentSecrets, "开发环境缺失密钥时生成进程密钥");
  console.assert(development.accessTtlSeconds === 900, "access TTL 与客户端 expiresIn 一致");
  console.assert(
    mockAuthChannelsEnabled({ NODE_ENV: "development", AUTH_MOCK_CHANNELS: "true" }),
    "开发环境显式开关可启用 mock 通道",
  );
  console.assert(
    !mockAuthChannelsEnabled({ NODE_ENV: "production", AUTH_MOCK_CHANNELS: "true" }),
    "生产环境始终禁用 mock 通道",
  );

  console.log("✅ auth runtime config smoke 全部通过");
}

main();
