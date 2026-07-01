import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { EditorPage } from "./EditorPage";

export type AppView = "map" | "assets";

const AssetsPage = lazy(() => import("./AssetsPage").then((module) => ({ default: module.AssetsPage })));

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapEditorRoute />} />
        <Route path="/assets" element={<AssetsRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function MapEditorRoute() {
  const navigate = useNavigate();
  return <EditorPage onViewChange={(view) => navigate(view === "assets" ? "/assets" : "/")} />;
}

function AssetsRoute() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<div className="grid h-screen place-items-center bg-[var(--app-bg)] text-[var(--app-text)]">Loading assets...</div>}>
      <AssetsPage onOpenMapEditor={() => navigate("/")} />
    </Suspense>
  );
}
