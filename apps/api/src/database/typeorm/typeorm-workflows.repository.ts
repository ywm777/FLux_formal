import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource, type QueryDeepPartialEntity } from "typeorm";
import {
  WORKFLOW_STATUS,
  type WorkflowRecord,
  type WorkflowStatus,
  type WorkflowSummary,
} from "@flux/shared";
import { WorkflowEntity } from "../entities/workflow.entity";
import {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowsRepository,
  WorkflowVersionConflictError,
} from "../repositories/workflows.repository";

function toRecord(entity: WorkflowEntity): WorkflowRecord {
  return {
    id: entity.id,
    ownerId: entity.ownerId,
    workspaceId: entity.workspaceId,
    title: entity.title,
    tags: entity.tags ?? [],
    version: entity.version,
    status: entity.status,
    isFavorite: entity.isFavorite,
    shareId: entity.shareId ?? undefined,
    sharedAt: entity.sharedAt?.toISOString(),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    graph: entity.graph,
  };
}

function toSummary(entity: WorkflowEntity): WorkflowSummary {
  const { graph: _graph, ...summary } = toRecord(entity);
  return summary;
}

@Injectable()
export class TypeOrmWorkflowsRepository extends WorkflowsRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  private get repo() {
    return this.dataSource.getRepository(WorkflowEntity);
  }

  async create(input: CreateWorkflowInput): Promise<WorkflowRecord> {
    const entity = this.repo.create({
      id: input.id ?? randomUUID(),
      ownerId: input.ownerId,
      workspaceId: input.workspaceId,
      title: input.title,
      tags: input.tags ?? [],
      graph: input.graph,
      version: 1,
      status: WORKFLOW_STATUS.DRAFT,
      isFavorite: false,
    });
    await this.repo.save(entity);
    return toRecord(entity);
  }

  async findById(id: string): Promise<WorkflowRecord | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? toRecord(entity) : null;
  }

  async findByShareId(shareId: string): Promise<WorkflowRecord | null> {
    const entity = await this.repo.findOne({ where: { shareId } });
    return entity ? toRecord(entity) : null;
  }

  async listByOwner(ownerId: string): Promise<WorkflowSummary[]> {
    const rows = await this.repo.find({ where: { ownerId } });
    return rows.map(toSummary);
  }

  async listPublishedByOwner(ownerId: string): Promise<WorkflowSummary[]> {
    const rows = await this.repo.find({
      where: { ownerId, status: WORKFLOW_STATUS.PUBLISHED },
    });
    return rows.map(toSummary);
  }

  async listPublished(): Promise<WorkflowSummary[]> {
    const rows = await this.repo.find({
      where: { status: WORKFLOW_STATUS.PUBLISHED },
    });
    return rows.map(toSummary);
  }

  async update(
    id: string,
    patch: UpdateWorkflowInput,
  ): Promise<WorkflowRecord | null> {
    if (patch.expectedVersion !== undefined) {
      const changes: QueryDeepPartialEntity<WorkflowEntity> = {
        version: () => '"version" + 1',
      };
      if (patch.title !== undefined) changes.title = patch.title;
      if (patch.tags !== undefined) changes.tags = patch.tags;
      if (patch.graph !== undefined) changes.graph = patch.graph as never;

      const result = await this.repo
        .createQueryBuilder()
        .update(WorkflowEntity)
        .set(changes)
        .where('"id" = :id', { id })
        .andWhere('"version" = :expectedVersion', {
          expectedVersion: patch.expectedVersion,
        })
        .execute();

      if (!result.affected) {
        const current = await this.repo.findOne({ where: { id } });
        if (!current) return null;
        throw new WorkflowVersionConflictError(
          current.version,
          patch.expectedVersion,
        );
      }
      const updated = await this.repo.findOne({ where: { id } });
      return updated ? toRecord(updated) : null;
    }

    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    if (patch.title !== undefined) entity.title = patch.title;
    if (patch.tags !== undefined) entity.tags = patch.tags;
    if (patch.graph !== undefined) entity.graph = patch.graph;
    entity.version += 1;
    await this.repo.save(entity);
    return toRecord(entity);
  }

  async setStatus(
    id: string,
    status: WorkflowStatus,
  ): Promise<WorkflowRecord | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    entity.status = status;
    await this.repo.save(entity);
    return toRecord(entity);
  }

  async setFavorite(
    id: string,
    isFavorite: boolean,
  ): Promise<WorkflowRecord | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    entity.isFavorite = isFavorite;
    await this.repo.save(entity);
    return toRecord(entity);
  }

  async setShare(
    id: string,
    share: { shareId: string; sharedAt: string } | null,
  ): Promise<WorkflowRecord | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    entity.shareId = share?.shareId ?? null;
    entity.sharedAt = share ? new Date(share.sharedAt) : null;
    await this.repo.save(entity);
    return toRecord(entity);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return Boolean(result.affected);
  }
}
