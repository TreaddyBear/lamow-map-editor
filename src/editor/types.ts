import type { CanvasTool, ContextMenuState, MapPackV1, PathTool, PendingPathState, Rect, Selection } from "../domain/model";

export type SidebarPanes = {
  tree: boolean;
  inspector: boolean;
  blueprints: boolean;
};

export type SnapSettings = {
  enabled: boolean;
  increment: number;
  mode: "toGrid" | "byIncrement";
};

export type EditorState = {
  pack: MapPackV1;
  selectedLevelIndex: number;
  selection: Selection;
  canvasTool: CanvasTool;
  pendingPath: PendingPathState;
  contextMenu: ContextMenuState;
  jsonText: string;
  importMessage: string;
  sidebarCollapsed: boolean;
  importPanelOpen: boolean;
  sidebarPanes: SidebarPanes;
  pinnedAreaBlueprintKeys: string[];
  activeViewportBounds: Rect | null;
  snap: SnapSettings;
};

export type DragState = {
  selection: Selection;
  last: [number, number];
  moved: boolean;
} | null;

export type EditHandleDragState = {
  selection: Selection;
  handle: string;
  index?: number;
  last: [number, number];
  moved: boolean;
} | null;

export type EditorAction = (state: EditorState) => EditorState;
export type PathToolName = PathTool;
