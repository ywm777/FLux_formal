import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import type { WorkflowStatus } from "@flux/shared";

@Entity({ name: "workflows" })
@Index(["ownerId"])
@Index(["shareId"], { unique: true })
export class WorkflowEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  ownerId!: string;

  @Column({ type: "uuid" })
  workspaceId!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "jsonb", default: () => "'[]'" })
  tags!: string[];

  /** 序列化的 WorkflowGraph（@flux/workflow-schema） */
  @Column({ type: "jsonb" })
  graph!: unknown;

  /** 乐观锁版本号，每次保存自增 */
  @Column({ type: "int", default: 1 })
  version!: number;

  @Column({ type: "varchar", length: 16, default: "draft" })
  status!: WorkflowStatus;

  @Column({ type: "boolean", default: false })
  isFavorite!: boolean;

  @Column({ type: "varchar", length: 64, nullable: true })
  shareId?: string | null;

  @Column({ type: "timestamptz", nullable: true })
  sharedAt?: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
