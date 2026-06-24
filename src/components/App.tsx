import { useMemo, useState } from "react";
import { createAreaFromBlueprint } from "../domain/blueprints";
import { translateArea, translatePathShape, translateShape } from "../domain/geometry";
import { exportJsonValue, importJsonText } from "../domain/importExport";
import { clone, defaultPack, type Area, type CanvasTool, type DirtPath, type Fence, type HeightFeature, type LevelV1, type MapPackV1, type PathTool, type Point2, type Road, type Selection } from "../domain/model";
import { normalizePack } from "../domain/normalization";
import { validateLevel } from "../domain/validation";
import type { DragState, EditHandleDragState, EditorState, SidebarPanes } from "../editor/types";
import { addAreaToLevel, collectUniqueId, currentLevel, getBounds, removeAreaAtPath, removeArrayItem, sameSelection, updateAreasAtPath, updateArray, updateCurrentLevel } from "../editor/utils";
import { ContextMenu } from "./ContextMenu";
import { ImportExportPane } from "./ImportExportPane";
import { Inspector } from "./Inspector";
import { Sidebar } from "./Sidebar";
import { ActionRow, Button } from "./ui";
import { Viewport } from "./Viewport";

export function App() {
  const [state, setState] = useState<EditorState>(() => ({
    pack: clone(defaultPack),
    selectedLevelIndex: 0,
    selection: { kind: "level" },
    canvasTool: "select",
    pendingPath: null,
    contextMenu: null,
    jsonText: "",
    importMessage: "",
    sidebarCollapsed: false,
    sidebarPanes: { tree: true, inspector: true, blueprints: false, json: false },
    pinnedAreaBlueprintKeys: [],
    activeViewportBounds: null,
  }));
  const [history, setHistory] = useState<MapPackV1[]>([]);
  const [dragState, setDragState] = useState<DragState>(null);
  const [editHandleDragState, setEditHandleDragState] = useState<EditHandleDragState>(null);

  const level = currentLevel(state.pack, state.selectedLevelIndex);
  const validation = useMemo(() => validateLevel(state.pack, level), [state.pack, level]);
  const bounds = state.activeViewportBounds ?? getBounds(level);
  const exportValue = useMemo(() => JSON.stringify(exportJsonValue(state.pack), null, 2), [state.pack]);
  const jsonValue = state.jsonText || exportValue;

  const record = (updater: (current: EditorState) => EditorState, historyEntry = true) => {
    setState((current) => {
      if (historyEntry) setHistory((items) => [...items, clone(current.pack)].slice(-100));
      return updater(current);
    });
  };
  const updateLevel = (updater: (level: LevelV1) => LevelV1, historyEntry = true) => record((current) => ({ ...current, pack: updateCurrentLevel(current.pack, current.selectedLevelIndex, updater), jsonText: "" }), historyEntry);
  const updateArea = (path: number[], updater: (area: Area) => Area) => updateLevel((current) => ({ ...current, areas: updateAreasAtPath(current.areas, path, updater) }));
  const nextId = (base: string) => collectUniqueId(level, base);

  const deleteSelection = (item = state.selection) => {
    updateLevel((current) => {
      if (item.kind === "area" && item.path) return { ...current, areas: removeAreaAtPath(current.areas, item.path) };
      if (item.kind === "vegetation" && item.path && item.vegetationIndex !== undefined) return { ...current, areas: updateAreasAtPath(current.areas, item.path, (area) => ({ ...area, vegetation: removeArrayItem(area.vegetation, item.vegetationIndex!) })) };
      if (item.kind === "road" && item.index !== undefined) return { ...current, roads: removeArrayItem(current.roads, item.index) };
      if (item.kind === "dirtPath" && item.index !== undefined) return { ...current, dirtPaths: removeArrayItem(current.dirtPaths, item.index) };
      if (item.kind === "fence" && item.index !== undefined) return { ...current, fences: removeArrayItem(current.fences, item.index) };
      if (item.kind === "heightFeature" && item.index !== undefined) return { ...current, terrain: { heightFeatures: removeArrayItem(current.terrain.heightFeatures, item.index) } };
      return current;
    });
    setState((current) => ({ ...current, selection: { kind: "level" }, contextMenu: null }));
  };

  const duplicateSelection = (item: Selection) => {
    const sourceLevel = currentLevel(state.pack, state.selectedLevelIndex);
    if (item.kind === "area" && item.path) {
      const source = item.path.reduce<Area | undefined>((current, index) => (current ? current.children?.[index] : sourceLevel.areas[index]), undefined);
      if (!source) return;
      updateLevel((current) => {
        const copy = translateArea({ ...clone(source), id: nextId(`${source.id}Copy`) }, 1, 1);
        const parentPath = item.path!.slice(0, -1);
        const result = addAreaToLevel(current, copy, parentPath.length > 0 ? parentPath : undefined);
        setState((old) => ({ ...old, selection: { kind: "area", path: result.path }, contextMenu: null }));
        return result.level;
      });
    }
    if (item.kind === "road" && item.index !== undefined) updateLevel((current) => ({ ...current, roads: [...current.roads, { ...clone(current.roads[item.index!]), id: nextId(`${current.roads[item.index!].id}Copy`), shape: translatePathShape(current.roads[item.index!].shape, 1, 1) }] }));
    if (item.kind === "dirtPath" && item.index !== undefined) updateLevel((current) => ({ ...current, dirtPaths: [...current.dirtPaths, { ...clone(current.dirtPaths[item.index!]), id: nextId(`${current.dirtPaths[item.index!].id}Copy`), shape: translatePathShape(current.dirtPaths[item.index!].shape, 1, 1) }] }));
    if (item.kind === "fence" && item.index !== undefined) updateLevel((current) => ({ ...current, fences: [...current.fences, { ...clone(current.fences[item.index!]), id: nextId(`${current.fences[item.index!].id}Copy`), shape: translatePathShape(current.fences[item.index!].shape, 1, 1) }] }));
    if (item.kind === "heightFeature" && item.index !== undefined) updateLevel((current) => ({ ...current, terrain: { heightFeatures: [...current.terrain.heightFeatures, { ...clone(current.terrain.heightFeatures[item.index!]), id: nextId(`${current.terrain.heightFeatures[item.index!].id}Copy`), shape: translateShape(current.terrain.heightFeatures[item.index!].shape, 1, 1) }] } }));
    setState((current) => ({ ...current, contextMenu: null }));
  };

  const addArea = (point: Point2, parentPath?: number[]) => {
    updateLevel((current) => {
      const area: Area = { id: nextId("lawnArea"), kind: "area", role: "lawn", shape: { type: "rectangle", center: point, size: [4, 4] }, vegetation: [{ id: nextId("grassLayer"), type: "grass", distribution: { type: "uniform", density: 1 } }] };
      const result = addAreaToLevel(current, area, parentPath);
      setState((old) => ({ ...old, selection: { kind: "area", path: result.path }, contextMenu: null }));
      return result.level;
    });
  };
  const addPathItem = (kind: PathTool, start: Point2, end: Point2) => {
    updateLevel((current) => {
      if (kind === "fence") return { ...current, fences: [...current.fences, { id: nextId("fence"), kind: "fence", height: 1, postSpacing: 2, shape: { type: "line", start, end } } satisfies Fence] };
      if (kind === "road") return { ...current, roads: [...current.roads, { id: nextId("road"), kind: "road", width: 3.2, shape: { type: "line", start, end } } satisfies Road] };
      return { ...current, dirtPaths: [...current.dirtPaths, { id: nextId("dirtPath"), kind: "dirtPath", width: 1.1, shape: { type: "line", start, end } } satisfies DirtPath] };
    });
  };
  const addHill = (point: Point2) => {
    updateLevel((current) => ({ ...current, terrain: { heightFeatures: [...current.terrain.heightFeatures, { id: nextId("hill"), type: "hill", shape: { type: "circle", center: point, radius: 4 }, height: 1.5, falloff: 1 } satisfies HeightFeature] } }));
  };
  const addBlueprint = (key: string, point: Point2) => {
    const area = createAreaFromBlueprint(key, point, nextId);
    if (!area) return;
    updateLevel((current) => {
      const result = addAreaToLevel(current, area, state.selection.kind === "area" ? state.selection.path : undefined);
      setState((old) => ({ ...old, selection: { kind: "area", path: result.path }, contextMenu: null }));
      return result.level;
    });
  };

  const addFromTree = (kind: "level" | "area" | "road" | "dirtPath" | "fence" | "hill") => {
    if (kind === "level") {
      record((current) => ({ ...current, pack: { ...current.pack, levels: [...current.pack.levels, { ...clone(defaultPack.levels[0]), code: `level${current.pack.levels.length + 1}`, name: `Level ${current.pack.levels.length + 1}` }] }, selectedLevelIndex: current.pack.levels.length, selection: { kind: "level" } }));
    } else if (kind === "area") addArea([0, 0], state.selection.kind === "area" ? state.selection.path : undefined);
    else if (kind === "hill") addHill([0, 0]);
    else if (kind === "road") addPathItem("road", [-4, 0], [4, 0]);
    else if (kind === "dirtPath") addPathItem("dirtPath", [-3, 2], [3, 2]);
    else addPathItem("fence", [-4, -4], [4, -4]);
  };

  const pathToolClick = (kind: PathTool, point: Point2) => {
    if (!state.pendingPath || state.pendingPath.kind !== kind) {
      setState((current) => ({ ...current, pendingPath: { kind, start: point }, canvasTool: kind }));
      return;
    }
    addPathItem(kind, state.pendingPath.start, point);
    setState((current) => ({ ...current, pendingPath: null, canvasTool: "select" }));
  };

  return (
    <main className={`app ${state.sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      <aside className={`panel sidebar-panel ${state.sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="panel-header">
          <h1>LaMow Map Editor</h1>
          <ActionRow>
            <Button type="button" onClick={() => setState((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }))}>{state.sidebarCollapsed ? "Show" : "Hide"}</Button>
            <Button type="button" disabled={history.length === 0} onClick={() => { const previous = history.at(-1); if (previous) { setHistory((items) => items.slice(0, -1)); setState((current) => ({ ...current, pack: previous, selection: { kind: "level" }, importMessage: "Undid last edit." })); } }}>Undo</Button>
            <Button type="button" onClick={() => record((current) => ({ ...current, pack: clone(defaultPack), selectedLevelIndex: 0, selection: { kind: "level" }, jsonText: "", importMessage: "" }))}>Reset</Button>
          </ActionRow>
        </div>
        <Sidebar
          level={level}
          selection={state.selection}
          panes={state.sidebarPanes}
          pinnedAreaBlueprintKeys={state.pinnedAreaBlueprintKeys}
          onPaneToggle={(name: keyof SidebarPanes, open) => setState((current) => ({ ...current, sidebarPanes: { ...current.sidebarPanes, [name]: open }, sidebarCollapsed: false }))}
          onPinBlueprint={(key, pinned) => setState((current) => ({ ...current, pinnedAreaBlueprintKeys: pinned ? [...new Set([...current.pinnedAreaBlueprintKeys, key])] : current.pinnedAreaBlueprintKeys.filter((item) => item !== key) }))}
          onSelect={(selection) => setState((current) => ({ ...current, selection }))}
          onDelete={deleteSelection}
          onAdd={addFromTree}
          inspector={<Inspector level={level} selection={state.selection} onUpdateLevel={updateLevel} onUpdateArea={updateArea} onDeleteSelection={() => deleteSelection()} />}
          importExport={<ImportExportPane pack={state.pack} value={jsonValue} message={state.importMessage} onJsonText={(jsonText) => setState((current) => ({ ...current, jsonText }))} onCopy={() => navigator.clipboard.writeText(jsonValue).then(() => setState((current) => ({ ...current, importMessage: "Copied JSON to clipboard." })))} onImport={() => { try { const result = importJsonText(jsonValue); record((current) => ({ ...current, pack: normalizePack(result.pack), selectedLevelIndex: 0, selection: { kind: "level" }, jsonText: "", importMessage: result.message })); } catch (error) { setState((current) => ({ ...current, importMessage: error instanceof Error ? error.message : "Could not import JSON." })); } }} onOpenFile={(file) => file.text().then((text) => { const result = importJsonText(text); record((current) => ({ ...current, pack: normalizePack(result.pack), selectedLevelIndex: 0, selection: { kind: "level" }, jsonText: "", importMessage: result.message })); }).catch((error) => setState((current) => ({ ...current, importMessage: error instanceof Error ? error.message : "Could not import JSON file." })))} />}
        />
      </aside>
      <section className="panel canvas-panel">
        <div className="panel-header">
          <h2>Top-down preview</h2>
          <ActionRow className="toolbar-actions">
            {(["select", "spawn", "area", "fence", "road", "dirtPath", "hill"] as CanvasTool[]).map((tool) => <Button key={tool} tone={state.canvasTool === tool ? "primary" : "default"} type="button" onClick={() => setState((current) => ({ ...current, canvasTool: tool, pendingPath: tool !== current.pendingPath?.kind ? null : current.pendingPath }))}>{tool === "dirtPath" ? "Path" : tool}</Button>)}
          </ActionRow>
        </div>
        <div className="map-wrap">
          <Viewport level={level} bounds={bounds} selection={state.selection} canvasTool={state.canvasTool} pendingPath={state.pendingPath} dragState={dragState} editHandleDragState={editHandleDragState} onSelect={(selection) => setState((current) => ({ ...current, selection }))} onClearSelection={() => setState((current) => ({ ...current, selection: { kind: "level" } }))} onUpdateLevel={(updater) => updateLevel(updater, false)} onDragState={setDragState} onEditHandleDragState={setEditHandleDragState} onContextMenu={(screenX, screenY, world, target) => setState((current) => ({ ...current, contextMenu: { screenX, screenY, world, target } }))} onAddArea={addArea} onAddHill={addHill} onPathToolClick={pathToolClick} onFreezeViewport={() => setState((current) => ({ ...current, activeViewportBounds: getBounds(level) }))} onReleaseViewport={() => setState((current) => ({ ...current, activeViewportBounds: null }))} />
        </div>
        <div className="status">{validation.length === 0 ? <div className="ok">Draft v1 shape validates for the checks currently implemented.</div> : validation.map((error) => <div key={error} className="error">{error}</div>)}</div>
      </section>
      <ContextMenu menu={state.contextMenu} pinnedAreaBlueprintKeys={state.pinnedAreaBlueprintKeys} onClose={() => setState((current) => ({ ...current, contextMenu: null }))} onSelect={(selection: Selection) => setState((current) => ({ ...current, selection, contextMenu: null }))} onDuplicate={duplicateSelection} onDelete={(selection) => deleteSelection(selection)} onMoveSpawn={() => state.contextMenu && updateLevel((current) => ({ ...current, spawn: { ...current.spawn, position: state.contextMenu!.world } }))} onAddArea={() => state.contextMenu && addArea(state.contextMenu.world)} onAddChildArea={() => state.contextMenu && addArea(state.contextMenu.world, state.contextMenu.target?.kind === "area" ? state.contextMenu.target.path : state.selection.kind === "area" ? state.selection.path : undefined)} onAddBlueprint={(key) => state.contextMenu && addBlueprint(key, state.contextMenu.world)} onStartFence={() => state.contextMenu && pathToolClick("fence", state.contextMenu.world)} onAddRoad={() => state.contextMenu && addPathItem("road", [state.contextMenu.world[0] - 2, state.contextMenu.world[1]], [state.contextMenu.world[0] + 2, state.contextMenu.world[1]])} onAddDirtPath={() => state.contextMenu && addPathItem("dirtPath", [state.contextMenu.world[0] - 2, state.contextMenu.world[1]], [state.contextMenu.world[0] + 2, state.contextMenu.world[1]])} onAddHill={() => state.contextMenu && addHill(state.contextMenu.world)} />
    </main>
  );
}
