import { ApiError } from "./api.js";

export function formatProductErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";

  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "无法连接服务，请检查网络或稍后重试。";
  }

  if (error instanceof ApiError) {
    if (error.status === 401) return "登录状态已失效，请重新登录。";
    if (error.status === 403) return "当前账号没有权限执行此操作。";
    if (error.status === 404) return "目标内容不存在或已被删除。";
    if (error.status === 409) return "内容已更新，请刷新后重试。";
    if (/HTTP 5\d\d/.test(`HTTP ${error.status}`)) {
      return "服务暂时不可用，请稍后重试。";
    }
  }

  if (/HTTP 401/i.test(message)) return "登录状态已失效，请重新登录。";
  if (/HTTP 403/i.test(message)) return "当前账号没有权限执行此操作。";
  if (/HTTP 404/i.test(message)) return "目标内容不存在或已被删除。";
  if (/HTTP 409/i.test(message)) return "内容已更新，请刷新后重试。";
  if (/HTTP 5\d\d/i.test(message)) return "服务暂时不可用，请稍后重试。";

  if (/timeout|timed out/i.test(message)) {
    return "请求超时，请稍后重试。";
  }

  return message || fallback;
}
