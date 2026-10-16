import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { WorkspaceProvider } from "./shared/store";
import { App } from "./application/App";
import "./styles.css";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./desktop.css";
import "./desktop-modules.css";

// Set the theme before the first paint so restored dark sessions never animate
// from light surfaces or briefly display unreadable intermediate colors.
try {
  const preference = localStorage.getItem("kit.theme") || "system";
  document.documentElement.dataset.theme =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
} catch {
  document.documentElement.dataset.theme = "light";
}

const Router =
  "__TAURI_INTERNALS__" in window && window.location.port !== "3001"
    ? HashRouter
    : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </Router>
  </React.StrictMode>,
);
