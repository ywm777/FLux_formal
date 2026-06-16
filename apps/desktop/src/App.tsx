import { useAppStore } from "./store/appStore.js";
import { TopBar } from "./components/TopBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { CanvasView } from "./features/canvas/CanvasView.js";
import { TasksView } from "./features/tasks/TasksView.js";

export function App() {
  const mode = useAppStore((s) => s.mode);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <TopBar />
      <main style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {mode === "canvas" ? <CanvasView /> : <TasksView />}
      </main>
      <StatusBar />
    </div>
  );
}
