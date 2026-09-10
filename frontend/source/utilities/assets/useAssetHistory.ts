import { useLayoutEffect, useRef, useState } from "react";
import type { VegetationSpeciesAssetFile } from "./vegetation";
import type { ObjPrimitiveMesh } from "./objPrimitives";

type Document = { speciesAssets: VegetationSpeciesAssetFile[]; primitiveMeshes: ObjPrimitiveMesh[]; selectedSpeciesId: string };
const changed = (a: Document, b: Document) => a.speciesAssets !== b.speciesAssets || a.primitiveMeshes !== b.primitiveMeshes;

/** A pointer hold/drag or focused text edit is a transaction, not hundreds of undo entries. */
export function useAssetHistory(document: Document, restore: (document: Document) => void) {
  const current = useRef(document), undo = useRef<Document[]>([]), redo = useRef<Document[]>([]);
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const replaying = useRef(false), start = useRef<Document | undefined>(undefined), groups = useRef(new Set<string>());
  const [, update] = useState(0);
  const push = (value: Document) => { undo.current.push(value); if (undo.current.length > 100) undo.current.shift(); redo.current = []; update(v => v + 1); };
  useLayoutEffect(() => {
    if (changed(current.current, document)) {
      if (replaying.current) replaying.current = false;
      else if (!start.current) push(current.current);
    }
    current.current = document;
  }, [document.speciesAssets, document.primitiveMeshes, document.selectedSpeciesId]);
  const finish = () => { const previous = start.current; start.current = undefined; if (previous && changed(previous, current.current)) push(previous); };
  const begin = (kind: string) => { if (!start.current) start.current = current.current; groups.current.add(kind); };
  const end = (kind: string) => { groups.current.delete(kind); if (!groups.current.size) finish(); };
  const apply = (back: boolean) => {
    groups.current.clear(); finish(); const from = back ? undo.current : redo.current, to = back ? redo.current : undo.current;
    const next = from.pop(); if (!next) return; to.push(current.current); replaying.current = true; restoreRef.current(next); update(v => v + 1);
  };
  useLayoutEffect(() => {
    const release = () => { setTimeout(() => end("pointer"), 0); };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release); window.addEventListener("blur", release);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); window.removeEventListener("blur", release); };
  }, []);
  const editable = (target: EventTarget) => target instanceof HTMLElement && target.matches("input,textarea,[contenteditable=true]");
  return {
    skipNextChange: () => { replaying.current = true; },
    canUndo: undo.current.length > 0, canRedo: redo.current.length > 0, undo: () => apply(true), redo: () => apply(false),
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
