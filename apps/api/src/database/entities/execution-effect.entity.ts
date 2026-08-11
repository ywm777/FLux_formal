import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { ExecutionEntity } from "./execution.entity";

@Entity({ name: "execution_effects" })
@Index("IDX_execution_effects_execution_id", ["executionId"])
export class ExecutionEffectEntity {
  @PrimaryColumn({ type: "varchar", length: 80 })
  id!: string;

  @Column({ name: "execution_id", type: "uuid" })
  executionId!: string;

  @ManyToOne(() => ExecutionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "execution_id" })
  execution!: ExecutionEntity;

  @Column({ name: "node_id", type: "varchar", length: 128 })
  nodeId!: string;

  @Column({ name: "binding_id", type: "varchar", length: 256 })
  bindingId!: string;

  @Column({ type: "varchar", length: 128 })
  action!: string;

  @Column({ type: "integer" })
  attempt!: number;

  @Column({ name: "invocation_index", type: "integer" })
  invocationIndex!: number;

  @Column({ type: "varchar", length: 16 })
  status!: "pending" | "completed" | "failed";

  @Column({ type: "jsonb", nullable: true })
  result?: unknown | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  error?: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
