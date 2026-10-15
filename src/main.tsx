import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WorkspaceProvider } from "./shared/store";
import { App } from "./application/App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
