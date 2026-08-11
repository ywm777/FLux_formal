import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  WORKFLOW_STATUS,
  type WorkflowRecord,
  type WorkflowStatus,
  type WorkflowSummary,
} from "@flux/shared";
import {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowsRepository,
  WorkflowVersionConflictError,
} from "../repositories/workflows.repository";

function toSummary(record: WorkflowRecord): WorkflowSummary {
  const { graph: _graph, ...summary } = record;
  return summary;
}

@Injectable()
export class InMemoryWorkflowsRepository extends WorkflowsRepository {
  private readonly store = new Map<string, WorkflowRecord>();

  async create(input: CreateWorkflowInput): Promise<WorkflowRecord> {
    const now = new Date().toISOString();
    const record: WorkflowRecord = {
      id: input.id ?? randomUUID(),
      ownerId: input.ownerId,
      workspaceId: input.workspaceId,
      title: input.title,
      tags: input.tags ?? [],
      version: 1,
      status: WORKFLOW_STATUS.DRAFT,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
      graph: input.graph,
    };
    this.store.set(record.id, record);
    return { ...record };
  }

  async findById(id: string): Promise<WorkflowRecord | null> {
    const record = this.store.get(id);
    return record ? { ...record } : null;
  }

  async findByShareId(shareId: string): Promise<WorkflowRecord | null> {
    const record = [...this.store.values()].find(
      (item) => item.shareId === shareId,
    );
    return record ? { ...record } : null;
  }

  async listByOwner(ownerId: string): Promise<WorkflowSummary[]> {
    return [...this.store.values()]
      .filter((record) => record.ownerId === ownerId)
      .map(toSummary);
  }

  async listPublishedByOwner(ownerId: string): Promise<WorkflowSummary[]> {
    return [...this.store.values()]
      .filter(
        (record) =>
          record.ownerId === ownerId &&
          record.status === WORKFLOW_STATUS.PUBLISHED,
      )
      .map(toSummary);
  }

  async listPublished(): Promise<WorkflowSummary[]> {
    return [...this.store.values()]
      .filter((record) => record.status === WORKFLOW_STATUS.PUBLISHED)
      .map(toSummary);
  }

  async update(
    id: string,
    patch: UpdateWorkflowInput,
  ): Promise<WorkflowRecord | null> {
    const record = this.store.get(id);
    if (!record) return null;
    if (
      patch.expectedVersion !== undefined &&
      patch.expectedVersion !== record.version
    ) {
      throw new WorkflowVersionConflictError(
        record.version,
        patch.expectedVersion,
      );
    }
    if (patch.title !== undefined) record.title = patch.title;
    if (patch.tags !== undefined) record.tags = patch.tags;
    if (patch.graph !== undefined) record.graph = patch.graph;
    record.version += 1;
    record.updatedAt = new Date().toISOString();
    return { ...record };
  }

  async setStatus(
    id: string,
    status: WorkflowStatus,
  ): Promise<WorkflowRecord | null> {
    const record = this.store.get(id);
    if (!record) return null;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    return { ...record };
  }

  async setFavorite(
    id: string,
    isFavorite: boolean,
  ): Promise<WorkflowRecord | null> {
    const record = this.store.get(id);
    if (!record) return null;
    record.isFavorite = isFavorite;
    return { ...record };
  }

  async setShare(
    id: string,
    share: { shareId: string; sharedAt: string } | null,
  ): Promise<WorkflowRecord | null> {
    const record = this.store.get(id);
    if (!record) return null;
    if (share) {
      record.shareId = share.shareId;
      record.sharedAt = share.sharedAt;
    } else {
      delete record.shareId;
      delete record.sharedAt;
    }
    return { ...record };
  }

  async remove(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
