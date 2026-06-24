import { useLayoutEffect, useRef } from "react";
import type { LevelV1, Rect, Selection } from "../../domain/model";
import { renderHandlesInto } from "./sceneController";

export function SelectionHandles({ level, selection, viewBox }: { level: LevelV1; selection: Selection; viewBox: Rect }) {
  const ref = useRef<SVGGElement | null>(null);
  useLayoutEffect(() => {
    if (ref.current) renderHandlesInto(ref.current, level, selection);
  }, [level, selection, viewBox]);
  return <g ref={ref} className="edit-handles" />;
}
