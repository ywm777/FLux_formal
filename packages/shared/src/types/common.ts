/** 通用标识与时间戳 */
export type ID = string;
export type ISODateString = string;

/** 资源默认归属（首期为个人空间，预留团队扩展） */
export interface Owned {
  workspaceId: ID;
  ownerId: ID;
}

/** 统一分页请求/响应 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 统一 API 错误结构 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };
