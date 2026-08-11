/* eslint-disable no-console */
import { JwtService } from "@nestjs/jwt";
import { InMemoryUsersRepository } from "../../database/memory/in-memory-users.repository";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";

async function main() {
  const users = new InMemoryUsersRepository();
  const tokens = new TokenService(new JwtService());
  const auth = new AuthService(users, tokens);

  const reg = await auth.register({
    email: "demo@flux.dev",
    password: "supersecret",
    displayName: "Demo",
  });
  console.assert(reg.tokens.accessToken.length > 10, "注册返回 access token");
  console.assert(reg.user.identities[0].channel === "email", "邮箱身份已建");

  let dup = false;
  try {
    await auth.register({ email: "DEMO@flux.dev", password: "supersecret" });
  } catch {
    dup = true;
  }
  console.assert(dup, "重复邮箱应拒绝");

  const login = await auth.loginEmail({
    email: " Demo@Flux.Dev ",
    password: "supersecret",
  });
  console.assert(login.user.id === reg.user.id, "登录返回同一用户");

  let badPwd = false;
  try {
    await auth.loginEmail({ email: "demo@flux.dev", password: "wrong" });
  } catch {
    badPwd = true;
  }
  console.assert(badPwd, "错误密码应拒绝");

  const refreshed = await auth.refresh(login.tokens.refreshToken);
  console.assert(
    refreshed.tokens.accessToken.length > 10,
    "refresh 返回新 access token",
  );

  const payload = await tokens.verifyAccess(refreshed.tokens.accessToken);
  console.assert(payload.sub === reg.user.id, "access token 校验通过");

  const profile = await auth.updateProfile(reg.user.id, {
    displayName: "  Flux 用户  ",
  });
  console.assert(profile.displayName === "Flux 用户", "资料更新并清理空格");

  let wrongCurrentPassword = false;
  try {
    await auth.changePassword(reg.user.id, {
      currentPassword: "wrong-current",
      newPassword: "new-supersecret",
    });
  } catch {
    wrongCurrentPassword = true;
  }
  console.assert(wrongCurrentPassword, "当前密码错误时拒绝修改");

  const changed = await auth.changePassword(reg.user.id, {
    currentPassword: "supersecret",
    newPassword: "new-supersecret",
  });
  console.assert(changed.user.displayName === "Flux 用户", "修改密码后保留账户资料");

  let staleRefreshRejected = false;
  try {
    await auth.refresh(login.tokens.refreshToken);
  } catch {
    staleRefreshRejected = true;
  }
  console.assert(staleRefreshRejected, "修改密码后旧 refresh token 失效");

  let oldPasswordRejected = false;
  try {
    await auth.loginEmail({
      email: "demo@flux.dev",
      password: "supersecret",
    });
  } catch {
    oldPasswordRejected = true;
  }
  console.assert(oldPasswordRejected, "修改密码后旧密码失效");

  const newLogin = await auth.loginEmail({
    email: "demo@flux.dev",
    password: "new-supersecret",
  });
  const keptSession = await auth.revokeOtherSessions(reg.user.id);
  console.assert(keptSession.user.id === reg.user.id, "撤销其他会话后保留当前账户");
  let revokedRefreshRejected = false;
  try {
    await auth.refresh(newLogin.tokens.refreshToken);
  } catch {
    revokedRefreshRejected = true;
  }
  console.assert(revokedRefreshRejected, "撤销其他会话后旧令牌失效");

  const wx = await auth.loginByChannel("wechat", "wx_abc", "微信用户");
  console.assert(wx.user.identities[0].channel === "wechat", "微信首登建号");

  console.log("✅ auth smoke 全部通过");
}

void main();
