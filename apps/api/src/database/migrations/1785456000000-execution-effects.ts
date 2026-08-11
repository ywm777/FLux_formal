import type { MigrationInterface, QueryRunner } from "typeorm";

/** Durable journal for capability side effects; payloads are intentionally omitted. */
export class ExecutionEffects1785456000000 implements MigrationInterface {
  name = "ExecutionEffects1785456000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "execution_effects" (
        "id" varchar(80) PRIMARY KEY,
        "execution_id" uuid NOT NULL REFERENCES "executions"("id") ON DELETE CASCADE,
        "node_id" varchar(128) NOT NULL,
        "binding_id" varchar(256) NOT NULL,
        "action" varchar(128) NOT NULL,
        "attempt" integer NOT NULL,
        "invocation_index" integer NOT NULL,
        "status" varchar(16) NOT NULL,
        "result" jsonb,
        "error" varchar(1024),
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "CHK_execution_effects_status"
          CHECK ("status" IN ('pending', 'completed', 'failed')),
        CONSTRAINT "CHK_execution_effects_attempt" CHECK ("attempt" >= 1),
        CONSTRAINT "CHK_execution_effects_invocation_index" CHECK ("invocation_index" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_execution_effects_execution_id" ON "execution_effects" ("execution_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "execution_effects"`);
  }
}
