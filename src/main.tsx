import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { WorkspaceProvider } from "./shared/store";
import { KitProvider } from "./shared/kit-store";
import { App } from "./application/App";
import "./shared/tokens.css";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./styles.css";
import "./desktop.css";
import "./desktop-modules.css";
import "./file-search.css";
import "./shared/ui/components.css";
import {
  applyAppearance,
  defaultAppearance,
  LAST_APPEARANCE_KEY,
  readAppearance,
} from "./shared/appearance";

// Apply the last appearance before the first paint so restored dark sessions
// never flash light surfaces. Signed-in preferences replace it once known.
try {
  applyAppearance(readAppearance(LAST_APPEARANCE_KEY));
} catch {
  applyAppearance(defaultAppearance);
}

const Router =
  "__TAURI_INTERNALS__" in window && window.location.port !== "3001"
    ? HashRouter
    : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <WorkspaceProvider>
        <KitProvider>
          <App />
        </KitProvider>
      </WorkspaceProvider>
    </Router>
  </React.StrictMode>,
);
