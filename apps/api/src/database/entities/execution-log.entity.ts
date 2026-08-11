import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "execution_logs" })
@Index(["executionId"])
export class ExecutionLogEntity {
  @PrimaryGeneratedColumn("increment")
  seq!: number;

  @Column({ type: "uuid" })
  executionId!: string;

  @Column({ type: "varchar", length: 128 })
  nodeId!: string;

  @Column({ type: "varchar", length: 8 })
  level!: "info" | "warn" | "error";

  @Column({ type: "text" })
  message!: string;

  @Column({ type: "timestamptz" })
  at!: Date;
}
