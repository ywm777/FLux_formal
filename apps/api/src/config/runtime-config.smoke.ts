/* eslint-disable no-console */
import assert from "node:assert/strict";
import { validateRuntimeEnvironment } from "./runtime-config";

const productionBase = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "https://flux.example.com",
};

function main(): void {
  assert.throws(
    () => validateRuntimeEnvironment(productionBase),
    /DATABASE_URL/,
    "production must not silently use a process-local file control plane",
  );
  assert.doesNotThrow(() =>
    validateRuntimeEnvironment({
      ...productionBase,
      DATABASE_URL: "postgresql://flux:secret@db.example.com/flux",
    }));
  console.log("✅ API runtime config smoke 全部通过");
}

main();
