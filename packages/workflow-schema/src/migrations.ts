import { CURRENT_WORKFLOW_SCHEMA_VERSION } from "./schema.js";

type WorkflowDocument = Record<string, unknown>;
type WorkflowMigration = (document: WorkflowDocument) => WorkflowDocument;

export class WorkflowSchemaMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowSchemaMigrationError";
  }
}

/**
 * Existing Flux graphs predate an explicit schemaVersion. They are legacy v0;
 * adding the root marker is lossless because all nested normalization remains
 * owned by the current Zod schema.
 */
const MIGRATIONS = new Map<number, WorkflowMigration>([
  [
    0,
    (document) => ({
      ...document,
      schemaVersion: 1,
    }),
  ],
  [
    1,
    (document) => ({
      ...document,
      schemaVersion: 2,
      nodes: Array.isArray(document.nodes)
        ? document.nodes.map((node) => {
            if (!isDocument(node) || !isDocument(node.ports)) return node;
            const ports = node.ports;
            return {
              ...node,
              ports: {
                ...ports,
                inputs: Array.isArray(ports.inputs)
                  ? ports.inputs.map((port) => isDocument(port)
                      ? { ...port, capacity: port.capacity === "many" ? "many" : "one" }
                      : port)
                  : ports.inputs,
                // v1 没有编辑入口来声明“单下游”，历史 one 都来自错误默认值。
                outputs: Array.isArray(ports.outputs)
                  ? ports.outputs.map((port) => isDocument(port)
                      ? { ...port, capacity: "many" }
                      : port)
                  : ports.outputs,
              },
            };
          })
        : document.nodes,
    }),
  ],
]);

function isDocument(input: unknown): input is WorkflowDocument {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function sourceVersion(document: WorkflowDocument): number {
  if (!("schemaVersion" in document)) return 0;
  const version = document.schemaVersion;
  if (!Number.isInteger(version) || (version as number) < 0) {
    throw new WorkflowSchemaMigrationError("工作流 schemaVersion 必须是非负整数");
  }
  return version as number;
}

/**
 * Applies each registered migration in order. Migration functions always
 * return a new root document and never mutate the caller's source value.
 */
export function migrateGraphDocument(input: unknown): unknown {
  if (!isDocument(input)) return input;

  let document = input;
  let version = sourceVersion(document);
  if (version > CURRENT_WORKFLOW_SCHEMA_VERSION) {
    throw new WorkflowSchemaMigrationError(
      `不支持工作流格式版本 v${version}，当前最高为 v${CURRENT_WORKFLOW_SCHEMA_VERSION}`,
    );
  }

  while (version < CURRENT_WORKFLOW_SCHEMA_VERSION) {
    const migrate = MIGRATIONS.get(version);
    if (!migrate) {
      throw new WorkflowSchemaMigrationError(
        `缺少工作流格式 v${version} 到 v${version + 1} 的迁移`,
      );
    }
    document = migrate(document);
    version = sourceVersion(document);
  }

  return document;
}
