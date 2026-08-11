import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const workspaceSource = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Tauri 期望固定端口、不清屏；构建目标对齐 WebView2(Windows)
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: [
      {
        find: /^@flux\/ui$/,
        replacement: workspaceSource("../../packages/ui/src/index.ts"),
      },
      {
        find: /^@flux\/ui\/tokens\.css$/,
        replacement: workspaceSource("../../packages/ui/src/tokens/tokens.css"),
      },
      {
        find: /^@flux\/shared$/,
        replacement: workspaceSource("../../packages/shared/src/index.ts"),
      },
      {
        find: /^@flux\/node-sdk$/,
        replacement: workspaceSource("../../packages/node-sdk/src/index.ts"),
      },
      {
        find: /^@flux\/workflow-schema$/,
        replacement: workspaceSource("../../packages/workflow-schema/src/index.ts"),
      },
      {
        find: /^@flux\/workflow-runtime$/,
        replacement: workspaceSource("../../packages/workflow-runtime/src/index.ts"),
      },
      {
        find: /^@flux\/canvas-core$/,
        replacement: workspaceSource("../../packages/canvas-core/src/index.ts"),
      },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2021",
    // 正式客户端不分发源码映射；如需线上符号化，应由 CI 单独生成并保存 artifact。
    sourcemap: false,
  },
});
