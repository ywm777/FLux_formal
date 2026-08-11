import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import type { ExecutionStatus } from "@flux/shared";
import type { ExecutionCheckpoint } from "@flux/workflow-runtime";
import type { ExecutionControlMode } from "../repositories/executions.repository";

@Entity({ name: "executions" })
@Index(["workflowId"])
@Index(["ownerId"])
export class ExecutionEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  workflowId!: string;

  @Column({ type: "uuid" })
  ownerId!: string;

  @Column({ type: "varchar", length: 16, default: "running" })
  status!: ExecutionStatus;

  @Column({ type: "jsonb", default: () => "'[]'" })
  order!: string[];

  // Nullable keeps legacy rows readable; all newly created executions require it.
  @Column({ name: "graph_snapshot", type: "jsonb", nullable: true })
  graphSnapshot?: unknown | null;

  @Column({ type: "jsonb", nullable: true })
  checkpoint?: ExecutionCheckpoint | null;

  @Column({ name: "control_mode", type: "varchar", length: 16, nullable: true })
  controlMode?: ExecutionControlMode | null;

  @Column({ name: "control_requested_at", type: "timestamptz", nullable: true })
  controlRequestedAt?: Date | null;

  @Column({ name: "worker_token", type: "varchar", length: 64, nullable: true })
  workerToken?: string | null;

  @Column({ name: "lease_until", type: "timestamptz", nullable: true })
  leaseUntil?: Date | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  error?: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  startedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  finishedAt?: Date | null;
}
