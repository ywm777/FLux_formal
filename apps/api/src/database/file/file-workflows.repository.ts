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
import { FileDb } from "./file-db";

function toSummary(record: WorkflowRecord): WorkflowSummary {
  const { graph: _g, ...summary } = record;
  return summary;
}

@Injectable()
export class FileWorkflowsRepository extends WorkflowsRepository {
  constructor(private readonly db: FileDb) {
    super();
  }

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
    this.db.mutate((s) => s.workflows.push(record));
    return { ...record };
  }

  async findById(id: string): Promise<WorkflowRecord | null> {
    const record = this.db.get().workflows.find((w) => w.id === id);
    return record ? { ...record } : null;
  }

  async findByShareId(shareId: string): Promise<WorkflowRecord | null> {
    const record = this.db.get().workflows.find((w) => w.shareId === shareId);
    return record ? { ...record } : null;
  }

  async listByOwner(ownerId: string): Promise<WorkflowSummary[]> {
    return this.db
      .get()
      .workflows.filter((w) => w.ownerId === ownerId)
      .map(toSummary);
  }

  async listPublishedByOwner(ownerId: string): Promise<WorkflowSummary[]> {
    return this.db
      .get()
      .workflows.filter(
        (w) =>
          w.ownerId === ownerId && w.status === WORKFLOW_STATUS.PUBLISHED,
      )
      .map(toSummary);
  }

  async listPublished(): Promise<WorkflowSummary[]> {
    return this.db
      .get()
      .workflows.filter((w) => w.status === WORKFLOW_STATUS.PUBLISHED)
      .map(toSummary);
  }

  async update(
    id: string,
    patch: UpdateWorkflowInput,
  ): Promise<WorkflowRecord | null> {
    let updated: WorkflowRecord | null = null;
    this.db.mutate((s) => {
      const record = s.workflows.find((w) => w.id === id);
      if (!record) return;
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
      updated = { ...record };
    });
    return updated;
  }

  async setStatus(
    id: string,
    status: WorkflowStatus,
  ): Promise<WorkflowRecord | null> {
    let updated: WorkflowRecord | null = null;
    this.db.mutate((s) => {
      const record = s.workflows.find((w) => w.id === id);
      if (!record) return;
      record.status = status;
      record.updatedAt = new Date().toISOString();
      updated = { ...record };
    });
    return updated;
  }

  async setFavorite(
    id: string,
    isFavorite: boolean,
  ): Promise<WorkflowRecord | null> {
    let updated: WorkflowRecord | null = null;
    this.db.mutate((s) => {
      const record = s.workflows.find((w) => w.id === id);
      if (!record) return;
      record.isFavorite = isFavorite;
      updated = { ...record };
    });
    return updated;
  }

  async setShare(
    id: string,
    share: { shareId: string; sharedAt: string } | null,
  ): Promise<WorkflowRecord | null> {
    let updated: WorkflowRecord | null = null;
    this.db.mutate((s) => {
      const record = s.workflows.find((w) => w.id === id);
      if (!record) return;
      if (share) {
        record.shareId = share.shareId;
        record.sharedAt = share.sharedAt;
      } else {
        delete record.shareId;
        delete record.sharedAt;
      }
      updated = { ...record };
    });
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    let ok = false;
    this.db.mutate((s) => {
      const before = s.workflows.length;
      s.workflows = s.workflows.filter((w) => w.id !== id);
      ok = s.workflows.length < before;
    });
    return ok;
  }
}
