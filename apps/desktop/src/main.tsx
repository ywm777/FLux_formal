import React from "react";
import ReactDOM from "react-dom/client";
import "@flux/ui/tokens.css";
import "./global.css";
import { App } from "./App.js";
import { WorkflowCommandProvider } from "./app/WorkflowCommandProvider.js";
import { WorkspaceServiceProvider } from "./app/WorkspaceServiceProvider.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkspaceServiceProvider>
      <WorkflowCommandProvider>
        <App />
      </WorkflowCommandProvider>
    </WorkspaceServiceProvider>
  </React.StrictMode>,
);
