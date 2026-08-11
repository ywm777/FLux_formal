import { Injectable } from "@nestjs/common";
import {
  AiConnectionsRepository,
  type AiConnectionRow,
  type CreateAiConnectionInput,
} from "../repositories/ai-connections.repository";
import { FileDb } from "./file-db";

function copy(row: AiConnectionRow): AiConnectionRow {
  return { ...row };
}

@Injectable()
export class FileAiConnectionsRepository extends AiConnectionsRepository {
  constructor(private readonly db: FileDb) {
    super();
  }

  async listByUser(userId: string): Promise<AiConnectionRow[]> {
    return this.db
      .get()
      .aiConnections.filter((row) => row.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(copy);
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<AiConnectionRow | null> {
    const row = this.db
      .get()
      .aiConnections.find((item) => item.id === id && item.userId === userId);
    return row ? copy(row) : null;
  }

  async findDefaultByUser(userId: string): Promise<AiConnectionRow | null> {
    const rows = await this.listByUser(userId);
    return rows.find((row) => row.status === "connected") ?? rows[0] ?? null;
  }

  async create(input: CreateAiConnectionInput): Promise<AiConnectionRow> {
    const now = new Date().toISOString();
    const row: AiConnectionRow = {
      ...input,
      encryptedApiKey: input.encryptedApiKey ?? null,
      status: "untested",
      errorMessage: null,
      lastTestedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.mutate((snapshot) => snapshot.aiConnections.push(row));
    return copy(row);
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
    let updated: AiConnectionRow | null = null;
    this.db.mutate((snapshot) => {
      const row = snapshot.aiConnections.find(
        (item) => item.id === id && item.userId === userId,
      );
      if (!row) return;
      row.status = result.status;
      row.errorMessage = result.errorMessage ?? null;
      row.lastTestedAt = result.lastTestedAt;
      row.updatedAt = result.lastTestedAt;
      updated = copy(row);
    });
    return updated;
  }

  async remove(id: string, userId: string): Promise<boolean> {
    let removed = false;
    this.db.mutate((snapshot) => {
      const before = snapshot.aiConnections.length;
      snapshot.aiConnections = snapshot.aiConnections.filter(
        (row) => row.id !== id || row.userId !== userId,
      );
      removed = snapshot.aiConnections.length < before;
    });
    return removed;
  }
}
