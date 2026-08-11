import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AiConnectionEntity } from "../entities/ai-connection.entity";
import {
  AiConnectionsRepository,
  type AiConnectionRow,
  type CreateAiConnectionInput,
} from "../repositories/ai-connections.repository";

function toRow(entity: AiConnectionEntity): AiConnectionRow {
  return {
    id: entity.id,
    userId: entity.userId,
    label: entity.label,
    provider: entity.provider,
    baseUrl: entity.baseUrl,
    defaultModel: entity.defaultModel,
    encryptedApiKey: entity.encryptedApiKey ?? null,
    status: entity.status,
    errorMessage: entity.errorMessage ?? null,
    lastTestedAt: entity.lastTestedAt?.toISOString() ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

@Injectable()
export class TypeOrmAiConnectionsRepository extends AiConnectionsRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  private get repository() {
    return this.dataSource.getRepository(AiConnectionEntity);
  }

  async listByUser(userId: string): Promise<AiConnectionRow[]> {
    const rows = await this.repository.find({
      where: { userId },
      order: { createdAt: "ASC" },
    });
    return rows.map(toRow);
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<AiConnectionRow | null> {
    const row = await this.repository.findOne({ where: { id, userId } });
    return row ? toRow(row) : null;
  }

  async findDefaultByUser(userId: string): Promise<AiConnectionRow | null> {
    const connected = await this.repository.findOne({
      where: { userId, status: "connected" },
      order: { createdAt: "ASC" },
    });
    if (connected) return toRow(connected);
    const row = await this.repository.findOne({
      where: { userId },
      order: { createdAt: "ASC" },
    });
    return row ? toRow(row) : null;
  }

  async create(input: CreateAiConnectionInput): Promise<AiConnectionRow> {
    const row = this.repository.create({
      ...input,
      encryptedApiKey: input.encryptedApiKey ?? null,
      status: "untested",
      errorMessage: null,
      lastTestedAt: null,
    });
    return toRow(await this.repository.save(row));
  }

  async updateTestResult(
    id: string,
    userId: string,
    result: {
      status: "connected" | "unavailable";
      errorMessage?: string | null;
      lastTestedAt: string;
    },
  ): Promise<AiConnectionRow | null> {
    const row = await this.repository.findOne({ where: { id, userId } });
    if (!row) return null;
    row.status = result.status;
    row.errorMessage = result.errorMessage ?? null;
    row.lastTestedAt = new Date(result.lastTestedAt);
    return toRow(await this.repository.save(row));
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }
}
