import type { MigrationInterface, QueryRunner } from "typeorm";

/** Adds the durable cancel/pause control plane used by every worker process. */
export class ExecutionControl1785369600000 implements MigrationInterface {
  name = "ExecutionControl1785369600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "control_mode" varchar(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "control_requested_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "worker_token" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "lease_until" timestamptz`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "executions" DROP COLUMN IF EXISTS "lease_until"`,
    );
    await queryRunner.query(
      `ALTER TABLE "executions" DROP COLUMN IF EXISTS "worker_token"`,
    );
    await queryRunner.query(
      `ALTER TABLE "executions" DROP COLUMN IF EXISTS "control_requested_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "executions" DROP COLUMN IF EXISTS "control_mode"`,
    );
  }
}
