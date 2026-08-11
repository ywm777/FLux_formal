export const AI_PROVIDERS = ["openai-compatible", "ollama"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_CONNECTION_STATUSES = [
  "untested",
  "connected",
  "unavailable",
] as const;
export type AiConnectionStatus = (typeof AI_CONNECTION_STATUSES)[number];

/** AI 连接的持久化记录。API Key 只能以 AES-GCM 密文进入仓储。 */
export interface AiConnectionRow {
  id: string;
  userId: string;
  label: string;
  provider: AiProvider;
  baseUrl: string;
  defaultModel: string;
  encryptedApiKey?: string | null;
  status: AiConnectionStatus;
  errorMessage?: string | null;
  lastTestedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiConnectionInput {
  id: string;
  userId: string;
  label: string;
  provider: AiProvider;
  baseUrl: string;
  defaultModel: string;
  encryptedApiKey?: string | null;
}

export abstract class AiConnectionsRepository {
  abstract listByUser(userId: string): Promise<AiConnectionRow[]>;
  abstract findByIdForUser(
    id: string,
    userId: string,
  ): Promise<AiConnectionRow | null>;
  abstract findDefaultByUser(userId: string): Promise<AiConnectionRow | null>;
  abstract create(input: CreateAiConnectionInput): Promise<AiConnectionRow>;
  abstract updateTestResult(
    id: string,
    userId: string,
    result: {
      status: Exclude<AiConnectionStatus, "untested">;
      errorMessage?: string | null;
      lastTestedAt: string;
    },
  ): Promise<AiConnectionRow | null>;
  abstract remove(id: string, userId: string): Promise<boolean>;
}
