import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import {
  WORKFLOW_STATUS,
  type SharedWorkflow,
  type WorkflowRecord,
  type WorkflowShareInfo,
  type WorkflowSummary,
} from "@flux/shared";
import { safeParseGraph, type WorkflowGraph } from "@flux/workflow-schema";
import { NodeRegistry, builtinNodes } from "@flux/node-sdk";
import {
  WorkflowsRepository,
  WorkflowVersionConflictError,
} from "../../database/repositories/workflows.repository";
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
} from "./dto/workflow.dto";

// 保持 service 的既有导出路径，避免其他 API smoke/模块调用方需要迁移。
export { CreateWorkflowDto, UpdateWorkflowDto } from "./dto/workflow.dto";

const DEFAULT_WORKSPACE = "default";
const PRIVATE_CONFIG_KEYS = new Set([
  "apikey",
  "password",
  "secret",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "credential",
  "credentialid",
  "connectionid",
  "bindingid",
]);

@Injectable()
export class WorkflowsService {
  private readonly cloudNodeRegistry = new NodeRegistry();

  constructor(private readonly workflows: WorkflowsRepository) {
    this.cloudNodeRegistry.registerAll(builtinNodes);
  }

  async create(
    ownerId: string,
    dto: CreateWorkflowDto,
  ): Promise<WorkflowRecord> {
    return this.workflows.create({
      ownerId,
      workspaceId: DEFAULT_WORKSPACE,
      title: dto.title,
      tags: dto.tags,
      graph: this.normalizeGraph(dto.graph),
    });
  }

  listByOwner(ownerId: string): Promise<WorkflowSummary[]> {
    return this.workflows.listByOwner(ownerId);
  }

  /** 任务页：仅返回当前用户已发布的工作流 */
  listPublished(ownerId: string): Promise<WorkflowSummary[]> {
    return this.workflows.listPublishedByOwner(ownerId);
  }

  async toggleFavorite(
    ownerId: string,
    id: string,
    isFavorite: boolean,
  ): Promise<WorkflowRecord> {
    await this.getOwned(ownerId, id);
    const updated = await this.workflows.setFavorite(id, isFavorite);
    if (!updated) throw new NotFoundException("工作流不存在");
    return this.normalizeRecord(updated);
  }

  async getOwned(ownerId: string, id: string): Promise<WorkflowRecord> {
    const record = await this.workflows.findById(id);
    if (!record || record.ownerId !== ownerId) {
      throw new NotFoundException("工作流不存在");
    }
    return this.normalizeRecord(record);
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateWorkflowDto,
  ): Promise<WorkflowRecord> {
    const current = await this.getOwned(ownerId, id);
    const patch: UpdateWorkflowDto = {
      ...dto,
      graph: dto.graph === undefined
        ? current.graph
        : this.normalizeGraph(dto.graph),
    };
    let updated: WorkflowRecord | null;
    try {
      updated = await this.workflows.update(id, patch);
    } catch (error) {
      if (!(error instanceof WorkflowVersionConflictError)) throw error;
      throw new ConflictException({
        statusCode: 409,
        code: "WORKFLOW_VERSION_CONFLICT",
        message: error.message,
        currentVersion: error.currentVersion,
        expectedVersion: error.expectedVersion,
      });
    }
    if (!updated) throw new NotFoundException("工作流不存在");
    return this.normalizeRecord(updated);
  }

  async publish(ownerId: string, id: string): Promise<WorkflowRecord> {
    const current = await this.getOwned(ownerId, id);
    this.assertCloudExecutable(this.normalizeGraph(current.graph));
    const updated = await this.workflows.setStatus(
      id,
      WORKFLOW_STATUS.PUBLISHED,
    );
    if (!updated) throw new NotFoundException("工作流不存在");
    return this.normalizeRecord(updated);
  }

  async getShare(
    ownerId: string,
    id: string,
  ): Promise<WorkflowShareInfo | null> {
    const record = await this.getOwned(ownerId, id);
    return this.toShareInfo(record);
  }

  async enableShare(
    ownerId: string,
    id: string,
  ): Promise<WorkflowShareInfo> {
    const record = await this.getOwned(ownerId, id);
    const existing = this.toShareInfo(record);
    if (existing) return existing;

    const sharedAt = new Date().toISOString();
    const updated = await this.workflows.setShare(id, {
      shareId: randomBytes(24).toString("base64url"),
      sharedAt,
    });
    const share = updated && this.toShareInfo(updated);
    if (!share) throw new NotFoundException("工作流不存在");
    return share;
  }

  async disableShare(ownerId: string, id: string): Promise<{ ok: boolean }> {
    await this.getOwned(ownerId, id);
    const updated = await this.workflows.setShare(id, null);
    return { ok: Boolean(updated) };
  }

  async getShared(shareId: string): Promise<SharedWorkflow> {
    const record = await this.workflows.findByShareId(shareId);
    if (!record?.shareId) throw new NotFoundException("分享链接不存在或已失效");
    return {
      shareId: record.shareId,
      title: record.title,
      tags: record.tags,
      version: record.version,
      updatedAt: record.updatedAt,
      graph: this.sanitizeSharedGraph(this.normalizeGraph(record.graph)),
    };
  }

  async copyShared(ownerId: string, shareId: string): Promise<WorkflowRecord> {
    const source = await this.workflows.findByShareId(shareId);
    if (!source?.shareId) throw new NotFoundException("分享链接不存在或已失效");

    const id = randomUUID();
    const title = this.copyTitle(source.title);
    return this.workflows.create({
      id,
      ownerId,
      workspaceId: DEFAULT_WORKSPACE,
      title,
      tags: [...source.tags],
      graph: this.copyGraph(
        this.sanitizeSharedGraph(this.normalizeGraph(source.graph)),
        id,
        title,
      ),
    });
  }

  async remove(ownerId: string, id: string): Promise<{ ok: boolean }> {
    await this.getOwned(ownerId, id);
    const ok = await this.workflows.remove(id);
    return { ok };
  }

  private toShareInfo(record: WorkflowRecord): WorkflowShareInfo | null {
    if (!record.shareId || !record.sharedAt) return null;
    return {
      workflowId: record.id,
      shareId: record.shareId,
      sharedAt: record.sharedAt,
    };
  }

  private copyTitle(title: string): string {
    const suffix = " 副本";
    return `${title.slice(0, 200 - suffix.length)}${suffix}`;
  }

  private normalizeGraph(graph: unknown): WorkflowGraph {
    const parsed = safeParseGraph(graph);
    if (parsed.success) return parsed.data;
    throw new BadRequestException({
      code: "INVALID_WORKFLOW_GRAPH",
      message: "工作流图格式无效",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  private normalizeRecord(record: WorkflowRecord): WorkflowRecord {
    return {
      ...record,
      graph: this.normalizeGraph(record.graph),
    };
  }

  private assertCloudExecutable(graph: WorkflowGraph): void {
    const unsupported = [...new Set(
      graph.nodes
        .map((node) => node.type)
        .filter((type) => !this.cloudNodeRegistry.resolve(type)),
    )];
    if (unsupported.length > 0) {
      throw new BadRequestException({
        code: "UNSUPPORTED_CLOUD_NODE_TYPES",
        message: "工作流包含只能在本地运行的节点，暂时无法发布到云端",
        nodeTypes: unsupported,
      });
    }
  }

  private copyGraph(graph: unknown, id: string, title: string): unknown {
    const copy = structuredClone(graph);
    if (typeof copy !== "object" || copy === null || Array.isArray(copy)) {
      return copy;
    }
    const record = copy as Record<string, unknown>;
    record.id = id;
    if (
      typeof record.meta === "object" &&
      record.meta !== null &&
      !Array.isArray(record.meta)
    ) {
      record.meta = { ...record.meta, title };
    }
    return record;
  }

  private sanitizeSharedGraph(graph: unknown): unknown {
    const copy = structuredClone(graph);
    if (typeof copy !== "object" || copy === null || Array.isArray(copy)) {
      return copy;
    }
    const nodes = (copy as Record<string, unknown>).nodes;
    if (!Array.isArray(nodes)) return copy;
    for (const node of nodes) {
      if (typeof node !== "object" || node === null || Array.isArray(node)) continue;
      const data = (node as Record<string, unknown>).data;
      if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
      this.removePrivateConfig(data as Record<string, unknown>);
    }
    return copy;
  }

  private removePrivateConfig(value: Record<string, unknown>): void {
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (PRIVATE_CONFIG_KEYS.has(normalized)) {
        delete value[key];
        continue;
      }
      if (Array.isArray(nested)) {
        for (const item of nested) {
          if (typeof item === "object" && item !== null && !Array.isArray(item)) {
            this.removePrivateConfig(item as Record<string, unknown>);
          }
        }
      } else if (typeof nested === "object" && nested !== null) {
        this.removePrivateConfig(nested as Record<string, unknown>);
      }
    }
  }
}
