import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const api = readFileSync(resolve(root, "src/lib/api.ts"), "utf8");
const store = readFileSync(resolve(root, "src/store/authStore.ts"), "utf8");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const dialog = readFileSync(
  resolve(root, "src/features/auth/AccountSettingsDialog.tsx"),
  "utf8",
);
const login = readFileSync(resolve(root, "src/features/auth/LoginView.tsx"), "utf8");

const requirements = [
  [
    "account API exposes profile, password, and session endpoints",
    /updateProfile:[\s\S]*\/auth\/me[\s\S]*method: "PATCH"[\s\S]*changePassword:[\s\S]*\/auth\/password[\s\S]*revokeOtherSessions:[\s\S]*\/auth\/sessions\/revoke-other/,
    api,
  ],
  [
    "auth store applies returned users and rotated credentials",
    /async updateProfile[\s\S]*set\(\{ user \}\)[\s\S]*async changePassword[\s\S]*applyResult[\s\S]*async revokeOtherSessions[\s\S]*applyResult/,
    store,
  ],
  [
    "avatar menu and command palette open the same account settings surface",
    /id: "account-settings"[\s\S]*showAccountSettings\(\)[\s\S]*aria-label="账户设置"[\s\S]*onClick=\{showAccountSettings\}[\s\S]*<AccountSettingsDialog/,
    titleBar,
  ],
  [
    "account dialog is modal, keyboard dismissible, and traps focus",
    (source) =>
      /role="dialog"/.test(source) &&
      /aria-modal="true"/.test(source) &&
      /event\.key === "Escape"/.test(source) &&
      /event\.key !== "Tab"/.test(source) &&
      /querySelectorAll<HTMLElement>/.test(source),
    dialog,
  ],
  [
    "account dialog supports profile, password, identities, and other-session revocation",
    (source) =>
      /个人资料/.test(source) &&
      /登录与安全/.test(source) &&
      /updateProfile\(name\)/.test(source) &&
      /changePassword\(currentPassword, newPassword\)/.test(source) &&
      /revokeOtherSessions\(\)/.test(source),
    dialog,
  ],
  [
    "registration requires password confirmation before API submission",
    /tab === "register" && password !== confirmPassword[\s\S]*两次输入的密码不一致[\s\S]*id="confirmPassword"/,
    login,
  ],
  [
    "account UI does not expose raw authentication tokens",
    (source) => !/(accessToken|refreshToken|authVersion)/.test(source),
    dialog,
  ],
];

const missing = requirements
  .filter(([, requirement, source]) =>
    typeof requirement === "function"
      ? !requirement(source)
      : !requirement.test(source),
  )
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} account management requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Account management contract passed.");
