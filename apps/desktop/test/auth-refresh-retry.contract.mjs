import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const api = readFileSync(resolve(root, "src/lib/api.ts"), "utf8");

const refreshCall =
  api.match(/refresh:\s*\(refreshToken:[\s\S]*?\n\s*me:/)?.[0] ?? "";

if (!/request<AuthResult>\("\/auth\/refresh",[\s\S]*?\},\s*false\)/.test(refreshCall)) {
  console.error(
    "Auth refresh must disable automatic 401 retry so a rejected refresh token cannot recurse.",
  );
  process.exit(1);
}

console.log("Auth refresh retry contract passed.");
