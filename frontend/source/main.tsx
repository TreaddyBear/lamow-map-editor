import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { EditorPage } from "./Pages/EditorPage";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");

createRoot(root).render(
  <React.StrictMode>
    <EditorPage />
  </React.StrictMode>,
);
