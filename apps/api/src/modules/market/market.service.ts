import { Injectable, NotFoundException } from "@nestjs/common";
import { WorkflowsRepository } from "../../database/repositories/workflows.repository";

export interface MarketItem {
  id: string;
  title: string;
  ownerId: string;
  version: number;
  tags: string[];
  updatedAt: string;
}

@Injectable()
export class MarketService {
  /** workflowId → visibility */
  private readonly visibility = new Map<string, "private" | "public">();

  constructor(private readonly workflows: WorkflowsRepository) {}

  async listPublic(): Promise<MarketItem[]> {
    const published = await this.workflows.listPublished();
    return published
      .filter((w) => this.visibility.get(w.id) === "public")
      .map((w) => ({
        id: w.id,
        title: w.title,
        ownerId: w.ownerId,
        version: w.version,
        tags: w.tags,
        updatedAt: w.updatedAt,
      }));
  }

  async setVisibility(
    ownerId: string,
    id: string,
    visibility: "private" | "public",
  ) {
    const record = await this.workflows.findById(id);
    if (!record || record.ownerId !== ownerId) {
      throw new NotFoundException("工作流不存在");
    }
    this.visibility.set(id, visibility);
    return { id, visibility };
  }

  async fork(ownerId: string, sourceId: string) {
    const source = await this.workflows.findById(sourceId);
    if (!source) throw new NotFoundException("源工作流不存在");
    const forked = await this.workflows.create({
      ownerId,
      workspaceId: source.workspaceId,
      title: `${source.title} (Fork)`,
      tags: [...source.tags, "fork"],
      graph: structuredClone(source.graph),
    });
    return forked;
  }
}
