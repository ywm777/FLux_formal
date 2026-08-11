import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { AiConnectionsService } from "./ai-connections.service";
import {
  AiProviderClient,
  AiProviderError,
  type ResolvedAiConnection,
} from "./ai-provider.client";

export interface AiCompletionResult {
  model: string;
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly connections: AiConnectionsService,
    private readonly provider: AiProviderClient,
  ) {}

  async complete(
    userId: string,
    input: {
      connectionId?: string;
      model?: string;
      prompt: string;
      maxTokens?: number;
    },
  ): Promise<AiCompletionResult> {
    const connection =
      (await this.connections.resolve(userId, input.connectionId)) ??
      this.legacyEnvironmentConnection();
    const model = input.model ?? connection.defaultModel;
    this.logger.log(
      `AI 请求 user=${userId} connection=${connection.id ?? "environment"} model=${model}`,
    );
    try {
      return await this.provider.complete(connection, {
        model,
        prompt: input.prompt,
        maxTokens: input.maxTokens,
      });
    } catch (error) {
      const message =
        error instanceof AiProviderError ? error.message : "AI 服务调用失败";
      const code =
        error instanceof AiProviderError ? error.code : "upstream_error";
      this.logger.warn(`AI 请求失败 user=${userId} code=${code}`);
      throw new BadGatewayException({ message, code });
    }
  }

  private legacyEnvironmentConnection(): ResolvedAiConnection {
    const proxyUrl = process.env.AI_PROXY_BASE_URL?.trim();
    const configuredProvider = process.env.AI_PROXY_PROVIDER?.trim();
    const provider = proxyUrl
      ? configuredProvider === "ollama" ||
        configuredProvider === "openai-compatible"
        ? configuredProvider
        : "openai-compatible"
      : "ollama";
    return {
      provider,
      baseUrl:
        proxyUrl ?? process.env.OLLAMA_URL?.trim() ?? "http://localhost:11434",
      defaultModel: process.env.AI_DEFAULT_MODEL?.trim() ?? "llama3",
      ...(process.env.AI_PROXY_API_KEY?.trim()
        ? { apiKey: process.env.AI_PROXY_API_KEY.trim() }
        : {}),
    };
  }
}
