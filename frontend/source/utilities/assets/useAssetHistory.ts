import { useLayoutEffect, useRef, useState } from "react";
import type { VegetationSpeciesAssetFile } from "./vegetation";
import type { ObjPrimitiveMesh } from "./objPrimitives";

type Document = { speciesAssets: VegetationSpeciesAssetFile[]; primitiveMeshes: ObjPrimitiveMesh[]; selectedSpeciesId: string; versionBases: Record<string, string> };
type Snapshot = { asset: VegetationSpeciesAssetFile; primitives: ObjPrimitiveMesh[]; versionId?: string };
type Stack = { undo: Snapshot[]; redo: Snapshot[] };
const snapshot = (document: Document): Snapshot => ({ asset: document.speciesAssets.find(asset => asset.species.id === document.selectedSpeciesId)!, primitives: document.primitiveMeshes, versionId: document.versionBases[document.selectedSpeciesId] });
const changed = (a: Snapshot, b: Snapshot) => a.asset !== b.asset || a.primitives !== b.primitives;

/** Each archetype owns its local history. Selection is navigation, never an edit. */
export function useAssetHistory(document: Document, restore: (document: Document) => void) {
  const current = useRef(document), stacks = useRef(new Map<string, Stack>());
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const replaying = useRef(false), start = useRef<Snapshot | undefined>(undefined), groups = useRef(new Set<string>());
  const [, update] = useState(0);
  const stack = (id = current.current.selectedSpeciesId) => { let value = stacks.current.get(id); if (!value) { value = { undo: [], redo: [] }; stacks.current.set(id, value); } return value; };
  const push = (value: Snapshot) => { const history = stack(); history.undo.push(value); if (history.undo.length > 100) history.undo.shift(); history.redo = []; update(v => v + 1); };
  const finish = () => { const previous = start.current; start.current = undefined; if (previous && changed(previous, snapshot(current.current))) push(previous); };
  useLayoutEffect(() => {
    if (current.current.selectedSpeciesId !== document.selectedSpeciesId) {
      finish(); groups.current.clear(); replaying.current = false;
    } else if (changed(snapshot(current.current), snapshot(document))) {
      if (replaying.current) replaying.current = false;
      else if (!start.current) push(snapshot(current.current));
    }
    current.current = document; update(v => v + 1);
  }, [document.speciesAssets, document.primitiveMeshes, document.selectedSpeciesId, document.versionBases]);
  const begin = (kind: string) => { if (!start.current) start.current = snapshot(current.current); groups.current.add(kind); };
  const end = (kind: string) => { groups.current.delete(kind); if (!groups.current.size) finish(); };
  const apply = (back: boolean) => {
    groups.current.clear(); finish(); const history = stack(), from = back ? history.undo : history.redo, to = back ? history.redo : history.undo;
    const next = from.pop(); if (!next) return;
    const active = current.current; to.push(snapshot(active)); replaying.current = true;
    const versionBases = { ...active.versionBases }; if (next.versionId) versionBases[active.selectedSpeciesId] = next.versionId; else delete versionBases[active.selectedSpeciesId];
    restoreRef.current({ ...active, speciesAssets: active.speciesAssets.map(asset => asset.species.id === active.selectedSpeciesId ? next.asset : asset), primitiveMeshes: next.primitives, versionBases }); update(v => v + 1);
  };
  useLayoutEffect(() => {
    const release = () => { setTimeout(() => end("pointer"), 0); };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release); window.addEventListener("blur", release);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); window.removeEventListener("blur", release); };
  }, []);
  const editable = (target: EventTarget) => target instanceof HTMLElement && target.matches("input,textarea,[contenteditable=true]");
  const activeStack = stack(document.selectedSpeciesId);
  return {
    skipNextChange: () => { replaying.current = true; },
    reset: (id = current.current.selectedSpeciesId) => {
      stacks.current.delete(id);
      if (id === current.current.selectedSpeciesId) { start.current = undefined; groups.current.clear(); replaying.current = true; }
      update(v => v + 1);
    },
    canUndo: activeStack.undo.length > 0, canRedo: activeStack.redo.length > 0, undo: () => apply(true), redo: () => apply(false),
    handlers: {
      onPointerDownCapture: () => begin("pointer"),
      onFocusCapture: (event: { target: EventTarget }) => { if (editable(event.target)) begin("text"); },
      onBlurCapture: (event: { target: EventTarget }) => { if (editable(event.target)) setTimeout(() => end("text"), 0); },
      onKeyDownCapture: (event: React.KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && !editable(event.target) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); apply(event.key.toLowerCase() === "z" && !event.shiftKey); }
        else if (["Enter", " ", "ArrowUp", "ArrowDown"].includes(event.key)) begin("key");
      },
      onKeyUpCapture: () => { setTimeout(() => end("key"), 0); },
    },
  };
}
