import { desktopStorage } from "../desktopStorage.js";
import {
  isHttpConnection,
  type HttpConnection,
  type HttpConnectionLibrarySnapshot,
} from "./httpConnection.js";

const STORAGE_KEY = "http-connection-library";
let writeQueue = Promise.resolve();

function emptySnapshot(): HttpConnectionLibrarySnapshot {
  return { schemaVersion: 1, connections: [] };
}

function isSnapshot(value: unknown): value is HttpConnectionLibrarySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<HttpConnectionLibrarySnapshot>;
  return candidate.schemaVersion === 1 &&
    Array.isArray(candidate.connections) &&
    candidate.connections.every(isHttpConnection);
}

export const localHttpConnectionRepository = {
  async read(): Promise<HttpConnectionLibrarySnapshot> {
    const raw = await desktopStorage.read(STORAGE_KEY);
    if (!raw) return emptySnapshot();
    try {
      const parsed: unknown = JSON.parse(raw);
      return isSnapshot(parsed) ? parsed : emptySnapshot();
    } catch {
      return emptySnapshot();
    }
  },

  async find(id: string): Promise<HttpConnection | null> {
    const snapshot = await this.read();
    return snapshot.connections.find((connection) => connection.id === id) ?? null;
  },

  write(snapshot: HttpConnectionLibrarySnapshot): Promise<void> {
    const operation = () => desktopStorage.write(STORAGE_KEY, JSON.stringify(snapshot));
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
  },
};
