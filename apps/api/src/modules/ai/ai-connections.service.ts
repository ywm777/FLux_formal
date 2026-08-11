import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AiConnectionsRepository,
  type AiConnectionRow,
  type AiConnectionStatus,
  type AiProvider,
} from "../../database/repositories/ai-connections.repository";
import { AiCredentialService } from "./ai-credential.service";
import {
  AiProviderClient,
  AiProviderError,
  type ResolvedAiConnection,
} from "./ai-provider.client";

export interface AiConnection {
  id: string;
  label: string;
  provider: AiProvider;
  baseUrl: string;
  defaultModel: string;
  hasApiKey: boolean;
  status: AiConnectionStatus;
  errorMessage?: string;
  lastTestedAt?: string;
  createdAt: string;
}

export interface CreateAiConnectionRequest {
  label: string;
  provider: AiProvider;
  baseUrl: string;
  defaultModel: string;
  apiKey?: string;
}

function encryptionContext(userId: string, connectionId: string): string {
  return `${userId}:${connectionId}`;
}

function toPublic(row: AiConnectionRow): AiConnection {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    hasApiKey: Boolean(row.encryptedApiKey),
    status: row.status,
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
    ...(row.lastTestedAt ? { lastTestedAt: row.lastTestedAt } : {}),
    createdAt: row.createdAt,
  };
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BadRequestException("Base URL 格式无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestException("Base URL 仅支持 HTTP 或 HTTPS");
  }
  if (url.username || url.password) {
    throw new BadRequestException("Base URL 不得包含用户名或密码");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function safeTestMessage(error: unknown): string {
  if (error instanceof AiProviderError) return error.message;
  return "连接测试失败，请检查地址、密钥和模型名称";
}

@Injectable()
export class AiConnectionsService {
  constructor(
    private readonly repository: AiConnectionsRepository,
    private readonly credentials: AiCredentialService,
    private readonly provider: AiProviderClient,
  ) {}

  async list(userId: string): Promise<AiConnection[]> {
    return (await this.repository.listByUser(userId)).map(toPublic);
  }

  async create(
    userId: string,
    input: CreateAiConnectionRequest,
  ): Promise<AiConnection> {
    const id = randomUUID();
    const label = input.label.trim();
    const defaultModel = input.defaultModel.trim();
    if (!label) throw new BadRequestException("连接名称不能为空");
    if (!defaultModel) throw new BadRequestException("默认模型不能为空");
    const apiKey = input.apiKey?.trim();
    const row = await this.repository.create({
      id,
      userId,
      label,
      provider: input.provider,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      defaultModel,
      encryptedApiKey: apiKey
        ? this.credentials.encrypt(apiKey, encryptionContext(userId, id))
        : null,
    });
    return toPublic(row);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const removed = await this.repository.remove(id, userId);
    if (!removed) throw new NotFoundException("AI 连接不存在");
    return { ok: true };
  }

  async test(userId: string, id: string): Promise<AiConnection> {
    const connection = await this.resolveRequired(userId, id);
    const testedAt = new Date().toISOString();
    let status: "connected" | "unavailable" = "connected";
    let errorMessage: string | null = null;
    try {
      await this.provider.complete(connection, {
        prompt: "Reply with OK.",
        maxTokens: 8,
      });
    } catch (error) {
      status = "unavailable";
      errorMessage = safeTestMessage(error);
    }
    const updated = await this.repository.updateTestResult(id, userId, {
      status,
      errorMessage,
      lastTestedAt: testedAt,
    });
    if (!updated) throw new NotFoundException("AI 连接不存在");
    return toPublic(updated);
  }

  async resolve(
    userId: string,
    connectionId?: string,
  ): Promise<ResolvedAiConnection | null> {
    const row = connectionId
      ? await this.repository.findByIdForUser(connectionId, userId)
      : await this.repository.findDefaultByUser(userId);
    if (!row) {
      if (connectionId) throw new NotFoundException("AI 连接不存在");
      return null;
    }
    return this.resolveRow(row);
  }

  private async resolveRequired(
    userId: string,
    connectionId: string,
  ): Promise<ResolvedAiConnection> {
    const connection = await this.resolve(userId, connectionId);
    if (!connection) throw new NotFoundException("AI 连接不存在");
    return connection;
  }

  private resolveRow(row: AiConnectionRow): ResolvedAiConnection {
    return {
      id: row.id,
      provider: row.provider,
      baseUrl: row.baseUrl,
      defaultModel: row.defaultModel,
      ...(row.encryptedApiKey
        ? {
            apiKey: this.credentials.decrypt(
              row.encryptedApiKey,
              encryptionContext(row.userId, row.id),
            ),
          }
        : {}),
    };
  }
}
