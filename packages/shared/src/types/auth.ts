import type { ID, ISODateString } from "./common.js";

/** 多渠道登录方式（微信 / 手机号 / 邮箱） */
export type AuthChannel = "wechat" | "phone" | "email";

export interface UserIdentity {
  channel: AuthChannel;
  /** 渠道侧唯一标识：openid / 手机号 / 邮箱 */
  externalId: string;
  verified: boolean;
}

export interface User {
  id: ID;
  displayName: string;
  avatarUrl?: string;
  identities: UserIdentity[];
  createdAt: ISODateString;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** access token 过期秒数 */
  expiresIn: number;
}
