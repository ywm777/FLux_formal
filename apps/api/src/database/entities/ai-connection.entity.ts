import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import type {
  AiConnectionStatus,
  AiProvider,
} from "../repositories/ai-connections.repository";

@Entity({ name: "ai_connections" })
@Index(["userId"])
export class AiConnectionEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 120 })
  label!: string;

  @Column({ type: "varchar", length: 32 })
  provider!: AiProvider;

  @Column({ type: "varchar", length: 2048 })
  baseUrl!: string;

  @Column({ type: "varchar", length: 200 })
  defaultModel!: string;

  @Column({ type: "text", nullable: true })
  encryptedApiKey?: string | null;

  @Column({ type: "varchar", length: 24, default: "untested" })
  status!: AiConnectionStatus;

  @Column({ type: "varchar", length: 500, nullable: true })
  errorMessage?: string | null;

  @Column({ type: "timestamptz", nullable: true })
  lastTestedAt?: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
