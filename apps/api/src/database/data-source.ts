import type { DataSourceOptions } from "typeorm";
import { UserEntity } from "./entities/user.entity";
import { UserIdentityEntity } from "./entities/user-identity.entity";
import { WorkflowEntity } from "./entities/workflow.entity";
import { WorkflowVersionEntity } from "./entities/workflow-version.entity";
import { ExecutionEntity } from "./entities/execution.entity";
import { ExecutionNodeRunEntity } from "./entities/execution-node-run.entity";
import { ExecutionLogEntity } from "./entities/execution-log.entity";
import { AiConnectionEntity } from "./entities/ai-connection.entity";
import { ExecutionEffectEntity } from "./entities/execution-effect.entity";
import { InitialSchema1785283200000 } from "./migrations/1785283200000-initial-schema";
import { ExecutionControl1785369600000 } from "./migrations/1785369600000-execution-control";
import { ExecutionEffects1785456000000 } from "./migrations/1785456000000-execution-effects";

export const entities = [
  UserEntity,
  UserIdentityEntity,
  WorkflowEntity,
  WorkflowVersionEntity,
  ExecutionEntity,
  ExecutionNodeRunEntity,
  ExecutionLogEntity,
  AiConnectionEntity,
  ExecutionEffectEntity,
];

export const migrations = [
  InitialSchema1785283200000,
  ExecutionControl1785369600000,
  ExecutionEffects1785456000000,
];

/**
 * 仅当配置了 DATABASE_URL 时启用 PostgreSQL；否则返回 null，
 * 应用退回工作区文件仓储（本地开发 / 无 DB 环境可直接运行）。
 */
export function buildDataSourceOptions(): DataSourceOptions | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const synchronize = process.env.DB_SYNCHRONIZE === "true";
  if (process.env.NODE_ENV === "production" && synchronize) {
    throw new Error(
      "生产环境禁止 DB_SYNCHRONIZE；请使用 pnpm --filter @flux/api migration:run",
    );
  }
  return {
    type: "postgres",
    url,
    entities,
    migrations,
    synchronize,
    logging: process.env.DB_LOGGING === "true",
  };
}
