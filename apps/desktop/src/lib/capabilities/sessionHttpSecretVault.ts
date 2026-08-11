/**
 * 敏感值故意不持久化。它们只存在于当前渲染进程内存中，页面重载或应用重启后自动失效。
 */
const secrets = new Map<string, string>();

export const sessionHttpSecretVault = {
  has(connectionId: string): boolean {
    return secrets.has(connectionId);
  },

  set(connectionId: string, secret: string): void {
    const normalized = secret.trim();
    if (!normalized) {
      secrets.delete(connectionId);
      return;
    }
    secrets.set(connectionId, normalized);
  },

  require(connectionId: string): string {
    const value = secrets.get(connectionId);
    if (!value) {
      throw new Error("此接口连接需要在本次会话中填写密钥");
    }
    return value;
  },

  remove(connectionId: string): void {
    secrets.delete(connectionId);
  },
};
