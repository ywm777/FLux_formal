import { create } from "zustand";
import {
  buildCustomNodeTypeId,
  validateCustomNodeDraft,
  type CustomNodeDraft,
  type NodeDefinition,
} from "@flux/node-sdk";
import { registry } from "../../../lib/registry.js";
import { formatProductErrorMessage } from "../../../lib/productError.js";
import {
  createCustomNodeDefinition,
  runCustomNodeTestSuite,
} from "../infrastructure/browserCustomNodeRuntime.js";
import type {
  CustomNodeLibrarySnapshot,
  CustomNodePackage,
  CustomNodeTestReport,
} from "../domain/customNodePackage.js";
import { localCustomNodeRepository } from "../infrastructure/localCustomNodeRepository.js";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface CustomNodeState {
  packages: CustomNodePackage[];
  activeDefinitions: NodeDefinition[];
  ownerNamespace: string | null;
  loadStatus: LoadStatus;
  error: string | null;
  notice: string | null;
  load: () => Promise<void>;
  saveDraft: (
    id: string | null,
    draft: CustomNodeDraft,
    bindings: Record<string, string>,
  ) => Promise<CustomNodePackage>;
  testDraft: (
    id: string | null,
    draft: CustomNodeDraft,
    bindings: Record<string, string>,
  ) => Promise<CustomNodePackage>;
  activateDraft: (
    id: string | null,
    draft: CustomNodeDraft,
    bindings: Record<string, string>,
  ) => Promise<CustomNodePackage>;
  disable: (id: string) => Promise<void>;
  clearFeedback: () => void;
}

const registeredCustomNodeIds = new Set<string>();

function cloneDraft(draft: CustomNodeDraft): CustomNodeDraft {
  return structuredClone(draft);
}

function definitionsFromPackages(
  packages: CustomNodePackage[],
): NodeDefinition[] {
  for (const id of registeredCustomNodeIds) registry.unregister(id);
  registeredCustomNodeIds.clear();

  const definitions = packages.flatMap((nodePackage) => {
    if (!nodePackage.activeRevision || nodePackage.lifecycle === "disabled") {
      return [];
    }
    const validation = validateCustomNodeDraft(nodePackage.activeRevision.draft);
    if (!validation.success) return [];
    const definition = createCustomNodeDefinition({
      id: nodePackage.id,
      revision: {
        ...nodePackage.activeRevision,
        bindings: nodePackage.activeRevision.bindings ?? nodePackage.bindings,
      },
    });
    registry.upsert(definition);
    registeredCustomNodeIds.add(definition.id);
    return [definition];
  });
  return definitions;
}

function snapshot(
  ownerNamespace: string,
  packages: CustomNodePackage[],
): CustomNodeLibrarySnapshot {
  return { schemaVersion: 1, ownerNamespace, packages };
}

function nextTypeId(
  ownerNamespace: string,
  requestedSlug: string,
  packages: CustomNodePackage[],
): string {
  let counter = 1;
  let slug = requestedSlug;
  let candidate = buildCustomNodeTypeId(ownerNamespace, slug);
  const ids = new Set(packages.map((item) => item.id));
  while (ids.has(candidate)) {
    counter += 1;
    const suffix = `-${counter}`;
    slug = `${requestedSlug.slice(0, 48 - suffix.length)}${suffix}`;
    candidate = buildCustomNodeTypeId(ownerNamespace, slug);
  }
  return candidate;
}

function upsertDraftPackage(input: {
  packages: CustomNodePackage[];
  ownerNamespace: string;
  id: string | null;
  draft: CustomNodeDraft;
  bindings: Record<string, string>;
  testReport?: CustomNodeTestReport;
}): { packages: CustomNodePackage[]; nodePackage: CustomNodePackage } {
  const now = new Date().toISOString();
  const existing = input.id
    ? input.packages.find((item) => item.id === input.id)
    : undefined;
  const validation = validateCustomNodeDraft(input.draft);
  const lifecycle = input.testReport?.passed
    ? "tested"
    : validation.success ? "validated" : "draft";
  const nodePackage: CustomNodePackage = existing
    ? {
        ...existing,
        lifecycle,
        draft: cloneDraft(input.draft),
        bindings: structuredClone(input.bindings),
        testReport: input.testReport,
        updatedAt: now,
      }
    : {
        id: nextTypeId(input.ownerNamespace, input.draft.slug, input.packages),
        ownerNamespace: input.ownerNamespace,
        lifecycle,
        draft: cloneDraft(input.draft),
        bindings: structuredClone(input.bindings),
        testReport: input.testReport,
        createdAt: now,
        updatedAt: now,
      };
  return {
    packages: existing
      ? input.packages.map((item) => item.id === existing.id ? nodePackage : item)
      : [nodePackage, ...input.packages],
    nodePackage,
  };
}

async function readReadyLibrary(state: CustomNodeState): Promise<{
  ownerNamespace: string;
  packages: CustomNodePackage[];
}> {
  if (state.ownerNamespace) {
    return { ownerNamespace: state.ownerNamespace, packages: state.packages };
  }
  const stored = await localCustomNodeRepository.read();
  return {
    ownerNamespace: stored.ownerNamespace,
    packages: stored.packages,
  };
}

export const useCustomNodeStore = create<CustomNodeState>((set, get) => ({
  packages: [],
  activeDefinitions: [],
  ownerNamespace: null,
  loadStatus: "idle",
  error: null,
  notice: null,

  async load() {
    const current = get().loadStatus;
    if (current === "loading" || current === "ready") return;
    set({ loadStatus: "loading", error: null });
    try {
      const stored = await localCustomNodeRepository.read();
      const activeDefinitions = definitionsFromPackages(stored.packages);
      set({
        packages: stored.packages,
        activeDefinitions,
        ownerNamespace: stored.ownerNamespace,
        loadStatus: "ready",
      });
    } catch (error) {
      set({
        loadStatus: "error",
        error: formatProductErrorMessage(error, "无法读取个人节点库。"),
      });
    }
  },

  async saveDraft(id, draft, bindings) {
    const library = await readReadyLibrary(get());
    const result = upsertDraftPackage({ ...library, id, draft, bindings });
    await localCustomNodeRepository.write(snapshot(
      library.ownerNamespace,
      result.packages,
    ));
    const activeDefinitions = definitionsFromPackages(result.packages);
    set({
      packages: result.packages,
      activeDefinitions,
      ownerNamespace: library.ownerNamespace,
      loadStatus: "ready",
      notice: "节点草案已保存。",
      error: null,
    });
    return result.nodePackage;
  },

  async testDraft(id, draft, bindings) {
    const validation = validateCustomNodeDraft(draft);
    if (!validation.success) {
      throw new Error(validation.issues[0]?.message ?? "节点规则校验未通过");
    }
    const report = await runCustomNodeTestSuite(draft);
    const library = await readReadyLibrary(get());
    const result = upsertDraftPackage({
      ...library,
      id,
      draft,
      bindings,
      testReport: report,
    });
    await localCustomNodeRepository.write(snapshot(
      library.ownerNamespace,
      result.packages,
    ));
    const activeDefinitions = definitionsFromPackages(result.packages);
    set({
      packages: result.packages,
      activeDefinitions,
      ownerNamespace: library.ownerNamespace,
      loadStatus: "ready",
      notice: report.passed ? "全部测试通过。" : "测试未通过，请检查运行逻辑。",
      error: null,
    });
    return result.nodePackage;
  },

  async activateDraft(id, draft, bindings) {
    const validation = validateCustomNodeDraft(draft);
    if (!validation.success) {
      throw new Error(validation.issues[0]?.message ?? "节点规则校验未通过");
    }
    const report = await runCustomNodeTestSuite(draft);
    const missingBindings = draft.capabilities
      .filter((capability) => capability.carrier === "app" && !bindings[capability.key])
      .map((capability) => capability.key);
    if (missingBindings.length > 0) {
      throw new Error(`请先为外部能力选择接口连接：${missingBindings.join("、")}`);
    }
    const library = await readReadyLibrary(get());
    const result = upsertDraftPackage({
      ...library,
      id,
      draft,
      bindings,
      testReport: report,
    });
    if (!report.passed) {
      await localCustomNodeRepository.write(snapshot(
        library.ownerNamespace,
        result.packages,
      ));
      set({
        packages: result.packages,
        activeDefinitions: definitionsFromPackages(result.packages),
        ownerNamespace: library.ownerNamespace,
        loadStatus: "ready",
        notice: "测试未通过，节点尚未启用。",
        error: null,
      });
      return result.nodePackage;
    }

    const version = (result.nodePackage.activeRevision?.version ?? 0) + 1;
    const activated: CustomNodePackage = {
      ...result.nodePackage,
      lifecycle: "active",
      activeRevision: {
        version,
        activatedAt: new Date().toISOString(),
        draft: cloneDraft(draft),
        bindings: structuredClone(bindings),
      },
    };
    const packages = result.packages.map((item) =>
      item.id === activated.id ? activated : item,
    );
    await localCustomNodeRepository.write(snapshot(library.ownerNamespace, packages));
    const activeDefinitions = definitionsFromPackages(packages);
    set({
      packages,
      activeDefinitions,
      ownerNamespace: library.ownerNamespace,
      loadStatus: "ready",
      notice: `节点 v${version} 已启用，可以在画布中使用。`,
      error: null,
    });
    return activated;
  },

  async disable(id) {
    const library = await readReadyLibrary(get());
    const packages = library.packages.map((item): CustomNodePackage =>
      item.id === id
        ? { ...item, lifecycle: "disabled", updatedAt: new Date().toISOString() }
        : item,
    );
    await localCustomNodeRepository.write(snapshot(library.ownerNamespace, packages));
    set({
      packages,
      activeDefinitions: definitionsFromPackages(packages),
      notice: "节点已停用，已保存的版本仍保留在个人节点库中。",
      error: null,
    });
  },

  clearFeedback() {
    set({ error: null, notice: null });
  },
}));
