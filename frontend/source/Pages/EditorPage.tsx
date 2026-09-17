import { useEffect, useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import { levelCode, levelIndex, mapDraftKey, nextLevelCode, readMapWorkspace, type MapSource } from "../utilities/editor/mapWorkspace";
import { blueprintFromArea, createAreaFromBlueprint } from "../utilities/domain/blueprints";
import { translateArea, translatePathShape, translateShape } from "../utilities/domain/geometry";
import { exportJsonValue, importJsonText } from "../utilities/domain/importExport";
import { clone, defaultPack, type Area, type CanvasTool, type DirtPath, type EditorBlueprint, type Fence, type HeightFeature, type LevelV1, type MapPackV1, type PathTool, type Point2, type Road, type Selection } from "../utilities/domain/model";
import { normalizePack } from "../utilities/domain/normalization";
import { samplePacks } from "../utilities/domain/samplePacks";
import { validateLevel } from "../utilities/domain/validation";
import type { EditorState, SidebarPanes } from "../utilities/editor/types";
import { addAreaToLevel, collectUniqueId, currentLevel, getBounds, removeAreaAtPath, removeArrayItem, sameSelection, updateAreasAtPath, updateArray, updateCurrentLevel } from "../utilities/editor/utils";
import { AppTopBar } from "../Views/AppTopBar";
import { BlueprintsDialog } from "../Views/BlueprintsDialog";
import { ContextMenu } from "../Views/ContextMenu";
import { ImportExportPane } from "../Views/ImportExportPane";
import { Inspector } from "../Views/Inspector";
import { Sidebar } from "../Views/Sidebar";
import { SnapControls } from "../Views/SnapControls";
import { SettingsDialog } from "../Views/SettingsDialog";
import { Viewport } from "../Views/Viewport";
import { ViewportToolbar } from "../Views/ViewportToolbar";
import { AppShell, Button, Popover, CanvasPanelLayout, FloatingAsideLayout, MapStage, Panel, PanelHeader, SidebarSlot, StatusMessage, StatusStrip } from "../Components/Base";
import type { AppView } from "./App";

type EditorPageProps = {
  onViewChange: (view: AppView) => void;
};

export function EditorPage({ onViewChange }: EditorPageProps) {
  const [initial] = useState(() => readMapWorkspace({ getItem: key => localStorage.getItem(key) }));
  const [source, setSource] = useState<MapSource>(initial.workspace.source);
  const [draftError, setDraftError] = useState(initial.error ?? "");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [replacement, setReplacement] = useState<{ pack: MapPackV1; source: MapSource; message: string } | null>(null);
  const [game, setGame] = useState<{ pack: MapPackV1; revision: string; source: string; baked: { status: string; codes: string[] } } | null>(null);
  const [gameError, setGameError] = useState("");
  const [gameLoading, setGameLoading] = useState(true);
  const editEpoch = useRef(0);
  const sourceRequest = useRef(0);
  const [viewEpoch, setViewEpoch] = useState(0);
  const [state, setState] = useState<EditorState>(() => ({
    pack: initial.workspace.pack,
    selectedLevelIndex: initial.workspace.selectedLevelIndex,
    selection: { kind: "level" },
    canvasTool: "select",
    pendingPath: null,
    contextMenu: null,
    jsonText: "",
    importMessage: "",
    sidebarCollapsed: false,
    importPanelOpen: false,
    sidebarPanes: { tree: true, inspector: true, blueprints: false },
    pinnedAreaBlueprintKeys: [],
    activeViewportBounds: null,
    snap: { enabled: false, increment: 1, mode: "toGrid" },
  }));
  const [history, setHistory] = useState<MapPackV1[]>([]);
  const [redoHistory, setRedoHistory] = useState<MapPackV1[]>([]);
  const [loadedPack, setLoadedPack] = useState<MapPackV1>(initial.workspace.baseline);
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const level = currentLevel(state.pack, state.selectedLevelIndex);
  const validation = useMemo(() => validateLevel(state.pack, level), [state.pack, level]);
  const computedBounds = useMemo(() => getBounds(level), [level]);
  const bounds = state.activeViewportBounds ?? computedBounds;
  const exportValue = useMemo(() => JSON.stringify(exportJsonValue(state.pack), null, 2), [state.pack]);
  const jsonValue = state.jsonText || exportValue;
  const theme = state.pack.editor?.theme ?? "light";
  const dirty = useMemo(() => JSON.stringify(state.pack) !== JSON.stringify(loadedPack), [state.pack, loadedPack]);
  const isDefault = state.pack.defaultLevelCode === level.code || state.pack.defaultLevelCode === levelCode(state.pack, level);

  useEffect(() => {
    if (initial.error) return; // Keep an unreadable draft intact for recovery.
    try {
      localStorage.setItem(mapDraftKey, JSON.stringify({ pack: state.pack, baseline: loadedPack, selectedLevelIndex: state.selectedLevelIndex, source }));
      setDraftError("");
    } catch { setDraftError("Map autosave unavailable. Export the pack before leaving."); }
  }, [state.pack, state.selectedLevelIndex, loadedPack, source, initial.error]);

  const refreshGame = async (signal?: AbortSignal) => {
    const requestId = ++sourceRequest.current;
    setGameLoading(true);
    try {
      const response = await fetch("/api/game-maps", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not open LaMow maps.");
      const pack = importJsonText(JSON.stringify(result.pack)).pack;
      if (signal?.aborted || requestId !== sourceRequest.current) return;
      setGame({ ...result, pack }); setGameError("");
      if (!initial.recovered && !initial.error && editEpoch.current === 0) replacePack(pack, { kind: "game", label: result.source, revision: result.revision }, "Opened LaMow maps.");
    } catch (error) { if (!signal?.aborted && requestId === sourceRequest.current) { setGame(null); setGameError(error instanceof Error ? error.message : "LaMow maps unavailable."); } }
    finally { if (!signal?.aborted && requestId === sourceRequest.current) setGameLoading(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    void refreshGame(controller.signal);
    const onFocus = () => { void refreshGame(controller.signal); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.removeEventListener("focus", onFocus); };
  }, []);

  const switchLevel = (index: number) => {
    if (!state.pack.levels[index]) return;
    editEpoch.current++;
    setState(current => ({ ...current, selectedLevelIndex: index, selection: { kind: "level" }, pendingPath: null, contextMenu: null, activeViewportBounds: null, canvasTool: "select", jsonText: "" }));
  };

  function replacePack(pack: MapPackV1, nextSource: MapSource, message: string) {
    editEpoch.current++; setViewEpoch(value => value + 1);
    setLoadedPack(clone(pack)); setSource(nextSource); setHistory([]); setRedoHistory([]); setReplacement(null); setSourceOpen(false);
    setState(current => ({ ...current, pack, selectedLevelIndex: levelIndex(pack, pack.defaultLevelCode), selection: { kind: "level" }, canvasTool: "select", pendingPath: null, contextMenu: null, activeViewportBounds: null, jsonText: "", importMessage: message }));
  }
  const requestPack = (pack: MapPackV1, nextSource: MapSource, message: string) => {
    if (dirty) { setReplacement({ pack, source: nextSource, message }); setSourceOpen(true); }
    else replacePack(pack, nextSource, message);
  };

  const record = (updater: (current: EditorState) => EditorState, historyEntry = true) => {
    editEpoch.current++;
    if (historyEntry) {
      setHistory((items) => [...items, clone(state.pack)].slice(-100));
      setRedoHistory([]);
    }
    setState(updater(state));
  };
  const updateLevel = (updater: (level: LevelV1) => LevelV1, historyEntry = true) => record((current) => ({ ...current, pack: updateCurrentLevel(current.pack, current.selectedLevelIndex, updater), jsonText: "" }), historyEntry);
  const updateArea = (path: number[], updater: (area: Area) => Area) => updateLevel((current) => ({ ...current, areas: updateAreasAtPath(current.areas, path, updater) }));
  const nextId = (base: string) => collectUniqueId(level, base);

  const deleteSelection = (item = state.selection) => {
    record((current) => {
      const nextPack = updateCurrentLevel(current.pack, current.selectedLevelIndex, (currentLevel) => {
        if (item.kind === "area" && item.path) return { ...currentLevel, areas: removeAreaAtPath(currentLevel.areas, item.path) };
        if (item.kind === "vegetation" && item.path && item.vegetationIndex !== undefined) return { ...currentLevel, areas: updateAreasAtPath(currentLevel.areas, item.path, (area) => ({ ...area, vegetation: removeArrayItem(area.vegetation, item.vegetationIndex!) })) };
        if (item.kind === "road" && item.index !== undefined) return { ...currentLevel, roads: removeArrayItem(currentLevel.roads, item.index) };
        if (item.kind === "dirtPath" && item.index !== undefined) return { ...currentLevel, dirtPaths: removeArrayItem(currentLevel.dirtPaths, item.index) };
        if (item.kind === "fence" && item.index !== undefined) return { ...currentLevel, fences: removeArrayItem(currentLevel.fences, item.index) };
        if (item.kind === "heightFeature" && item.index !== undefined) return { ...currentLevel, terrain: { heightFeatures: removeArrayItem(currentLevel.terrain.heightFeatures, item.index) } };
        return currentLevel;
      });
      return { ...current, pack: nextPack, selection: { kind: "level" }, contextMenu: null, jsonText: "" };
    });
  };

  const duplicateSelection = (item: Selection) => {
    const sourceLevel = currentLevel(state.pack, state.selectedLevelIndex);
    if (item.kind === "area" && item.path) {
      const source = item.path.reduce<Area | undefined>((current, index) => (current ? current.children?.[index] : sourceLevel.areas[index]), undefined);
      if (!source) return;
      record((current) => {
        const level = currentLevel(current.pack, current.selectedLevelIndex);
        const copy = translateArea({ ...clone(source), id: collectUniqueId(level, `${source.id}Copy`) }, 1, 1);
        const parentPath = item.path!.slice(0, -1);
        const result = addAreaToLevel(level, copy, parentPath.length > 0 ? parentPath : undefined);
        return { ...current, pack: updateCurrentLevel(current.pack, current.selectedLevelIndex, () => result.level), selection: { kind: "area", path: result.path }, contextMenu: null, jsonText: "" };
      });
      return;
    }
    if (item.kind === "road" && item.index !== undefined) updateLevel((current) => ({ ...current, roads: [...current.roads, { ...clone(current.roads[item.index!]), id: nextId(`${current.roads[item.index!].id}Copy`), shape: translatePathShape(current.roads[item.index!].shape, 1, 1) }] }));
    if (item.kind === "dirtPath" && item.index !== undefined) updateLevel((current) => ({ ...current, dirtPaths: [...current.dirtPaths, { ...clone(current.dirtPaths[item.index!]), id: nextId(`${current.dirtPaths[item.index!].id}Copy`), shape: translatePathShape(current.dirtPaths[item.index!].shape, 1, 1) }] }));
    if (item.kind === "fence" && item.index !== undefined) updateLevel((current) => ({ ...current, fences: [...current.fences, { ...clone(current.fences[item.index!]), id: nextId(`${current.fences[item.index!].id}Copy`), shape: translatePathShape(current.fences[item.index!].shape, 1, 1) }] }));
    if (item.kind === "heightFeature" && item.index !== undefined) updateLevel((current) => ({ ...current, terrain: { heightFeatures: [...current.terrain.heightFeatures, { ...clone(current.terrain.heightFeatures[item.index!]), id: nextId(`${current.terrain.heightFeatures[item.index!].id}Copy`), shape: translateShape(current.terrain.heightFeatures[item.index!].shape, 1, 1) }] } }));
    setState((current) => ({ ...current, contextMenu: null }));
  };

  const addArea = (point: Point2, parentPath?: number[]) => {
    record((current) => {
      const level = currentLevel(current.pack, current.selectedLevelIndex);
      const area: Area = { id: collectUniqueId(level, "lawnArea"), kind: "area", role: "lawn", shape: { type: "rectangle", center: point, size: [4, 4] }, vegetation: [{ id: collectUniqueId(level, "grassLayer"), type: "grass", distribution: { type: "uniform", density: 1 } }] };
      const result = addAreaToLevel(level, area, parentPath);
      return { ...current, pack: updateCurrentLevel(current.pack, current.selectedLevelIndex, () => result.level), selection: { kind: "area", path: result.path }, contextMenu: null, jsonText: "" };
    });
  };
  const addPathItem = (kind: PathTool, start: Point2, end: Point2) => {
    updateLevel((current) => {
      if (kind === "fence") return { ...current, fences: [...current.fences, { id: nextId("fence"), kind: "fence", height: 1, postSpacing: 2, shape: { type: "line", start, end } } satisfies Fence] };
      if (kind === "road") return { ...current, roads: [...current.roads, { id: nextId("road"), kind: "road", width: 3.2, shape: { type: "line", start, end } } satisfies Road] };
      return { ...current, dirtPaths: [...current.dirtPaths, { id: nextId("dirtPath"), kind: "dirtPath", width: 1.1, shape: { type: "line", start, end } } satisfies DirtPath] };
    });
  };
  const addFenceSegment = (point: Point2): boolean => {
    if (state.selection.kind !== "fence" || state.selection.index === undefined) return false;
    const fence = level.fences[state.selection.index];
    if (!fence || fenceClosed(fence)) return false;
    updateLevel((current) => ({ ...current, fences: updateArray(current.fences, state.selection.index!, appendFencePoint(current.fences[state.selection.index!], point)) }));
    return true;
  };
  const addHill = (point: Point2) => {
    updateLevel((current) => ({ ...current, terrain: { heightFeatures: [...current.terrain.heightFeatures, { id: nextId("hill"), type: "hill", shape: { type: "circle", center: point, radius: 4 }, height: 1.5, falloff: 1 } satisfies HeightFeature] } }));
  };
  const addBlueprint = (key: string, point: Point2) => {
    record((current) => {
      const level = currentLevel(current.pack, current.selectedLevelIndex);
      const area = createAreaFromBlueprint(key, point, (base) => collectUniqueId(level, base), undefined, current.pack.editor?.blueprints ?? []);
      if (!area) return current;
      const result = addAreaToLevel(level, area, current.selection.kind === "area" ? current.selection.path : undefined);
      return { ...current, pack: updateCurrentLevel(current.pack, current.selectedLevelIndex, () => result.level), selection: { kind: "area", path: result.path }, contextMenu: null, jsonText: "" };
    });
  };

  const addFromTree = (kind: "level" | "area" | "road" | "dirtPath" | "fence" | "hill") => {
    if (kind === "level") {
      record((current) => ({ ...current, pack: { ...current.pack, levels: [...current.pack.levels, { ...clone(defaultPack.levels[0]), code: nextLevelCode(current.pack), name: `Level ${nextLevelCode(current.pack).slice(5)}` }] }, selectedLevelIndex: current.pack.levels.length, selection: { kind: "level" }, activeViewportBounds: null, pendingPath: null, contextMenu: null, canvasTool: "select", jsonText: "" }));
    } else if (kind === "area") addArea([0, 0], state.selection.kind === "area" ? state.selection.path : undefined);
    else if (kind === "hill") addHill([0, 0]);
    else if (kind === "road") addPathItem("road", [-4, 0], [4, 0]);
    else if (kind === "dirtPath") addPathItem("dirtPath", [-3, 2], [3, 2]);
    else addPathItem("fence", [-4, -4], [4, -4]);
  };

  const currentLevelFromState = (editorState: EditorState) => currentLevel(editorState.pack, editorState.selectedLevelIndex);

  const selectedArea = state.selection.kind === "area" && state.selection.path ? state.selection.path.reduce<Area | undefined>((current, index) => (current ? current.children?.[index] : level.areas[index]), undefined) : undefined;

  const updateBlueprints = (updater: (blueprints: EditorBlueprint[]) => EditorBlueprint[]) => {
    record((current) => {
      const editor = current.pack.editor ?? { blueprints: [], theme: "light" as const };
      return { ...current, pack: { ...current.pack, editor: { ...editor, blueprints: updater(editor.blueprints ?? []) } } };
    });
  };

  const setTheme = (theme: "light" | "dark") => {
    record((current) => ({ ...current, pack: { ...current.pack, editor: { ...(current.pack.editor ?? {}), theme } } }), false);
  };

  const pathToolClick = (kind: PathTool, point: Point2) => {
    if (kind === "fence" && addFenceSegment(point)) return;
    if (!state.pendingPath || state.pendingPath.kind !== kind) {
      setState((current) => ({ ...current, pendingPath: { kind, start: point }, canvasTool: kind }));
      return;
    }
    if (kind === "fence") {
      record((current) => {
        const currentLevel = currentLevelFromState(current);
        const fence: Fence = { id: collectUniqueId(currentLevel, "fence"), kind: "fence", height: 1, postSpacing: 2, shape: { type: "line", start: current.pendingPath!.start, end: point } };
        const index = currentLevel.fences.length;
        return { ...current, pack: updateCurrentLevel(current.pack, current.selectedLevelIndex, (level) => ({ ...level, fences: [...level.fences, fence] })), selection: { kind: "fence", index }, pendingPath: null, canvasTool: kind, jsonText: "" };
      });
      return;
    }
    addPathItem(kind, state.pendingPath.start, point);
    setState((current) => ({ ...current, pendingPath: null, canvasTool: kind }));
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setRedoHistory((items) => [...items, clone(state.pack)].slice(-100));
    setHistory((items) => items.slice(0, -1));
    setState((current) => ({ ...current, pack: previous, selectedLevelIndex: Math.min(current.selectedLevelIndex, previous.levels.length - 1), selection: { kind: "level" }, pendingPath: null, contextMenu: null, activeViewportBounds: null, jsonText: "", importMessage: "Undid last edit." }));
  };

  const redo = () => {
    const next = redoHistory.at(-1);
    if (!next) return;
    setHistory((items) => [...items, clone(state.pack)].slice(-100));
    setRedoHistory((items) => items.slice(0, -1));
    setState((current) => ({ ...current, pack: next, selectedLevelIndex: Math.min(current.selectedLevelIndex, next.levels.length - 1), selection: { kind: "level" }, pendingPath: null, contextMenu: null, activeViewportBounds: null, jsonText: "", importMessage: "Redid last edit." }));
  };

  const setCanvasTool = (tool: CanvasTool) => {
    if (tool === "spawn") {
      setState((current) => ({ ...current, selection: { kind: "spawn" }, canvasTool: "select", pendingPath: null }));
      return;
    }
    setState((current) => ({ ...current, canvasTool: tool, pendingPath: tool !== current.pendingPath?.kind ? null : current.pendingPath }));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName ?? "")) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, redoHistory, state.pack]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const loadJsonText = (text: string) => {
    try {
      const result = importJsonText(text);
      const pack = normalizePack(result.pack);
      requestPack(pack, { kind: "file", label: pack.pack.name }, result.message);
    } catch (error) {
      setState((current) => ({ ...current, importMessage: error instanceof Error ? error.message : "Could not import JSON." }));
    }
  };

  const downloadJson = () => {
    const blob = new Blob([exportValue], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lawn-maps.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setState((current) => ({ ...current, importMessage: `Exported all ${state.pack.levels.length} levels as lawn-maps.json. Install and rebake in LaMow to update the game.` }));
  };

  const revertLoadedPack = () => {
    requestPack(clone(loadedPack), source, "Reverted to the last opened pack.");
  };

  const loadSample = (key: string) => {
    const sample = samplePacks.find((item) => item.key === key);
    if (!sample) return;
    const pack = normalizePack(sample.create());
    requestPack(pack, { kind: "sample", label: sample.label }, `Loaded ${sample.label}.`);
  };

  return (
    <AppShell leftCollapsed={state.sidebarCollapsed} rightOpen={state.importPanelOpen}>
      <AppTopBar
        levelControls={<>
          <Popover open={sourceOpen} onOpenChange={open => { setSourceOpen(open); if (!open) setReplacement(null); }} trigger={<Button size="compact" title={source.label}>{source.kind === "game" ? "LaMow maps" : source.kind === "file" ? "Imported pack" : "Sample pack"}{dirty ? " *" : ""}</Button>}>
            <div className="grid max-w-sm gap-2 rounded border border-[var(--surface-border)] bg-[var(--surface-bg)] p-3 text-sm">
              {replacement ? <><strong>Replace this map draft?</strong><div className="flex gap-2"><Button size="compact" onClick={() => { setReplacement(null); setSourceOpen(false); }}>Cancel</Button><Button size="compact" onClick={() => replacePack(replacement.pack, replacement.source, replacement.message)}>Replace draft</Button></div></> : <>
                <strong>{source.label}</strong>
                <span>{dirty ? (draftError ? "Draft not saved" : "Draft saved in this browser") : "No local changes"}</span>
                {game && <span data-testid="game-map-status">{game.baked.status === "current" ? "Game bake matches its map source" : game.baked.status === "stale" ? "Game bake is older than its map source" : "Game bake unavailable"}{source.kind === "game" && source.revision !== game.revision ? " · Newer source available" : ""}</span>}
                {gameError && <span role="alert">{gameError}</span>}
                <div className="flex flex-wrap gap-2"><Button size="compact" disabled={!game || gameLoading} onClick={() => game && requestPack(game.pack, { kind: "game", label: game.source, revision: game.revision }, "Opened LaMow maps.")}>Open LaMow maps</Button><Button size="compact" disabled={gameLoading} onClick={() => void refreshGame()}>Refresh source</Button><Button size="compact" onClick={downloadJson}>Export pack</Button></div>
              </>}
            </div>
          </Popover>
          <select aria-label="Current level" value={state.selectedLevelIndex} onChange={event => switchLevel(Number(event.target.value))} className="h-9 max-w-[min(24rem,35vw)] rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-2 text-sm font-semibold" data-testid="level-selector">
            {state.pack.levels.map((item, index) => <option key={index} value={index}>{item.name} · {item.code}</option>)}
          </select>
          <Button size="icon" aria-label={isDefault ? "Game startup level" : "Use this level at game startup"} title={isDefault ? "Game startup level" : "Use this level at game startup"} aria-pressed={isDefault} onClick={() => { if (!isDefault) record(current => ({ ...current, pack: { ...current.pack, defaultLevelCode: level.code }, jsonText: "" })); }}><Star size={16} fill={isDefault ? "currentColor" : "none"}/></Button>
        </>}
        sidebarCollapsed={state.sidebarCollapsed}
        rightSidebarOpen={state.importPanelOpen}
        onViewChange={onViewChange}
        onToggleSidebar={() => setState((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }))}
        onToggleRightSidebar={() => setState((current) => ({ ...current, importPanelOpen: !current.importPanelOpen }))}
        onOpenBlueprints={() => setBlueprintsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <Panel as="aside" className="grid-rows-[minmax(0,1fr)]">
        <SidebarSlot>
          {state.sidebarCollapsed ? null : (
            <Sidebar
              level={level}
              selection={state.selection}
              panes={state.sidebarPanes}
              onPaneToggle={(name: keyof SidebarPanes, open) => setState((current) => ({ ...current, sidebarPanes: { ...current.sidebarPanes, [name]: open }, sidebarCollapsed: false }))}
              onSelect={(selection) => setState((current) => ({ ...current, selection }))}
              onDelete={deleteSelection}
              onAdd={addFromTree}
              inspector={<Inspector level={level} selection={state.selection} onUpdateLevel={updateLevel} onUpdateArea={updateArea} onDeleteSelection={() => deleteSelection()} />}
            />
          )}
        </SidebarSlot>
      </Panel>
      <Panel className="grid-rows-[minmax(0,1fr)]">
        <CanvasPanelLayout>
          <ViewportToolbar activeTool={state.canvasTool} pinnedAreaBlueprintKeys={state.pinnedAreaBlueprintKeys} customBlueprints={state.pack.editor?.blueprints ?? []} canUndo={history.length > 0} canRedo={redoHistory.length > 0} onTool={setCanvasTool} onAdd={(kind) => addFromTree(kind)} onAddBlueprintAtOrigin={(key) => addBlueprint(key, [0, 0])} onUndo={undo} onRedo={redo} />
          <MapStage>
            <SnapControls settings={state.snap} onChange={(snap) => setState((current) => ({ ...current, snap }))} />
            <Viewport key={`${viewEpoch}:${state.selectedLevelIndex}`} level={level} bounds={bounds} selection={state.selection} canvasTool={state.canvasTool} pendingPath={state.pendingPath} snap={state.snap} onSelect={(selection) => setState((current) => ({ ...current, selection }))} onClearSelection={() => setState((current) => ({ ...current, selection: { kind: "level" } }))} onUpdateLevel={(updater, historyEntry = true) => updateLevel(updater, historyEntry)} onContextMenu={(screenX, screenY, world, target) => setState((current) => ({ ...current, contextMenu: { screenX, screenY, world, target } }))} onAddArea={addArea} onAddHill={addHill} onPathToolClick={pathToolClick} onFreezeViewport={() => setState((current) => ({ ...current, activeViewportBounds: getBounds(level) }))} onReleaseViewport={() => setState((current) => ({ ...current, activeViewportBounds: null }))} />
          </MapStage>
          <StatusStrip>{draftError && <StatusMessage tone="error">{draftError}</StatusMessage>}{gameLoading ? <StatusMessage>Checking LaMow maps…</StatusMessage> : source.kind === "game" ? <StatusMessage>{state.pack.levels.length} levels · {dirty ? "Editor draft" : "Game source"}{game && source.revision !== game.revision ? " · Newer game source available" : ""}{game?.baked.status === "stale" ? " · Game needs rebaking" : ""}</StatusMessage> : <StatusMessage>{source.label} · {state.pack.levels.length} levels{gameError ? " · Game source unavailable" : ""}</StatusMessage>}{validation.map((error) => <StatusMessage key={error} tone="error">{error}</StatusMessage>)}</StatusStrip>
        </CanvasPanelLayout>
      </Panel>
      {state.importPanelOpen ? (
        <Panel as="aside">
          <FloatingAsideLayout>
            <PanelHeader>
              <h2>Import / Export</h2>
            </PanelHeader>
            <ImportExportPane pack={state.pack} value={jsonValue} message={state.importMessage} samples={samplePacks} onJsonText={(jsonText) => setState((current) => ({ ...current, jsonText }))} onCopy={() => navigator.clipboard.writeText(jsonValue).then(() => setState((current) => ({ ...current, importMessage: "Copied JSON to clipboard." })))} onDownload={downloadJson} onLoadJson={() => loadJsonText(jsonValue)} onOpenFile={(file) => file.text().then(loadJsonText).catch((error) => setState((current) => ({ ...current, importMessage: error instanceof Error ? error.message : "Could not import JSON file." })))} onRevert={revertLoadedPack} onLoadSample={loadSample} />
          </FloatingAsideLayout>
        </Panel>
      ) : null}
      <BlueprintsDialog
        open={blueprintsOpen}
        customBlueprints={state.pack.editor?.blueprints ?? []}
        selectedArea={selectedArea}
        pinnedAreaBlueprintKeys={state.pinnedAreaBlueprintKeys}
        onPinBlueprint={(key, pinned) => setState((current) => ({ ...current, pinnedAreaBlueprintKeys: pinned ? [...new Set([...current.pinnedAreaBlueprintKeys, key])] : current.pinnedAreaBlueprintKeys.filter((item) => item !== key) }))}
        onCreateFromSelection={() => selectedArea && updateBlueprints((items) => [...items, blueprintFromArea(selectedArea)])}
        onUpdateBlueprint={(blueprint) => updateBlueprints((items) => items.map((item) => (item.key === blueprint.key ? blueprint : item)))}
        onDeleteBlueprint={(key) => updateBlueprints((items) => items.filter((item) => item.key !== key))}
        onClose={() => setBlueprintsOpen(false)}
      />
      <SettingsDialog open={settingsOpen} theme={theme} onTheme={setTheme} onClose={() => setSettingsOpen(false)} />
      <ContextMenu menu={state.contextMenu} pinnedAreaBlueprintKeys={state.pinnedAreaBlueprintKeys} customBlueprints={state.pack.editor?.blueprints ?? []} onClose={() => setState((current) => ({ ...current, contextMenu: null }))} onSelect={(selection: Selection) => setState((current) => ({ ...current, selection, contextMenu: null }))} onDuplicate={duplicateSelection} onDelete={(selection) => deleteSelection(selection)} onMoveSpawn={() => state.contextMenu && updateLevel((current) => ({ ...current, spawn: { ...current.spawn, position: state.contextMenu!.world } }))} onAddArea={() => state.contextMenu && addArea(state.contextMenu.world)} onAddChildArea={() => state.contextMenu && addArea(state.contextMenu.world, state.contextMenu.target?.kind === "area" ? state.contextMenu.target.path : state.selection.kind === "area" ? state.selection.path : undefined)} onAddBlueprint={(key) => state.contextMenu && addBlueprint(key, state.contextMenu.world)} onStartFence={() => state.contextMenu && pathToolClick("fence", state.contextMenu.world)} onAddRoad={() => state.contextMenu && addPathItem("road", [state.contextMenu.world[0] - 2, state.contextMenu.world[1]], [state.contextMenu.world[0] + 2, state.contextMenu.world[1]])} onAddDirtPath={() => state.contextMenu && addPathItem("dirtPath", [state.contextMenu.world[0] - 2, state.contextMenu.world[1]], [state.contextMenu.world[0] + 2, state.contextMenu.world[1]])} onAddHill={() => state.contextMenu && addHill(state.contextMenu.world)} />
    </AppShell>
  );
}

function fenceClosed(fence: Fence): boolean {
  const points = fencePoints(fence);
  const first = points[0];
  const last = points.at(-1);
  return Boolean(first && last && points.length > 2 && first[0] === last[0] && first[1] === last[1]);
}

function appendFencePoint(fence: Fence, point: Point2): Fence {
  if (fence.shape.type === "line") return { ...fence, shape: { type: "polyline", points: [fence.shape.start, fence.shape.end, point] } };
  if (fence.shape.type === "polyline") return { ...fence, shape: { ...fence.shape, points: [...fence.shape.points, point] } };
  return { ...fence, shape: { type: "polyline", points: [fence.shape.start, ...fence.shape.curves.map((curve) => curve.end), point] } };
}

function fencePoints(fence: Fence): Point2[] {
  if (fence.shape.type === "line") return [fence.shape.start, fence.shape.end];
  if (fence.shape.type === "polyline") return fence.shape.points;
  return [fence.shape.start, ...fence.shape.curves.map((curve) => curve.end)];
}
