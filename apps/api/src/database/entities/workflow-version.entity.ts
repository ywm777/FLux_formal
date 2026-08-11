import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

/** 工作流快照：每次发布或显式存档时写入一条，用于回滚与审计 */
@Entity({ name: "workflow_versions" })
@Index(["workflowId", "version"], { unique: true })
export class WorkflowVersionEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  workflowId!: string;

  @Column({ type: "int" })
  version!: number;

  @Column({ type: "jsonb" })
  graph!: unknown;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
