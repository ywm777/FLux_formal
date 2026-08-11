import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Idempotent baseline for installations that previously relied on synchronize.
 * CREATE/ADD IF NOT EXISTS lets an existing Flux database adopt the migration
 * chain while adding the execution snapshot/checkpoint columns safely.
 */
export class InitialSchema1785283200000 implements MigrationInterface {
  name = "InitialSchema1785283200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY,
        "displayName" varchar(120) NOT NULL,
        "avatarUrl" varchar(512),
        "passwordHash" varchar(255),
        "authVersion" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_identities" (
        "id" uuid PRIMARY KEY,
        "userId" uuid NOT NULL,
        "channel" varchar(16) NOT NULL,
        "externalId" varchar(320) NOT NULL,
        "verified" boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_identities_channel_external"
      ON "user_identities" ("channel", "externalId")
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "user_identities"
          ADD CONSTRAINT "FK_user_identities_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflows" (
        "id" uuid PRIMARY KEY,
        "ownerId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "graph" jsonb NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "status" varchar(16) NOT NULL DEFAULT 'draft',
        "isFavorite" boolean NOT NULL DEFAULT false,
        "shareId" varchar(64),
        "sharedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflows_owner" ON "workflows" ("ownerId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_workflows_share" ON "workflows" ("shareId")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_versions" (
        "id" uuid PRIMARY KEY,
        "workflowId" uuid NOT NULL,
        "version" integer NOT NULL,
        "graph" jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_workflow_versions_workflow_version"
      ON "workflow_versions" ("workflowId", "version")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "executions" (
        "id" uuid PRIMARY KEY,
        "workflowId" uuid NOT NULL,
        "ownerId" uuid NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'running',
        "order" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "graph_snapshot" jsonb,
        "checkpoint" jsonb,
        "error" varchar(1024),
        "startedAt" timestamptz NOT NULL DEFAULT now(),
        "finishedAt" timestamptz
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "graph_snapshot" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "checkpoint" jsonb`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_executions_workflow" ON "executions" ("workflowId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_executions_owner" ON "executions" ("ownerId")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "execution_node_runs" (
        "id" uuid PRIMARY KEY,
        "executionId" uuid NOT NULL,
        "nodeId" varchar(128) NOT NULL,
        "type" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL,
        "outputs" jsonb,
        "error" varchar(1024)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_execution_node_runs_execution_node"
      ON "execution_node_runs" ("executionId", "nodeId")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "execution_logs" (
        "seq" SERIAL PRIMARY KEY,
        "executionId" uuid NOT NULL,
        "nodeId" varchar(128) NOT NULL,
        "level" varchar(8) NOT NULL,
        "message" text NOT NULL,
        "at" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_execution_logs_execution" ON "execution_logs" ("executionId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_connections" (
        "id" uuid PRIMARY KEY,
        "userId" uuid NOT NULL,
        "label" varchar(120) NOT NULL,
        "provider" varchar(32) NOT NULL,
        "baseUrl" varchar(2048) NOT NULL,
        "defaultModel" varchar(200) NOT NULL,
        "encryptedApiKey" text,
        "status" varchar(24) NOT NULL DEFAULT 'untested',
        "errorMessage" varchar(500),
        "lastTestedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_connections_user" ON "ai_connections" ("userId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_connections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "execution_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "execution_node_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "executions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflows"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_identities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
