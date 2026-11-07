import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../shared/tokens.css";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./portal.css";
import { PortalApp } from "./PortalApp";

// The portal is always the blue brand variant; only light/dark follows the OS.
const root = document.documentElement;
const media = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => {
  root.dataset.theme = media.matches ? "dark" : "light";
};
root.dataset.accent = "blue";
root.dataset.density = "comfortable";
root.dataset.motion = "full";
applyTheme();
media.addEventListener("change", applyTheme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PortalApp />
    </BrowserRouter>
  </React.StrictMode>,
);
