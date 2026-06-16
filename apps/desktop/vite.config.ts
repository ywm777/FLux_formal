import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 期望固定端口、不清屏；构建目标对齐 WebView2(Windows)
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2021",
    sourcemap: true,
  },
});
