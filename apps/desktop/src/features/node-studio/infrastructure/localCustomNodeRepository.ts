import { desktopStorage } from "../../../lib/desktopStorage.js";
import type { CustomNodeLibrarySnapshot } from "../domain/customNodePackage.js";

const STORAGE_KEY = "custom-node-library";
let writeQueue = Promise.resolve();

function createOwnerNamespace(): string {
  const entropy = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `local${entropy}`;
}

function emptySnapshot(): CustomNodeLibrarySnapshot {
  return {
    schemaVersion: 1,
    ownerNamespace: createOwnerNamespace(),
    packages: [],
  };
}

function isSnapshot(value: unknown): value is CustomNodeLibrarySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CustomNodeLibrarySnapshot>;
  return candidate.schemaVersion === 1 &&
    typeof candidate.ownerNamespace === "string" &&
    /^[a-z0-9]{6,32}$/.test(candidate.ownerNamespace) &&
    Array.isArray(candidate.packages);
}

export const localCustomNodeRepository = {
  async read(): Promise<CustomNodeLibrarySnapshot> {
    const raw = await desktopStorage.read(STORAGE_KEY);
    if (!raw) return emptySnapshot();
    try {
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? parsed : emptySnapshot();
    } catch {
      return emptySnapshot();
    }
  },

  write(snapshot: CustomNodeLibrarySnapshot): Promise<void> {
    const operation = () => desktopStorage.write(
      STORAGE_KEY,
      JSON.stringify(snapshot),
    );
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
  },
};

