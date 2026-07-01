import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./Pages/App";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
