import { Column, Entity, Index, PrimaryColumn } from "typeorm";
import type { NodeRunStatus } from "@flux/shared";

@Entity({ name: "execution_node_runs" })
@Index(["executionId", "nodeId"], { unique: true })
export class ExecutionNodeRunEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  executionId!: string;

  @Column({ type: "varchar", length: 128 })
  nodeId!: string;

  @Column({ type: "varchar", length: 128 })
  type!: string;

  @Column({ type: "varchar", length: 16 })
  status!: NodeRunStatus;

  @Column({ type: "jsonb", nullable: true })
  outputs?: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  error?: string | null;
}
