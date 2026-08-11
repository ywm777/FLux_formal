import type {
  CustomNodeDraft,
  CustomNodeLifecycleState,
} from "@flux/node-sdk";

export interface CustomNodeTestResult {
  name: string;
  kind: "happy" | "boundary" | "error";
  passed: boolean;
  durationMs: number;
  message: string;
}

export interface CustomNodeTestReport {
  ranAt: string;
  passed: boolean;
  results: CustomNodeTestResult[];
}

export interface ActiveCustomNodeRevision {
  version: number;
  activatedAt: string;
  draft: CustomNodeDraft;
  /** 已发布版本绑定的真实连接。变更连接也必须发布新版本。 */
  bindings?: Record<string, string>;
}

/**
 * 用户节点包同时保存工作草案与已激活版本。
 * 编辑草案不会立即破坏画布中仍在使用的已激活版本。
 */
export interface CustomNodePackage {
  id: string;
  ownerNamespace: string;
  lifecycle: CustomNodeLifecycleState;
  draft: CustomNodeDraft;
  bindings: Record<string, string>;
  testReport?: CustomNodeTestReport;
  activeRevision?: ActiveCustomNodeRevision;
  createdAt: string;
  updatedAt: string;
}

export interface CustomNodeLibrarySnapshot {
  schemaVersion: 1;
  ownerNamespace: string;
  packages: CustomNodePackage[];
}

export function createStarterCustomNodeDraft(): CustomNodeDraft {
  return {
    schemaVersion: 1,
    slug: "my-transform",
    name: "我的处理节点",
    description: "接收上游数据，按照自定义规则处理后输出结果。",
    category: "transform",
    icon: "wand",
    ports: {
      inputs: [{ id: "in", name: "输入", dataType: "any", capacity: "one" }],
      outputs: [{ id: "out", name: "输出", dataType: "any", capacity: "many" }],
    },
    configSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    implementation: {
      language: "javascript",
      source: "return { outputs: { out: input } };",
    },
    capabilities: [],
    tests: [
      {
        name: "普通输入",
        kind: "happy",
        input: { message: "Hello Flux" },
        expected: { outputs: { out: { message: "Hello Flux" } } },
      },
      {
        name: "空对象边界",
        kind: "boundary",
        input: {},
        expected: { outputs: { out: {} } },
      },
    ],
  };
}

export function cloneCustomNodeDraft(draft: CustomNodeDraft): CustomNodeDraft {
  return structuredClone(draft);
}

export function hasUnpublishedCustomNodeChanges(
  nodePackage: CustomNodePackage,
): boolean {
  if (!nodePackage.activeRevision) return true;
  return JSON.stringify({ draft: nodePackage.draft, bindings: nodePackage.bindings }) !==
    JSON.stringify({
      draft: nodePackage.activeRevision.draft,
      bindings: nodePackage.activeRevision.bindings ?? nodePackage.bindings,
    });
}
