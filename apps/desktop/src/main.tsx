import React from "react";
import ReactDOM from "react-dom/client";
import "@flux/ui/tokens.css";
import "./global.css";
import { App } from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
