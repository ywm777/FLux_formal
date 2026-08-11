import { desktopStorage } from "../desktopStorage.js";
import {
  parseMcpConnectionLibrarySnapshot,
  type McpConnection,
  type McpConnectionLibrarySnapshot,
} from "./mcpConnection.js";

const STORAGE_KEY = "mcp-connection-library";
let writeQueue = Promise.resolve();

function emptySnapshot(): McpConnectionLibrarySnapshot {
  return { schemaVersion: 2, connections: [] };
}

export const localMcpConnectionRepository = {
  async read(): Promise<McpConnectionLibrarySnapshot> {
    const raw = await desktopStorage.read(STORAGE_KEY);
    if (!raw) return emptySnapshot();
    try {
      const parsed: unknown = JSON.parse(raw);
      return parseMcpConnectionLibrarySnapshot(parsed) ?? emptySnapshot();
    } catch {
      return emptySnapshot();
    }
  },

  async find(id: string): Promise<McpConnection | null> {
    const snapshot = await this.read();
    return snapshot.connections.find((connection) => connection.id === id) ?? null;
  },

  write(snapshot: McpConnectionLibrarySnapshot): Promise<void> {
    const operation = () => desktopStorage.write(STORAGE_KEY, JSON.stringify(snapshot));
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
  },
};
