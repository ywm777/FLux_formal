import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const loginView = readFileSync(
  resolve(root, "src/features/auth/LoginView.tsx"),
  "utf8",
);

const requirements = [
  [
    "login surface reuses the product brand mark",
    /<BrandMark size=\{40\} \/>/,
  ],
  [
    "login surface supports the implemented email login/register modes",
    /type Tab = "login" \| "register"[\s\S]*登录[\s\S]*注册/,
  ],
  [
    "login form captures email and password only for implemented auth",
    /<Field label="邮箱"[\s\S]*type="email"[\s\S]*<Field[\s\S]*label="密码"[\s\S]*type="password"/,
  ],
];

const forbidden = [
  [
    "login surface does not advertise unavailable auth channels",
    /即将上线|微信扫码|手机号登录/,
  ],
  [
    "login surface does not show prototype or roadmap wording",
    /coming soon|TODO|demo|演示|占位/i,
  ],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(loginView))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(loginView))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} login product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden login pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Login product contract passed.");
