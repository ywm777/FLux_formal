const API = "http://localhost:3100/api";
let pass = 0;
let fail = 0;
function check(cond, label) {
  if (cond) {
    pass++;
    console.log("  ✅", label);
  } else {
    fail++;
    console.log("  ❌", label);
  }
}
async function call(path, opts = {}, token) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body };
}

const email = `user_${Date.now()}@flux.dev`;

console.log("· 注册");
const reg = await call("/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password: "supersecret", displayName: "HTTP Tester" }),
});
check(reg.status === 201 || reg.status === 200, "注册返回 2xx");
check(!!reg.body?.tokens?.accessToken, "返回 access token");
const access = reg.body.tokens.accessToken;
const refresh = reg.body.tokens.refreshToken;

console.log("· 校验弱密码被拒");
const weak = await call("/auth/register", {
  method: "POST",
  body: JSON.stringify({ email: `w_${Date.now()}@flux.dev`, password: "123" }),
});
check(weak.status === 400, "弱密码 400");

console.log("· /auth/me 需要令牌");
const noTok = await call("/auth/me");
check(noTok.status === 401, "无令牌 401");
const me = await call("/auth/me", {}, access);
check(me.status === 200 && me.body?.identities?.[0]?.channel === "email", "me 返回邮箱身份");

console.log("· workflow CRUD");
const noAuthList = await call("/workflows");
check(noAuthList.status === 401, "未授权列出 401");
const created = await call(
  "/workflows",
  { method: "POST", body: JSON.stringify({ title: "我的流程", graph: { id: "g1", version: 1, nodes: [], edges: [] } }) },
  access,
);
check(created.status === 201 && created.body?.status === "draft", "创建为 draft");
const wfId = created.body.id;
const updated = await call(
  `/workflows/${wfId}`,
  { method: "PATCH", body: JSON.stringify({ title: "改名", expectedVersion: 1 }) },
  access,
);
check(updated.status === 200 && updated.body?.version === 2, "更新后 version=2");
const conflict = await call(
  `/workflows/${wfId}`,
  { method: "PATCH", body: JSON.stringify({ title: "冲突", expectedVersion: 1 }) },
  access,
);
check(conflict.status >= 400, "过期版本被拒");
const published = await call(`/workflows/${wfId}/publish`, { method: "POST" }, access);
check(published.status === 201 && published.body?.status === "published", "发布成功");

console.log("· refresh");
const refreshed = await call("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: refresh }) });
check(refreshed.status >= 200 && !!refreshed.body?.tokens?.accessToken, "refresh 返回新令牌");

console.log("· 跨用户隔离");
const other = await call("/auth/register", {
  method: "POST",
  body: JSON.stringify({ email: `other_${Date.now()}@flux.dev`, password: "supersecret" }),
});
const otherAccess = other.body.tokens.accessToken;
const stolen = await call(`/workflows/${wfId}`, {}, otherAccess);
check(stolen.status === 404, "他人工作流不可见 (404)");

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
