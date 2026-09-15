import { advanceNumberHold, createNumberHoldCurve, numberFractionPadding, type HoldAcceleration, type NumberHoldProgress } from "../Components/Base/numberHold";
import { useAssetHistory } from "../utilities/assets/useAssetHistory";
import { assetDigest, readVersion, ensureArchetype, exportArchetype, transferArchetype, readVersionLibrary, mergeArchetypeCatalog, readArchetypeCatalog, type CatalogAsset } from "../utilities/assets/versionLibrary";
import { ContextMenuRoot, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSeparator } from "../Components/Base/ContextMenu";
import { Dialog } from "../Components/Base/Dialog";
import { AssetMenu } from "../Views/AssetMenu";
import { AssetVersions } from "../Views/AssetVersions";
import { Play, ChevronDown, Undo2, Redo2, Download, FileUp, GitBranch, GripVertical, Map, Menu as MenuIcon, PackageOpen, Plus, Split, Sprout, Trash2, Wand2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { ActionRow, Button, FileButton, Menu, MenuItem, MenuLabel, Panel, PanelBody, PanelHeader, Popover, Stack, TopBar } from "../Components/Base";
import { FormLabel, SelectField } from "../Components/Base/FormControls";
import { ObjPrimitiveBabylonEditor } from "../Views/ObjPrimitiveBabylonEditor";
import { VegetationBabylonPreview } from "../Views/VegetationBabylonPreview";
import { readVegetationDrafts, vegetationDraftKey } from "../utilities/assets/drafts";
import {
  defaultObjPrimitiveId,
  defaultObjPrimitiveLibrary,
  edgeVertices,
  loadBuiltInObjPrimitiveLibrary,
  objPrimitiveEdges,
  parseObjPrimitiveMesh,
  replaceObjPrimitiveVertex,
  serializeObjPrimitiveMesh,
  setObjPrimitiveEdgeSharp,
  type ObjPrimitiveMesh,
} from "../utilities/assets/objPrimitives";
import {
  cloverClusterShapeToRecipe,
  defaultGrassLodSettings,
  defaultVegetationAsset,
  fieldFlowerShapeToRecipe,
  parseVegetationAsset,
  recipeToCloverClusterShape,
  recipeToFieldFlowerShape,
  type BranchPhrase,
  type ColorHex,
  type CountVariation,
  type FormPhrase,
  type ForkPhrase,
  type GrassLodSettings,
  type GrowthPhrase,
  type IdealVariation,
  type VegetationGrowthRecipe,
  type VegetationSpeciesAssetFile,
} from "../utilities/assets/vegetation";

type Props = {
  onOpenMapEditor: () => void;
  onPlaytest: (asset: VegetationSpeciesAssetFile) => void;
};
type PhraseDropPosition = "before" | "after" | "inside";
type PhraseDropTarget = { id: string; position: PhraseDropPosition };
const recipeLimits = {
  countMax: 64,
  growDistanceMax: 0.8,
  growRadiusMax: 0.08,
  forkRadiusMax: 0.3,
} as const;

export function AssetsPage(props: Props) {
  const [boot, setBoot] = useState<{ catalog: CatalogAsset[]; error?: string }>();
  useEffect(() => {
    let cancelled = false;
    readArchetypeCatalog().then(catalog => { if (!cancelled) setBoot({ catalog }); }).catch(error => { if (!cancelled) setBoot({ catalog: [], error: error.message }); });
    return () => { cancelled = true; };
  }, []);
  if (!boot) return <div role="status" className="p-4">Loading archetypes…</div>;
  return <AssetEditor {...props} catalog={boot.catalog} libraryError={boot.error} onStandardChanged={asset => setBoot(current => ({ ...current, catalog: [...(current?.catalog ?? []).filter(entry => entry.asset.species.id !== asset.species.id), { asset, isStandard: true }] }))} />;
}

function AssetEditor({ onOpenMapEditor, onPlaytest, catalog, libraryError, onStandardChanged }: Props & { catalog: CatalogAsset[]; libraryError?: string; onStandardChanged: (asset: VegetationSpeciesAssetFile) => void }) {
  const [recovery] = useState(readVegetationDrafts);
  const [speciesAssets, setSpeciesAssets] = useState<VegetationSpeciesAssetFile[]>(() => mergeArchetypeCatalog(makeInitialSpeciesAssets(), catalog, recovery.drafts?.speciesAssets));
  const [primitiveMeshes, setPrimitiveMeshes] = useState<ObjPrimitiveMesh[]>(() => recovery.drafts?.primitiveMeshes ?? speciesAssets.find(asset => asset.species.id === defaultVegetationAsset.species.id)?.primitives ?? defaultObjPrimitiveLibrary());
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(recovery.drafts?.selectedSpeciesId ?? defaultVegetationAsset.species.id);
  const [versionBases, setVersionBases] = useState<Record<string, string>>(() => {
    const starterIds = new Set(makeInitialSpeciesAssets().map(asset => asset.species.id));
    const draftIds = new Set(recovery.drafts?.speciesAssets.map(asset => asset.species.id));
    const fresh = catalog.filter(entry => entry.versionId && !draftIds.has(entry.asset.species.id) && (entry.isStandard || !starterIds.has(entry.asset.species.id)));
    const recovered = Object.entries(recovery.drafts?.versionBases ?? {}).filter(([id]) => draftIds.has(id));
    return Object.fromEntries([...fresh.map(entry => [entry.asset.species.id, entry.versionId!]), ...recovered]);
  });
  const initialBases = useRef(new globalThis.Map([...makeInitialSpeciesAssets(), ...catalog.map(entry => entry.asset)].map(asset => [asset.species.id, asset])));
  const [draftDirty, setDraftDirty] = useState(false);
  const [pendingImport, setPendingImport] = useState<string>();
  const [importBusy, setImportBusy] = useState(false), [importError, setImportError] = useState("");
  const [removing, setRemoving] = useState(false);
  const [autosave, setAutosave] = useState<{ state: "pending" | "saved" | "error"; at?: number }>({ state: "pending", at: recovery.drafts?.savedAt });
  const [primitivesReady, setPrimitivesReady] = useState(Boolean(recovery.drafts));
  const editedPrimitiveIds = useRef(new Set<string>());
  const sourceLibrary = useRef(recovery.drafts?.sourcePrimitiveMeshes ?? defaultObjPrimitiveLibrary());
  const importedPrimitiveLibrary = useRef(Boolean(speciesAssets.find(asset => asset.species.id === selectedSpeciesId)?.primitives));
  const draftRef = useRef({ speciesAssets, primitiveMeshes, selectedSpeciesId, versionBases, sourcePrimitiveMeshes: sourceLibrary.current });
  draftRef.current = { speciesAssets, primitiveMeshes, selectedSpeciesId, versionBases, sourcePrimitiveMeshes: sourceLibrary.current };
  const [selectedPrimitiveId, setSelectedPrimitiveId] = useState(defaultObjPrimitiveId);
  const [selectedPrimitiveVertexIndex, setSelectedPrimitiveVertexIndex] = useState(0);
  const [selectedPhraseId, setSelectedPhraseId] = useState("petal-whorl");
  const [message, setMessage] = useState(recovery.error ?? libraryError ?? "");
  const [inspectorTab, setInspectorTab] = useState<"recipe" | "materials" | "primitives">("recipe");
  const [draggedPhraseId, setDraggedPhraseId] = useState<string | undefined>();
  const [dropTarget, setDropTarget] = useState<PhraseDropTarget | undefined>();
  const asset = speciesAssets.find((item) => item.species.id === selectedSpeciesId) ?? speciesAssets[0] ?? defaultVegetationAsset;
  const history = useAssetHistory({ speciesAssets, primitiveMeshes, selectedSpeciesId, versionBases }, restored => {
    setSpeciesAssets(restored.speciesAssets); setPrimitiveMeshes(restored.primitiveMeshes); setSelectedSpeciesId(restored.selectedSpeciesId);
    setVersionBases(restored.versionBases);
  });
  const grass = asset.editor?.grassLod ?? defaultGrassLodSettings;
  const shape = asset.species.parts[0].shape;
  const fieldFlowerShape = shape.type === "fieldFlower" ? shape : undefined;
  const cloverClusterShape = shape.type === "cloverCluster" ? shape : undefined;
  const recipe = asset.species.constructionRecipe
    ?? (fieldFlowerShape
      ? fieldFlowerShapeToRecipe(fieldFlowerShape, asset.species.parts[0].materialId)
      : cloverClusterShape
        ? cloverClusterShapeToRecipe(cloverClusterShape, asset.species.parts[0].materialId)
        : defaultVegetationAsset.species.constructionRecipe!);
  const selectedPhrase = findPhrase(recipe.root, selectedPhraseId);
  const completeAsset = useMemo(() => ({ ...asset, primitives: primitiveMeshes }), [asset, primitiveMeshes]);
  const isProtectedSpecies = asset.editor?.tags?.includes("starter") && !asset.editor?.tags?.includes("custom");
  const canDeleteSpecies = !isProtectedSpecies && speciesAssets.length > 1;

  useEffect(() => {
    if (recovery.drafts) return;
    let cancelled = false;
    loadBuiltInObjPrimitiveLibrary().then((loaded) => {
      if (cancelled) return;
      sourceLibrary.current = loaded;
      if (!importedPrimitiveLibrary.current) {
        history.skipNextChange();
        setPrimitiveMeshes((current) => [
        ...loaded.map((primitive) => editedPrimitiveIds.current.has(primitive.id) ? current.find((item) => item.id === primitive.id) ?? primitive : primitive),
        ...current.filter((primitive) => editedPrimitiveIds.current.has(primitive.id) && !loaded.some((item) => item.id === primitive.id)),
        ]);
      }
      setPrimitivesReady(true);
      if (!loaded.some((primitive) => primitive.id === selectedPrimitiveId)) {
        setSelectedPrimitiveId(loaded[0]?.id ?? defaultObjPrimitiveId);
        setSelectedPrimitiveVertexIndex(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (recovery.error) { setAutosave({ state: "error" }); return; }
    if (!primitivesReady) return;
    setAutosave(current => current.state === "pending" ? current : ({ ...current, state: "pending" }));
    const timeout = window.setTimeout(() => {
      try {
        const at = Date.now();
        localStorage.setItem(vegetationDraftKey, JSON.stringify({ ...draftRef.current, savedAt: at }));
        setAutosave({ state: "saved", at });
      } catch {
        setAutosave({ state: "error" });
        setMessage("Draft storage is unavailable or full. Save a version or export your work before leaving this page.");
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [speciesAssets, primitiveMeshes, selectedSpeciesId, versionBases, primitivesReady, recovery]);

  useEffect(() => {
    if (!primitivesReady || recovery.error) return;
    const flush = () => { try { localStorage.setItem(vegetationDraftKey, JSON.stringify({ ...draftRef.current, savedAt: Date.now() })); } catch { /* The editor reports storage failures on its next scheduled save. */ } };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [primitivesReady, recovery]);

  const updateAsset = (updater: (current: VegetationSpeciesAssetFile) => VegetationSpeciesAssetFile) => {
    setSpeciesAssets((currentAssets) => currentAssets.map((current) => current.species.id === asset.species.id ? updater(current) : current));
  };

  const updateRecipe = (nextRecipe: VegetationGrowthRecipe) => {
    updateAsset((current) => {
      const currentShape = current.species.parts[0].shape;
      const nextShape = currentShape.type === "fieldFlower"
        ? recipeToFieldFlowerShape(nextRecipe, currentShape)
        : currentShape.type === "cloverCluster"
          ? recipeToCloverClusterShape(nextRecipe, currentShape)
          : currentShape;
      return {
        ...current,
        species: {
          ...current.species,
          constructionRecipe: nextRecipe,
          parts: [{ ...current.species.parts[0], shape: nextShape }],
        },
      };
    });
  };

  const updateSelectedPhrase = (updater: (phrase: GrowthPhrase) => GrowthPhrase) => {
    updateRecipe({ ...recipe, root: updatePhrase(recipe.root, selectedPhraseId, updater) });
  };

  const applyRecipeRoot = (nextRoot: GrowthPhrase[], nextSelectedId: string) => {
    updateRecipe({ ...recipe, root: nextRoot });
    setSelectedPhraseId(nextSelectedId);
  };

  const addRootPhrase = (phrase: GrowthPhrase) => {
    applyRecipeRoot([...recipe.root, phrase], phrase.id);
  };

  const insertRecipePhrase = (targetId: string, position: PhraseDropPosition, phrase: GrowthPhrase) => {
    const inserted = insertPhraseAtTarget(recipe.root, targetId, prepareNewPhrase(phrase, Object.keys(asset.species.materials)), position);
    if (inserted.inserted) applyRecipeRoot(inserted.phrases, phrase.id);
  };

  const createNewSpecies = async () => {
    const index = await readVersionLibrary();
    const occupied = new Set([...speciesAssets.map(item => item.species.id), ...index.archetypes.map(item => item.speciesId)]);
    let id = "customFlower", suffix = 2; while (occupied.has(id)) id = "customFlower" + suffix++;
    const next = cloneAsset(catalog.find(entry => entry.isStandard && entry.asset.species.id === defaultVegetationAsset.species.id)?.asset ?? defaultVegetationAsset);
    next.species = {
      ...next.species,
      id,
      displayName: "Custom Flower",
    };
    next.editor = {
      ...next.editor,
      tags: ["field-flower", "custom"],
    };
    initialBases.current.set(id, next);
    setSpeciesAssets((current) => [...current, next]);
    setSelectedSpeciesId(id);
    setPrimitiveMeshes(next.primitives ?? sourceLibrary.current);
    setSelectedPhraseId(next.species.constructionRecipe?.root[0]?.id ?? "grow-stem");
    setMessage(`Created species "${id}".`);
  };

  const duplicateSpecies = async () => {
    const base = initialBases.current.get(asset.species.id) ?? asset;
    const index = await ensureArchetype({ ...base, primitives: base.primitives ?? sourceLibrary.current });
    const occupied = new Set([...speciesAssets.map(item => item.species.id), ...index.archetypes.map(item => item.speciesId)]);
    let id = asset.species.id + "Copy", suffix = 2; while (occupied.has(id)) id = asset.species.id + "Copy" + suffix++;
    const result = await transferArchetype({ asset: completeAsset, expectedRevision: index.revision, sourceSpeciesId: asset.species.id, targetId: id, displayName: asset.species.displayName + " Copy", currentVersionId: versionBases[asset.species.id] });
    initialBases.current.set(id, result.asset);
    setSpeciesAssets(current => [...current, result.asset]); setVersionBases(current => ({ ...current, [id]: result.currentVersionId }));
    setSelectedSpeciesId(id); setPrimitiveMeshes(result.asset.primitives!); setSelectedPhraseId(result.asset.species.constructionRecipe?.root[0]?.id ?? "");
  };

  const deletePhrase = (phraseId: string) => {
    const deletedPhrase = findPhrase(recipe.root, phraseId);
    if (!deletedPhrase) return;
    const nextRoot = removePhrase(recipe.root, phraseId);
    updateRecipe({ ...recipe, root: nextRoot });
    if (selectedPhraseId === phraseId || phraseContains(deletedPhrase, selectedPhraseId)) setSelectedPhraseId(nextRoot[0]?.id ?? "");
    setMessage(`Deleted phrase "${deletedPhrase.label}".`);
  };

  const movePhrase = (draggedId: string, targetId: string, position: PhraseDropPosition) => {
    if (draggedId === targetId) return;
    const nextRoot = movePhraseInTree(recipe.root, draggedId, targetId, position);
    if (nextRoot === recipe.root) return;
    applyRecipeRoot(nextRoot, draggedId);
    setMessage(`Moved phrase ${position === "inside" ? "inside" : position} target.`);
  };

  const updateGrass = (patch: Partial<GrassLodSettings>) => { updateAsset((current) => ({ ...current, editor: { ...current.editor, grassLod: { ...defaultGrassLodSettings, ...current.editor?.grassLod, ...patch } } })); };

  const replacePrimitive = (nextPrimitive: ObjPrimitiveMesh, resetVertex = true) => {
    editedPrimitiveIds.current.add(nextPrimitive.id);
    const exists = primitiveMeshes.some(primitive => primitive.id === nextPrimitive.id);
    const next = exists ? primitiveMeshes.map(primitive => primitive.id === nextPrimitive.id ? nextPrimitive : primitive) : [...primitiveMeshes, nextPrimitive];
    setPrimitiveMeshes(next);
    updateAsset(current => ({ ...current, primitives: next }));
    setSelectedPrimitiveId(nextPrimitive.id);
    if (resetVertex) setSelectedPrimitiveVertexIndex(0);
  };

  const importObjPrimitive = (file: File) => {
    file.text()
      .then((text) => {
        const fallback = primitiveMeshes.find((primitive) => primitive.id === selectedPrimitiveId) ?? primitiveMeshes[0];
        const imported = parseObjPrimitiveMesh(text, {
          id: fallback?.id ?? defaultObjPrimitiveId,
          displayName: fallback?.displayName ?? "Imported Primitive",
        });
        replacePrimitive(imported);
        setMessage(`Imported OBJ primitive "${imported.displayName}".`);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not import OBJ primitive."));
  };

  const selectSpecies = (id: string) => {
    setSelectedSpeciesId(id);
    setInspectorTab("recipe");
    const next = speciesAssets.find((item) => item.species.id === id);
    setPrimitiveMeshes(next?.primitives ?? sourceLibrary.current);
    setSelectedPhraseId(next?.species.constructionRecipe?.root[0]?.id ?? "grow-stem");
  };

  const deleteSpecies = () => {
    if (!canDeleteSpecies) {
      setMessage("Built-in starter species are protected. Duplicate one, then edit or delete the duplicate.");
      return;
    }
    history.reset(asset.species.id);
    const remaining = speciesAssets.filter((item) => item.species.id !== asset.species.id);
    const next = remaining[0] ?? defaultVegetationAsset;
    setSpeciesAssets(remaining.length ? remaining : [next]);
    setVersionBases(current => { const nextBases = { ...current }; delete nextBases[asset.species.id]; return nextBases; });
    setSelectedSpeciesId(next.species.id);
    setPrimitiveMeshes(next.primitives ?? sourceLibrary.current);
    setSelectedPhraseId(next.species.constructionRecipe?.root[0]?.id ?? "grow-stem");
    setMessage(`Removed draft "${asset.species.id}". Any saved versions remain in the project library and are available again after reopening the editor.`);
  };

  const loadJsonText = async (text: string) => {
    const raw = JSON.parse(text), parsed = parseVegetationAsset(text);
    const index = await readVersionLibrary();
    const result = await transferArchetype({ asset: { ...parsed, primitives: parsed.primitives ?? sourceLibrary.current }, expectedRevision: index.revision, bundle: raw.archetypeLibrary });
    const next = result.asset;
    history.reset(next.species.id);
    importedPrimitiveLibrary.current = true; initialBases.current.set(next.species.id, next);
    setPrimitiveMeshes(next.primitives!);
    setSpeciesAssets(current => current.some(item => item.species.id === next.species.id) ? current.map(item => item.species.id === next.species.id ? next : item) : [...current, next]);
    setVersionBases(current => ({ ...current, [next.species.id]: result.currentVersionId }));
    setSelectedSpeciesId(next.species.id); setSelectedPhraseId(next.species.constructionRecipe?.root[0]?.id ?? ""); setPendingImport(undefined);
  };
  const importFile = async (file: File) => {
    const text = await file.text(); const next = parseVegetationAsset(text);
    const existing = speciesAssets.find(item => item.species.id === next.species.id);
    if (existing) {
      const id = versionBases[existing.species.id];
      const base = id ? (await readVersion(id)).asset : initialBases.current.get(existing.species.id);
      const current = existing.species.id === asset.species.id ? completeAsset : { ...existing, primitives: existing.primitives ?? sourceLibrary.current };
      const baseline = base && { ...base, primitives: base.primitives ?? sourceLibrary.current };
      if (!baseline || await assetDigest(current) !== await assetDigest(baseline)) { setImportError(""); setPendingImport(text); return; }
    }
    await loadJsonText(text);
  };
  const downloadJson = async () => {
    const exported = await exportArchetype(completeAsset, versionBases[asset.species.id] ?? null);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = asset.species.id + ".lamow-vegetation.json";
    document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  const restoreVersion = (saved: VegetationSpeciesAssetFile, versionId: string) => {
    importedPrimitiveLibrary.current = true;
    history.reset(saved.species.id);
    updateAsset(() => saved);
    setVersionBases(current => ({ ...current, [saved.species.id]: versionId }));
    setPrimitiveMeshes(saved.primitives ?? sourceLibrary.current);
    setSelectedPhraseId(saved.species.constructionRecipe?.root[0]?.id ?? "");
    setSelectedPrimitiveId(saved.primitives?.[0]?.id ?? defaultObjPrimitiveId);
    setSelectedPrimitiveVertexIndex(0);
  };

  return (
    <main {...history.handlers} onContextMenu={event => event.preventDefault()} data-testid="asset-editor" className="grid h-screen max-h-screen gap-4 overflow-hidden p-4 [grid-template-rows:auto_minmax(0,1fr)] [grid-template-columns:minmax(230px,280px)_minmax(400px,1fr)_minmax(290px,340px)] max-[984px]:[grid-template-columns:minmax(230px,280px)_minmax(280px,1fr)_minmax(290px,340px)] max-[900px]:h-auto max-[900px]:max-h-none max-[900px]:overflow-auto max-[900px]:[grid-template-columns:1fr] max-[900px]:[grid-template-rows:auto_auto_auto_auto]">
      <TopBar className="col-span-full flex-wrap gap-y-2" data-testid="asset-topbar">
        <div className="flex shrink-0 items-center gap-3">
          <Menu trigger={<Button size="icon" type="button" aria-label="App menu"><MenuIcon /></Button>}>
            <MenuLabel>Navigate</MenuLabel>
            <MenuItem onSelect={onOpenMapEditor}><Map className="mr-2 inline h-4 w-4" /> Map editor</MenuItem>
            <MenuItem disabled><PackageOpen className="mr-2 inline h-4 w-4" /> Asset editor</MenuItem>
          </Menu>
          <h1 className="m-0 text-xl font-semibold leading-tight text-[var(--muted-text)]">Vegetation Assets</h1>
        </div>
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-2" data-testid="asset-document-controls">
          {draftDirty && <span data-testid="asset-autosave" data-state={autosave.state} className="text-[0.68rem] text-[var(--muted-text)]">{autosave.state === "error" ? "Autosave unavailable" : autosave.state === "pending" ? "Autosave" : "Autosaved " + new Date(autosave.at!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" AM", " a").replace(" PM", " p")}</span>}
          <AssetMenu asset={asset} assets={speciesAssets} onSelect={selectSpecies} onNew={createNewSpecies} onDuplicate={duplicateSpecies} onImport={importFile} onExport={downloadJson} onRename={displayName => updateAsset(current => ({ ...current, species: { ...current.species, displayName } }))} onRemove={() => draftDirty ? setRemoving(true) : deleteSpecies()} canRemove={canDeleteSpecies} />
          {primitivesReady && <AssetVersions key={asset.species.id} asset={completeAsset} baselineAsset={{ ...(initialBases.current.get(asset.species.id) ?? asset), primitives: initialBases.current.get(asset.species.id)?.primitives ?? sourceLibrary.current }} currentVersionId={versionBases[asset.species.id] ?? null} onVersionSaved={id => setVersionBases(current => current[asset.species.id] === id ? current : ({ ...current, [asset.species.id]: id }))} onDirtyChange={setDraftDirty} onRestore={restoreVersion} onStandardChanged={onStandardChanged} />}
          <div className="flex items-center gap-1">
            <Button size="compact" aria-label="Undo" title="Undo" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={16}/></Button>
            <Button size="compact" aria-label="Redo" title="Redo" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={16}/></Button>
          </div>
          {(shape.type === "fieldFlower" || shape.type === "cloverCluster") && <Button type="button" size="compact" aria-label="Playtest" title="Play" onClick={() => onPlaytest(completeAsset)}><Play size={16}/></Button>}
        </div>
      </TopBar>

      <Panel as="aside" className="col-start-1 row-start-2 max-[900px]:col-start-1 max-[900px]:row-start-auto">
        <PanelHeader><h2 className="m-0 text-lg">Vegetation</h2></PanelHeader>
        <PanelBody data-testid="asset-species-panel-body">
          <Stack>
            <NumberField label="100% coverage · plants/m²" value={asset.species.coverage?.plantsPerSquareMeter ?? 25} step={0.5} min={0.1} max={200} onChange={(plantsPerSquareMeter) => updateAsset(current => ({ ...current, species: { ...current.species, coverage: { plantsPerSquareMeter } } }))} />
            <details className="rounded-md border border-[var(--input-border)] p-2"><summary className="cursor-pointer text-sm font-semibold">Slat editor</summary><div className="mt-3 grid gap-3">
              <NumberField label="Patch width · meters" value={asset.editor?.preview?.groundPatchMeters ?? 4} step={0.5} min={1} max={8} onChange={groundPatchMeters => updateAsset(current => ({ ...current, editor: { ...current.editor, preview: { ...current.editor?.preview, groundPatchMeters } } }))} />
              <NumberField label="Population seed" value={asset.editor?.preview?.populationSeed ?? 1} step={1} min={0} max={4294967295} onChange={populationSeed => updateAsset(current => ({ ...current, editor: { ...current.editor, preview: { ...current.editor?.preview, populationSeed } } }))} />
              <ColorField label="Vegetation slat color" value={asset.species.lod.farColor ?? asset.species.materials[asset.species.parts[0].materialId].baseColor} onChange={farColor => updateAsset(current => ({ ...current, species: { ...current.species, lod: { ...current.species.lod, farColor } } }))} />
              <NumberField label="Vegetation slat strength" value={asset.species.lod.farStrength ?? 0.5} step={0.05} min={0} max={1} onChange={farStrength => updateAsset(current => ({ ...current, species: { ...current.species, lod: { ...current.species.lod, farStrength } } }))} />
              <GrassLodEditor grass={grass} onChange={updateGrass} />
            </div></details>
            <details className="rounded-md border border-[var(--input-border)] p-2"><summary className="cursor-pointer text-sm font-semibold">Cut appearance</summary><div className="mt-3 grid gap-3">
              <SelectField label="Cut style" value={asset.species.cutAppearance?.style ?? "stems"} options={[{ value: "stems", label: "Stems" }, { value: "grass", label: "Grass stubble" }]} onChange={style => updateAsset(current => ({ ...current, species: { ...current.species, cutAppearance: { height: 0.085, ...current.species.cutAppearance, style: style as "stems" | "grass" } } }))}/>
              <NumberField label="Cut height · meters" value={asset.species.cutAppearance?.height ?? 0.085} min={0.01} max={0.3} step={0.005} onChange={height => updateAsset(current => ({ ...current, species: { ...current.species, cutAppearance: { style: "stems", ...current.species.cutAppearance, height } } }))}/>
              <ColorField label={asset.species.cutAppearance?.style === "grass" ? "Cut tint" : "Cut color"} value={asset.species.cutAppearance?.color ?? (asset.species.cutAppearance?.style === "grass" ? "#ffffff" : asset.species.materials.stem?.baseColor ?? "#486d2f")} onChange={color => updateAsset(current => ({ ...current, species: { ...current.species, cutAppearance: { style: "stems", height: 0.085, ...current.species.cutAppearance, color } } }))}/>
            </div></details>
            <AddPhrasePalette materials={Object.keys(asset.species.materials)} onAdd={addRootPhrase} />
            <div className="grid gap-1">
              {recipe.root.length ? (
                recipe.root.map((phrase) => (
                  <PhraseTree
                    key={phrase.id}
                    phrase={phrase}
                    selectedId={selectedPhraseId}
                    draggedId={draggedPhraseId}
                    dropTarget={dropTarget}
                    depth={0}
                    onDelete={deletePhrase}
                    onDropTarget={setDropTarget}
                    onDragStart={setDraggedPhraseId}
                    onDragEnd={() => {
                      setDraggedPhraseId(undefined);
                      setDropTarget(undefined);
                    }}
                    onMove={movePhrase}
                    onInsert={insertRecipePhrase}
                  onSelect={(id) => { setSelectedPhraseId(id); setInspectorTab("recipe");  }}
                  />
                ))
              ) : (
                <div className="min-h-10 rounded-md border border-dashed border-[var(--panel-border)]" />
              )}
            </div>
          </Stack>
        </PanelBody>
      </Panel>

      <Panel className="col-start-2 row-start-2 grid-rows-[minmax(0,1fr)] max-[900px]:col-start-1 max-[900px]:row-start-auto">

        <PanelBody className="grid h-full min-h-0 overflow-hidden">
          <VegetationBabylonPreview asset={asset} grass={grass} primitiveMeshes={primitiveMeshes} selectedPhraseId={selectedPhraseId} />
        </PanelBody>
      </Panel>

      <Panel as="aside" className="col-start-3 row-start-2 max-[900px]:col-start-1 max-[900px]:row-start-auto">
        <PanelHeader><h2 className="m-0 text-lg">Inspector</h2></PanelHeader>
        <PanelBody data-testid="asset-inspector-panel-body">
          <Stack>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Inspector section">
              {(["recipe", "materials", "primitives"] as const).map((tab) => <Button key={tab} role="tab" aria-selected={inspectorTab === tab} size="compact" tone={inspectorTab === tab ? "primary" : "default"} onClick={() => { setInspectorTab(tab);  }}>{tab === "recipe" ? "Recipe" : tab === "materials" ? "Colors" : tab === "primitives" ? "Meshes" : "Grass"}</Button>)}
            </div>
            {inspectorTab === "recipe" && (selectedPhrase ? (
              <>
                <PhraseProperties
                  phrase={selectedPhrase}
                  materials={Object.keys(asset.species.materials)}
                  onChange={updateSelectedPhrase}
                />
              </>
            ) : (
              <div className="min-h-10 rounded-md border border-dashed border-[var(--panel-border)]" />
            ))}
            {inspectorTab === "materials" && <MaterialEditor asset={asset} onChange={updateAsset} />}
            {inspectorTab === "primitives" && <ObjPrimitiveEditor
              primitives={primitiveMeshes}
              selectedId={selectedPrimitiveId}
              selectedVertexIndex={selectedPrimitiveVertexIndex}
              onImport={importObjPrimitive}
              onSelectPrimitive={(id) => {
                setSelectedPrimitiveId(id);
                setSelectedPrimitiveVertexIndex(0);
              }}
              onSelectVertex={setSelectedPrimitiveVertexIndex}
              onChange={(primitive) => replacePrimitive(primitive, false)}
            />}

            {message ? <div className="rounded-md bg-[var(--subtle-bg)] px-3 py-2 text-sm text-[var(--muted-text)]">{message}</div> : null}
          </Stack>
        </PanelBody>
      </Panel>
      <Dialog open={Boolean(pendingImport)} title="Replace draft?" onOpenChange={next => { if (!next && !importBusy) setPendingImport(undefined); }}><div className="p-4"><ActionRow className="justify-end"><Button disabled={importBusy} onClick={() => setPendingImport(undefined)}>Cancel</Button><Button tone="danger" disabled={importBusy} onClick={() => { if (!pendingImport) return; setImportBusy(true); setImportError(""); void loadJsonText(pendingImport).catch(error => setImportError(error.message)).finally(() => setImportBusy(false)); }}>Import</Button></ActionRow>{importError && <div role="alert" className="mt-3 text-sm">{importError}</div>}</div></Dialog>
      <Dialog open={removing} title="Remove draft?" onOpenChange={setRemoving}><ActionRow className="justify-end p-4"><Button onClick={() => setRemoving(false)}>Cancel</Button><Button tone="danger" onClick={() => { deleteSpecies(); setRemoving(false); }}>Remove</Button></ActionRow></Dialog>
    </main>
  );
}

function PhraseTree({
  phrase,
  selectedId,
  draggedId,
  dropTarget,
  depth,
  onDelete,
  onDropTarget,
  onDragStart,
  onDragEnd,
  onMove,
  onInsert,
  onSelect,
}: {
  phrase: GrowthPhrase;
  selectedId: string;
  draggedId?: string;
  dropTarget?: PhraseDropTarget;
  depth: number;
  onDelete: (id: string) => void;
  onDropTarget: (target: PhraseDropTarget | undefined) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (draggedId: string, targetId: string, position: PhraseDropPosition) => void;
  onInsert: (targetId: string, position: PhraseDropPosition, phrase: GrowthPhrase) => void;
  onSelect: (id: string) => void;
}) {
  const nested = phrase.type === "fork" ? phrase.continuation : phrase.type === "branch" ? phrase.offshoot : phrase.type === "choose" ? phrase.options.flatMap((option) => option.phrase) : [];
  const activeDrop = dropTarget?.id === phrase.id ? dropTarget.position : undefined;
  const canDropInside = canPhraseContain(phrase);
  const rowDropClass = activeDrop === "inside"
    ? "ring-2 ring-[#2f6f34]"
    : activeDrop === "before"
      ? "before:absolute before:-top-1 before:left-2 before:right-2 before:z-[2] before:h-0.5 before:rounded before:bg-[#2f6f34] before:content-['']"
      : activeDrop === "after"
        ? "after:absolute after:-bottom-1 after:left-2 after:right-2 after:z-[2] after:h-0.5 after:rounded after:bg-[#2f6f34] after:content-['']"
        : "";
  const dragDisabled = draggedId === phrase.id;
  const chooseDropPosition = (event: DragEvent<HTMLElement>): PhraseDropPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (y < rect.height * 0.28) return "before";
    if (y > rect.height * 0.72 || !canDropInside) return "after";
    return "inside";
  };
  return (
    <div className="grid gap-1">
      <ContextMenuRoot><ContextMenuTrigger><div
        onContextMenu={() => onSelect(phrase.id)}
        data-testid={`phrase-row-${phrase.id}`} data-selected={selectedId === phrase.id}
        className={`relative grid min-h-8 grid-cols-[1.35rem_1rem_1.2rem_minmax(0,1fr)_auto] items-center gap-1 rounded-md border px-1.5 text-left text-sm ${selectedId === phrase.id ? "border-[#2f6f34] bg-[#e4efdf] ring-1 ring-[#2f6f34] text-[var(--app-text)]" : "border-[var(--panel-border)] bg-[var(--surface-bg)] text-[var(--app-text)]"} ${dragDisabled ? "opacity-55" : ""} ${rowDropClass}`}
        style={{ marginLeft: depth * 18 }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", phrase.id);
          onDragStart(phrase.id);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          const dragged = draggedId ?? event.dataTransfer.getData("text/plain");
          if (!dragged || dragged === phrase.id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onDropTarget({ id: phrase.id, position: chooseDropPosition(event) });
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDropTarget(undefined);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const dragged = draggedId ?? event.dataTransfer.getData("text/plain");
          if (dragged && dragged !== phrase.id) onMove(dragged, phrase.id, dropTarget?.id === phrase.id ? dropTarget.position : chooseDropPosition(event));
          onDragEnd();
        }}
      >
        <button
          type="button"
          aria-label="Delete phrase"
          className="relative z-[1] grid h-6 w-6 place-items-center rounded text-[#9b2424] hover:bg-[#fff0ed] [&_svg]:h-3.5 [&_svg]:w-3.5"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(phrase.id);
          }}
        >
          <Trash2 />
        </button>
        <span className="grid h-6 w-4 cursor-grab place-items-center text-[var(--muted-text)] active:cursor-grabbing [&_svg]:h-3.5 [&_svg]:w-3.5">
          <GripVertical />
        </span>
        <PhraseIcon type={phrase.type} />
        <button className="min-w-0 truncate py-1 text-left" type="button" aria-pressed={selectedId === phrase.id} onClick={() => onSelect(phrase.id)}>
          {phrase.label}
        </button>
        <span className="text-xs uppercase text-[var(--muted-text)]">{phraseTypeLabel(phrase.type)}</span>
      </div></ContextMenuTrigger><ContextMenuContent>
        {(["before", "inside", "after"] as const).filter(position => position !== "inside" || canContainPhrasesForContext(phrase)).map(position => <ContextMenuSub key={position} trigger={<span className="flex justify-between gap-4">Add {position}<ChevronDown size={14} className="-rotate-90"/></span>}>
          {[{ label: "Grow", factory: makeContinuePhrase }, { label: "Fork", factory: makeForkPhrase }, { label: "Branch", factory: makeBranchPhrase }, { label: "Form", factory: makeFormPhrase }].map(item => <ContextMenuItem key={item.label} onSelect={() => onInsert(phrase.id, position, item.factory())}>{item.label}</ContextMenuItem>)}
        </ContextMenuSub>)}
        <ContextMenuSeparator/><ContextMenuItem tone="danger" onSelect={() => onDelete(phrase.id)}>Delete</ContextMenuItem>
      </ContextMenuContent></ContextMenuRoot>
      {nested.map((child) => (
        <PhraseTree
          key={child.id}
          phrase={child}
          selectedId={selectedId}
          draggedId={draggedId}
          dropTarget={dropTarget}
          depth={depth + 1}
          onDelete={onDelete}
          onDropTarget={onDropTarget}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onMove={onMove}
          onInsert={onInsert}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

const canContainPhrasesForContext = (phrase: GrowthPhrase) => phrase.type === "fork" || phrase.type === "branch" || phrase.type === "choose";

function PhraseIcon({ type }: { type: GrowthPhrase["type"] }) {
  if (type === "fork") return <Split className="h-4 w-4" />;
  if (type === "branch") return <GitBranch className="h-4 w-4" />;
  if (type === "continue") return <Sprout className="h-4 w-4" />;
  return <Plus className="h-4 w-4" />;
}

function phraseTypeLabel(type: GrowthPhrase["type"]) {
  if (type === "continue") return "grow";
  if (type === "steer") return "legacy";
  return type;
}

function AddPhrasePalette({ materials, title = "Add", onAdd }: { materials: string[]; title?: string; onAdd: (phrase: GrowthPhrase) => void }) {
  const items = [
    { label: "Grow", factory: makeContinuePhrase, icon: <Sprout className="mr-1 h-4 w-4" /> },
    { label: "Fork", factory: makeForkPhrase, icon: <Split className="mr-1 h-4 w-4" /> },
    { label: "Branch", factory: makeBranchPhrase, icon: <GitBranch className="mr-1 h-4 w-4" /> },
    { label: "Form", factory: makeFormPhrase, icon: <Plus className="mr-1 h-4 w-4" /> },
  ] satisfies { label: string; factory: () => GrowthPhrase; icon: ReactNode }[];
  return (
    <div className="grid gap-2 rounded-md border border-[var(--surface-border)] p-2.5">
      <div className="text-xs font-black uppercase tracking-[0.04em] text-[var(--muted-text)]">{title}</div>
      <ActionRow>
        {items.map((item) => (
          <AddPhraseButton key={item.label} label={item.label} factory={item.factory} icon={item.icon} materials={materials} onAdd={onAdd} />
        ))}
      </ActionRow>
    </div>
  );
}

function AddPhraseButton({ label, factory, icon, materials, onAdd }: { label: string; factory: () => GrowthPhrase; icon: ReactNode; materials: string[]; onAdd: (phrase: GrowthPhrase) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GrowthPhrase>(() => prepareNewPhrase(factory(), materials));
  const openChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setDraft(prepareNewPhrase(factory(), materials));
  };
  return (
    <Popover
      align="start"
      side="right"
      open={open}
      onOpenChange={openChange}
      className="max-h-[min(72vh,720px)] w-72 overflow-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)] p-3 shadow-[0_14px_34px_rgb(31_49_27_/_18%)]"
      trigger={<Button type="button" size="compact">{icon}{label}</Button>}
    >
      <Stack>
        <div className="text-xs font-black uppercase tracking-[0.04em] text-[var(--muted-text)]">Add {label}</div>
        <PhraseDraftFields phrase={draft} materials={materials} onChange={setDraft} />
        <ActionRow>
          <Button
            type="button"
            tone="primary"
            size="compact"
            onClick={() => {
              onAdd(draft);
              setOpen(false);
            }}
          >
            Add {label}
          </Button>
        </ActionRow>
      </Stack>
    </Popover>
  );
}

function prepareNewPhrase(phrase: GrowthPhrase, materials: string[]): GrowthPhrase {
  const preferredMaterial = materials.includes("petal") ? "petal" : materials[0] ?? "petal";
  if (phrase.type === "form") return { ...phrase, materialId: materials.includes(phrase.materialId) ? phrase.materialId : preferredMaterial };
  if (phrase.type === "fork") return { ...phrase, continuation: phrase.continuation.map((child) => prepareNewPhrase(child, materials)) };
  if (phrase.type === "branch") return { ...phrase, offshoot: phrase.offshoot.map((child) => prepareNewPhrase(child, materials)) };
  if (phrase.type === "choose") return { ...phrase, options: phrase.options.map((option) => ({ ...option, phrase: option.phrase.map((child) => prepareNewPhrase(child, materials)) })) };
  if (phrase.type === "color") return { ...phrase, materialId: materials.includes(phrase.materialId) ? phrase.materialId : preferredMaterial };
  return phrase;
}

function PhraseDraftFields({ phrase, materials, onChange }: { phrase: GrowthPhrase; materials: string[]; onChange: (phrase: GrowthPhrase) => void }) {
  return (
    <Stack>
      <InlineTextField label="Label" value={phrase.label} onChange={(label) => onChange({ ...phrase, label })} />
      {phrase.type === "continue" ? (
        <>
          {phrase.pathMode !== "arc" && <Button size="compact" onClick={() => onChange({ ...phrase, pathMode: "arc" })}>Use curved growth</Button>}
          <VariationField label="Distance" value={phrase.distance} step={0.005} min={-recipeLimits.growDistanceMax} max={recipeLimits.growDistanceMax} deviationMax={recipeLimits.growDistanceMax} onChange={(distance) => onChange({ ...phrase, distance })} />
          <VariationField label="Arc degrees" value={phrase.arcDegrees ?? { ideal: 0, deviation: 0 }} step={1} min={-180} max={180} deviationMax={180} onChange={(arcDegrees) => onChange({ ...phrase, arcDegrees })} />
          <VariationField circular disabled={(phrase.arcDegrees?.ideal ?? 0) === 0 && (phrase.arcDegrees?.deviation ?? 0) === 0} label="Arc direction" value={phrase.arcAzimuthDegrees ?? { ideal: 0, deviation: 0 }} step={1} min={-360} max={360} deviationMax={360} onChange={(arcAzimuthDegrees) => onChange({ ...phrase, arcAzimuthDegrees })} />
          <VariationField disabled={!phrase.formAlongPath || phrase.formAlongPath === "none"} label="Start radius" value={phrase.radiusStart ?? { ideal: 0.01, deviation: 0 }} step={0.001} min={-recipeLimits.growRadiusMax} max={recipeLimits.growRadiusMax} deviationMax={recipeLimits.growRadiusMax} onChange={(radiusStart) => onChange({ ...phrase, radiusStart })} />
          <VariationField disabled={!phrase.formAlongPath || phrase.formAlongPath === "none"} label="End radius" value={phrase.radiusEnd ?? { ideal: 0.006, deviation: 0 }} step={0.001} min={-recipeLimits.growRadiusMax} max={recipeLimits.growRadiusMax} deviationMax={recipeLimits.growRadiusMax} onChange={(radiusEnd) => onChange({ ...phrase, radiusEnd })} />
          <SelectField label="Form along path" value={phrase.formAlongPath ?? "none"} options={["none", "stemSkin", "blade"].map((value) => ({ value, label: value }))} onChange={(formAlongPath) => onChange({ ...phrase, formAlongPath: formAlongPath as "none" | "stemSkin" | "blade" })} />
        </>
      ) : null}
      {phrase.type === "fork" ? (
        <>
          <VariationField label="Count" value={phrase.count} integer max={recipeLimits.countMax} onChange={(count) => onChange({ ...phrase, count: count as CountVariation })} />
          <SelectField label="Layout" value={phrase.layout} options={["radial", "spiral", "mirrored", "cluster", "sameAxis"].map((value) => ({ value, label: value }))} onChange={(layout) => onChange({ ...phrase, layout: layout as ForkPhrase["layout"] })} />
          <VariationField disabled={phrase.layout === "sameAxis"} label="Spread degrees" value={phrase.spreadDegrees} step={1} min={-360} max={360} deviationMax={360} onChange={(spreadDegrees) => onChange({ ...phrase, spreadDegrees })} />
          <VariationField label="Radius" value={phrase.radius} step={0.005} min={-recipeLimits.forkRadiusMax} max={recipeLimits.forkRadiusMax} deviationMax={recipeLimits.forkRadiusMax} onChange={(radius) => onChange({ ...phrase, radius })} />
        </>
      ) : null}
      {phrase.type === "branch" ? (
        <>
          <VariationField label="Offshoot count" value={phrase.count} integer max={recipeLimits.countMax} onChange={(count) => onChange({ ...phrase, count: count as CountVariation })} />
          <SelectField label="Layout" value={phrase.layout} options={["alongPath", "radial", "alternating", "tip", "fromForm"].map((value) => ({ value, label: value === "fromForm" ? "fromForm (unavailable)" : value, disabled: value === "fromForm" }))} onChange={(layout) => onChange({ ...phrase, layout: layout as BranchPhrase["layout"] })} />
          <VariationField label="Deviation angle" value={phrase.deviationDegrees ?? { ideal: 55, deviation: 8 }} step={1} min={-180} max={180} deviationMax={180} onChange={(deviationDegrees) => onChange({ ...phrase, deviationDegrees })} />
          <VariationField circular label="Around axis" value={phrase.aroundAxisDegrees ?? phrase.sideBiasDegrees ?? { ideal: 0, deviation: 0 }} step={1} min={-360} max={360} deviationMax={360} onChange={(aroundAxisDegrees) => onChange({ ...phrase, aroundAxisDegrees })} />
        </>
      ) : null}
      {phrase.type === "form" ? (
        <FormPhraseDraftFields phrase={phrase} materials={materials} onChange={(nextPhrase) => onChange(nextPhrase)} />
      ) : null}
    </Stack>
  );
}

function FormPhraseDraftFields({ phrase, materials, onChange }: { phrase: FormPhrase; materials: string[]; onChange: (phrase: FormPhrase) => void }) {
  const limits = formDimensionLimits(phrase.primitive);
  return (
    <>
      <SelectField label="Primitive" value={phrase.primitive} options={["stemSkin", "saddlePetal", "centerDisc", "leafBlade", "quadSlat", "seedFuzz", "importedMesh"].map((value) => ({ value, label: value === "importedMesh" ? "importedMesh (unavailable)" : value, disabled: value === "importedMesh" }))} onChange={(primitive) => onChange(applyFormPrimitive(phrase, primitive as FormPhrase["primitive"], materials))} />
      <SelectField label="Material" value={phrase.materialId} options={materials.map((value) => ({ value, label: value }))} onChange={(materialId) => onChange({ ...phrase, materialId })} />
      <VariationField label="Length" value={effectiveFormLength(phrase)} step={0.005} min={-limits.lengthMax} max={limits.lengthMax} deviationMax={limits.lengthMax} onChange={(length) => onChange({ ...phrase, length })} />
      <VariationField label="Width" value={effectiveFormWidth(phrase)} step={0.005} min={-limits.widthMax} max={limits.widthMax} deviationMax={limits.widthMax} onChange={(width) => onChange({ ...phrase, width })} />
      {formSupportsCup(phrase.primitive) ? <VariationField label="Cup" value={phrase.cup ?? { ideal: 0, deviation: 0 }} step={0.01} min={-1} max={1} deviationMax={1} onChange={(cup) => onChange({ ...phrase, cup })} /> : null}
      {formSupportsCurl(phrase.primitive) ? <VariationField label="Curl" value={phrase.curl ?? { ideal: 0, deviation: 0 }} step={0.01} min={-1} max={1} deviationMax={1} onChange={(curl) => onChange({ ...phrase, curl })} /> : null}
    </>
  );
}

// Display the recipe compiler's actual fallbacks for older/imported forms.
function effectiveFormWidth(phrase: FormPhrase): IdealVariation {
  return phrase.width ?? { ideal: phrase.primitive === "centerDisc" ? 0.05 : 0.04, deviation: 0 };
}

function effectiveFormLength(phrase: FormPhrase): IdealVariation {
  if (phrase.length) return phrase.length;
  if (phrase.primitive !== "centerDisc") return { ideal: 0.09, deviation: 0 };
  const width = effectiveFormWidth(phrase);
  return { ideal: width.ideal * 0.62, deviation: width.deviation * 0.62 };
}

function formDimensionLimits(primitive: FormPhrase["primitive"]) {
  if (primitive === "centerDisc") return { lengthMax: 0.18, widthMax: 0.18 };
  if (primitive === "stemSkin") return { lengthMax: 0.7, widthMax: 0.08 };
  if (primitive === "saddlePetal") return { lengthMax: 0.22, widthMax: 0.16 };
  if (primitive === "leafBlade") return { lengthMax: 0.35, widthMax: 0.18 };
  if (primitive === "quadSlat") return { lengthMax: 2.5, widthMax: 0.45 };
  if (primitive === "seedFuzz") return { lengthMax: 0.18, widthMax: 0.08 };
  if (primitive === "importedMesh") return { lengthMax: 1, widthMax: 1 };
  return { lengthMax: 0.35, widthMax: 0.22 };
}

function formSupportsCup(primitive: FormPhrase["primitive"]) {
  return primitive === "saddlePetal" || primitive === "leafBlade";
}

function formSupportsCurl(primitive: FormPhrase["primitive"]) {
  return primitive === "saddlePetal" || primitive === "leafBlade";
}

function applyFormPrimitive(phrase: FormPhrase, primitive: FormPhrase["primitive"], materials: string[]): FormPhrase {
  const limits = formDimensionLimits(primitive);
  const primitiveChanged = phrase.primitive !== primitive;
  return {
    ...phrase,
    primitive,
    materialId: materialForPrimitive(primitive, materials, phrase.materialId),
    length: clampIdealVariation(primitiveChanged ? defaultFormLength(primitive) : phrase.length ?? defaultFormLength(primitive), limits.lengthMax),
    width: clampIdealVariation(primitiveChanged ? defaultFormWidth(primitive) : phrase.width ?? defaultFormWidth(primitive), limits.widthMax),
  };
}

function clampIdealVariation(value: IdealVariation, max: number): IdealVariation {
  return {
    ideal: Math.min(Math.max(-max, value.ideal), max),
    deviation: Math.min(Math.max(0, value.deviation), max),
  };
}

function materialForPrimitive(primitive: FormPhrase["primitive"], materials: string[], current: string) {
  const preferred = primitive === "centerDisc" ? "center" : primitive === "stemSkin" || primitive === "leafBlade" ? "stem" : "petal";
  if (materials.includes(preferred)) return preferred;
  if (materials.includes(current)) return current;
  return materials[0] ?? current;
}

function defaultFormLength(primitive: FormPhrase["primitive"]): IdealVariation {
  if (primitive === "stemSkin") return { ideal: 0.14, deviation: 0.03 };
  if (primitive === "leafBlade") return { ideal: 0.11, deviation: 0.025 };
  if (primitive === "centerDisc") return { ideal: 0.05, deviation: 0.01 };
  if (primitive === "quadSlat") return { ideal: 1.25, deviation: 0.25 };
  return { ideal: 0.08, deviation: 0.01 };
}

function defaultFormWidth(primitive: FormPhrase["primitive"]): IdealVariation {
  if (primitive === "stemSkin") return { ideal: 0.012, deviation: 0.002 };
  if (primitive === "leafBlade") return { ideal: 0.045, deviation: 0.01 };
  if (primitive === "centerDisc") return { ideal: 0.05, deviation: 0.01 };
  if (primitive === "quadSlat") return { ideal: 0.18, deviation: 0.035 };
  return { ideal: 0.04, deviation: 0.008 };
}

function InlineTextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <FormLabel>
      {label}
      <input className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-2 text-[var(--app-text)]" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </FormLabel>
  );
}

function PhraseProperties({ phrase, materials, onChange }: { phrase: GrowthPhrase; materials: string[]; onChange: (updater: (phrase: GrowthPhrase) => GrowthPhrase) => void }) {
  return (
    <Stack>
      <TextField label="Label" value={phrase.label} onChange={(label) => onChange((current) => ({ ...current, label }))} />
      {phrase.type === "continue" ? (
        <>
          {phrase.pathMode !== "arc" && <Button size="compact" onClick={() => onChange(current => current.type === "continue" ? { ...current, pathMode: "arc" } : current)}>Use curved growth</Button>}
          <VariationField label="Distance" value={phrase.distance} step={0.005} min={-recipeLimits.growDistanceMax} max={recipeLimits.growDistanceMax} deviationMax={recipeLimits.growDistanceMax} onChange={(distance) => onChange((current) => current.type === "continue" ? { ...current, distance } : current)} />
          <VariationField label="Arc degrees" value={phrase.arcDegrees ?? { ideal: 0, deviation: 0 }} step={1} min={-180} max={180} deviationMax={180} onChange={(arcDegrees) => onChange((current) => current.type === "continue" ? { ...current, arcDegrees } : current)} />
          <VariationField circular disabled={(phrase.arcDegrees?.ideal ?? 0) === 0 && (phrase.arcDegrees?.deviation ?? 0) === 0} label="Arc direction" value={phrase.arcAzimuthDegrees ?? { ideal: 0, deviation: 0 }} step={1} min={-360} max={360} deviationMax={360} onChange={(arcAzimuthDegrees) => onChange((current) => current.type === "continue" ? { ...current, arcAzimuthDegrees } : current)} />
          <VariationField disabled={!phrase.formAlongPath || phrase.formAlongPath === "none"} label="Start radius" value={phrase.radiusStart ?? { ideal: 0.01, deviation: 0 }} step={0.001} min={-recipeLimits.growRadiusMax} max={recipeLimits.growRadiusMax} deviationMax={recipeLimits.growRadiusMax} onChange={(radiusStart) => onChange((current) => current.type === "continue" ? { ...current, radiusStart } : current)} />
          <VariationField disabled={!phrase.formAlongPath || phrase.formAlongPath === "none"} label="End radius" value={phrase.radiusEnd ?? { ideal: 0.006, deviation: 0 }} step={0.001} min={-recipeLimits.growRadiusMax} max={recipeLimits.growRadiusMax} deviationMax={recipeLimits.growRadiusMax} onChange={(radiusEnd) => onChange((current) => current.type === "continue" ? { ...current, radiusEnd } : current)} />
          <SelectField label="Form along path" value={phrase.formAlongPath ?? "none"} options={["none", "stemSkin", "blade"].map((value) => ({ value, label: value }))} onChange={(formAlongPath) => onChange((current) => current.type === "continue" ? { ...current, formAlongPath: formAlongPath as "none" | "stemSkin" | "blade" } : current)} />
        </>
      ) : null}
      {phrase.type === "fork" ? (
        <>
          <VariationField label="Count" value={phrase.count} integer max={recipeLimits.countMax} onChange={(count) => onChange((current) => current.type === "fork" ? { ...current, count: count as CountVariation } : current)} />
          <SelectField label="Layout" value={phrase.layout} options={["radial", "spiral", "mirrored", "cluster", "sameAxis"].map((value) => ({ value, label: value }))} onChange={(layout) => onChange((current) => current.type === "fork" ? { ...current, layout: layout as ForkPhrase["layout"] } : current)} />
          <VariationField disabled={phrase.layout === "sameAxis"} label="Spread degrees" value={phrase.spreadDegrees} step={1} min={-360} max={360} deviationMax={360} onChange={(spreadDegrees) => onChange((current) => current.type === "fork" ? { ...current, spreadDegrees } : current)} />
          <VariationField label="Radius" value={phrase.radius} step={0.005} min={-recipeLimits.forkRadiusMax} max={recipeLimits.forkRadiusMax} deviationMax={recipeLimits.forkRadiusMax} onChange={(radius) => onChange((current) => current.type === "fork" ? { ...current, radius } : current)} />
        </>
      ) : null}
      {phrase.type === "branch" ? (
        <>
          <VariationField label="Offshoot count" value={phrase.count} integer max={recipeLimits.countMax} onChange={(count) => onChange((current) => current.type === "branch" ? { ...current, count: count as CountVariation } : current)} />
          <SelectField label="Layout" value={phrase.layout} options={["alongPath", "radial", "alternating", "tip", "fromForm"].map((value) => ({ value, label: value === "fromForm" ? "fromForm (unavailable)" : value, disabled: value === "fromForm" }))} onChange={(layout) => onChange((current) => current.type === "branch" ? { ...current, layout: layout as BranchPhrase["layout"] } : current)} />
          <VariationField label="Deviation angle" value={phrase.deviationDegrees ?? { ideal: 55, deviation: 8 }} step={1} min={-180} max={180} deviationMax={180} onChange={(deviationDegrees) => onChange((current) => current.type === "branch" ? { ...current, deviationDegrees } : current)} />
          <VariationField circular label="Around axis" value={phrase.aroundAxisDegrees ?? phrase.sideBiasDegrees ?? { ideal: 0, deviation: 0 }} step={1} min={-360} max={360} deviationMax={360} onChange={(aroundAxisDegrees) => onChange((current) => current.type === "branch" ? { ...current, aroundAxisDegrees } : current)} />
        </>
      ) : null}
      {phrase.type === "form" ? (
        <FormPhraseProperties phrase={phrase} materials={materials} onChange={onChange} />
      ) : null}
    </Stack>
  );
}

function FormPhraseProperties({ phrase, materials, onChange }: { phrase: FormPhrase; materials: string[]; onChange: (updater: (phrase: GrowthPhrase) => GrowthPhrase) => void }) {
  const limits = formDimensionLimits(phrase.primitive);
  return (
    <>
      <SelectField label="Primitive" value={phrase.primitive} options={["stemSkin", "saddlePetal", "centerDisc", "leafBlade", "quadSlat", "seedFuzz", "importedMesh"].map((value) => ({ value, label: value === "importedMesh" ? "importedMesh (unavailable)" : value, disabled: value === "importedMesh" }))} onChange={(primitive) => onChange((current) => current.type === "form" ? applyFormPrimitive(current, primitive as FormPhrase["primitive"], materials) : current)} />
      <SelectField label="Material" value={phrase.materialId} options={materials.map((value) => ({ value, label: value }))} onChange={(materialId) => onChange((current) => current.type === "form" ? { ...current, materialId } : current)} />
      <VariationField label="Length" value={effectiveFormLength(phrase)} step={0.005} min={-limits.lengthMax} max={limits.lengthMax} deviationMax={limits.lengthMax} onChange={(length) => onChange((current) => current.type === "form" ? { ...current, length } : current)} />
      <VariationField label="Width" value={effectiveFormWidth(phrase)} step={0.005} min={-limits.widthMax} max={limits.widthMax} deviationMax={limits.widthMax} onChange={(width) => onChange((current) => current.type === "form" ? { ...current, width } : current)} />
      {formSupportsCup(phrase.primitive) ? <VariationField label="Cup" value={phrase.cup ?? { ideal: 0, deviation: 0 }} step={0.01} min={-1} max={1} deviationMax={1} onChange={(cup) => onChange((current) => current.type === "form" ? { ...current, cup } : current)} /> : null}
      {formSupportsCurl(phrase.primitive) ? <VariationField label="Curl" value={phrase.curl ?? { ideal: 0, deviation: 0 }} step={0.01} min={-1} max={1} deviationMax={1} onChange={(curl) => onChange((current) => current.type === "form" ? { ...current, curl } : current)} /> : null}
    </>
  );
}

function GrassLodEditor({ grass, onChange }: { grass: GrassLodSettings; onChange: (patch: Partial<GrassLodSettings>) => void }) {
  return (
    <Stack>

      <FormLabel>
        Slat density {Math.round(grass.density * 100)}%
        <input type="range" min={0.05} max={3} step={0.01} value={grass.density} onChange={(event) => onChange({ density: Number(event.currentTarget.value) })} />
      </FormLabel>
      <SelectField label="Coverage pattern" value={grass.pattern ?? "natural"} options={[{ value: "natural", label: "Natural" }, { value: "stripes", label: "Stripes" }, { value: "dots", label: "Dots" }]} onChange={pattern => onChange({ pattern: pattern as GrassLodSettings["pattern"] })}/>
      <NumberField label="Pattern scale · meters" value={grass.patternScale ?? 0.8} min={0.1} max={10} step={0.1} onChange={patternScale => onChange({ patternScale })}/>
      <ColorField label="Slat second top" value={grass.topColorB} onChange={(topColorB) => onChange({ topColorB })} />
      <ColorField label="Slat middle" value={grass.midColor} onChange={(midColor) => onChange({ midColor })} />
      <ColorField label="Slat top" value={grass.topColorA} onChange={(topColorA) => onChange({ topColorA })} />
      <ColorField label="Slat bottom" value={grass.bottomColor} onChange={(bottomColor) => onChange({ bottomColor })} />
    </Stack>
  );
}

function MaterialEditor({ asset, onChange }: { asset: VegetationSpeciesAssetFile; onChange: (updater: (current: VegetationSpeciesAssetFile) => VegetationSpeciesAssetFile) => void }) {
  const entries = Object.entries(asset.species.materials);
  return (
    <Stack>
      <h3 className="m-0 text-base">Materials</h3>
      {entries.map(([materialId, material]) => (
        <ColorField
          key={materialId}
          label={`${materialId} color`}
          value={material.baseColor}
          onChange={(baseColor) => onChange((current) => ({
            ...current,
            species: {
              ...current.species,
              materials: {
                ...current.species.materials,
                [materialId]: { ...current.species.materials[materialId], baseColor },
              },
              lod: materialId === current.species.parts[0].materialId ? { ...current.species.lod, farColor: baseColor } : current.species.lod,
            },
          }))}
        />
      ))}
    </Stack>
  );
}

function ObjPrimitiveEditor({
  primitives,
  selectedId,
  selectedVertexIndex,
  onImport,
  onSelectPrimitive,
  onSelectVertex,
  onChange,
}: {
  primitives: ObjPrimitiveMesh[];
  selectedId: string;
  selectedVertexIndex: number;
  onImport: (file: File) => void;
  onSelectPrimitive: (id: string) => void;
  onSelectVertex: (index: number) => void;
  onChange: (primitive: ObjPrimitiveMesh) => void;
}) {
  const primitive = primitives.find((item) => item.id === selectedId) ?? primitives[0];
  if (!primitive) return null;
  const vertexIndex = Math.min(Math.max(0, selectedVertexIndex), primitive.vertices.length - 1);
  const vertex = primitive.vertices[vertexIndex];
  const edges = objPrimitiveEdges(primitive);
  const incidentEdges = edges.filter((edge) => {
    const [a, b] = edgeVertices(edge);
    return a === vertexIndex || b === vertexIndex;
  });
  const visibleEdges = incidentEdges.length ? incidentEdges : edges.slice(0, 8);
  const updateVertex = (patch: Partial<typeof vertex>) => onChange(replaceObjPrimitiveVertex(primitive, vertexIndex, patch));
  const exportPrimitive = () => {
    const blob = new Blob([serializeObjPrimitiveMesh(primitive)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${primitive.id}.obj`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="obj-primitive-editor">
      <Stack>
      <h3 className="m-0 text-base">OBJ Primitives</h3>
      <SelectField
        label="OBJ source"
        value={primitive.id}
        options={primitives.map((item) => ({ value: item.id, label: item.displayName }))}
        onChange={onSelectPrimitive}
      />
      <ActionRow>
        <FileButton accept=".obj,text/plain" size="compact" onFile={onImport}><FileUp className="mr-1 h-4 w-4" /> Import OBJ</FileButton>
        <Button type="button" size="compact" onClick={exportPrimitive}><Download className="mr-1 h-4 w-4" /> Export OBJ</Button>
      </ActionRow>
      <ObjPrimitiveBabylonEditor
        primitive={primitive}
        selectedVertexIndex={vertexIndex}
        onSelectVertex={onSelectVertex}
        onVertexChange={(index, patch) => onChange(replaceObjPrimitiveVertex(primitive, index, patch))}
      />
      <SelectField
        label="Vertex"
        value={String(vertexIndex)}
        options={primitive.vertices.map((item, index) => ({
          value: String(index),
          label: `${item.id}  ${formatCompact(item.x)}, ${formatCompact(item.y)}, ${formatCompact(item.z)}`,
        }))}
        onChange={(index) => onSelectVertex(Number(index))}
      />
      <div className="grid gap-1.5">
        <div data-testid="obj-vertex-x"><NumberField label="X" value={vertex.x} step={0.005} min={-2} max={2} onChange={(x) => updateVertex({ x })} /></div>
        <div data-testid="obj-vertex-y"><NumberField label="Y" value={vertex.y} step={0.005} min={-2} max={2} onChange={(y) => updateVertex({ y })} /></div>
        <div data-testid="obj-vertex-z"><NumberField label="Z" value={vertex.z} step={0.005} min={-2} max={2} onChange={(z) => updateVertex({ z })} /></div>
      </div>
      <ColorField label="Vertex color" value={vertex.color} onChange={(color) => updateVertex({ color })} />
      <div className="grid gap-1.5">
        <div className="text-xs font-bold text-[var(--muted-text)]">Seams</div>
        <div className="grid grid-cols-2 gap-1.5">
          {visibleEdges.map((edge) => {
            const [a, b] = edgeVertices(edge);
            const sharp = primitive.sharpEdges.includes(edge);
            return (
              <Button
                key={edge}
                aria-pressed={sharp}
                className="justify-center"
                size="compact"
                tone={sharp ? "primary" : "default"}
                type="button"
                onClick={() => onChange(setObjPrimitiveEdgeSharp(primitive, edge, !sharp))}
              >
                {a + 1}-{b + 1} {sharp ? "Sharp" : "Smooth"}
              </Button>
            );
          })}
        </div>
      </div>
      </Stack>
    </div>
  );
}

function formatCompact(value: number) {
  return Number(value.toFixed(3)).toString();
}

function VariationField({
  circular = false,
  disabled = false,
  label,
  value,
  integer,
  step: requestedStep,
  min,
  max,
  deviationMax,
  onChange,
}: {
  circular?: boolean;
  disabled?: boolean;
  label: string;
  value: IdealVariation | CountVariation;
  integer?: boolean;
  step?: number;
  min?: number;
  max?: number;
  deviationMax?: number;
  onChange: (value: IdealVariation | CountVariation) => void;
}) {
  const step = integer ? 1 : requestedStep ?? 0.01;
  const update = (patch: Partial<IdealVariation>) => {
    const next = { ...value, deviation: circular ? Math.min(180, value.deviation) : value.deviation, ...patch };
    onChange(integer ? clampCountVariation(next) : next);
  };
  const idealMax = max;
  const idealMin = integer ? 1 : min;
  const deviationLimit = circular ? 180 : integer ? Math.max(0, Math.min(value.ideal, 64 - value.ideal)) : deviationMax;
  return (
    <fieldset disabled={disabled} data-testid={`variation-${slugifyTestId(label)}`} className="grid min-w-0 grid-cols-2 items-end gap-1.5 disabled:opacity-40">
      <div className="col-span-2 flex items-center justify-between gap-2 text-xs font-bold text-[var(--muted-text)]"><span>{label}</span>{circular && <button type="button" aria-label={`${label}: any direction`} aria-pressed={value.deviation >= 180} title="Any direction · 360° random span" onClick={() => update({ deviation: value.deviation >= 180 ? 0 : 180 })} className="rounded border border-[var(--input-border)] px-1.5 py-0.5 text-[10px] font-normal aria-pressed:border-[#2f6f34] aria-pressed:text-[#2f6f34]">Any direction</button>}</div>
      <NumberField label="Ideal" value={value.ideal} step={step} min={idealMin} max={idealMax} onChange={(ideal) => update({ ideal })} />
      <NumberField label="+/-" value={circular ? Math.min(180, value.deviation) : value.deviation} step={step} min={0} max={deviationLimit} onChange={(deviation) => update({ deviation })} />
    </fieldset>
  );
}

function slugifyTestId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function NumberField({ label, value, step, min, max, onChange, holdAcceleration }: { label: string; value: number; step: number; min?: number; max?: number; onChange: (value: number) => void; holdAcceleration?: HoldAcceleration }) {
  const [draft, setDraft] = useState(formatNumber(value, step));
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editingRef = useRef(false);
  const holdRef = useRef<{ frame?: number; direction: -1 | 1; lastAt: number; progress: NumberHoldProgress; element: HTMLButtonElement; curve: ReturnType<typeof createNumberHoldCurve> } | undefined>(undefined);

  // Synchronize before the next hold frame; a delayed effect can overwrite a newer nudge.
  useLayoutEffect(() => {
    valueRef.current = value;
    if (!editingRef.current) setDraft(formatNumber(value, step));
  }, [value, step]);

  const clamp = (raw: number) => {
    const clampedMin = min === undefined ? raw : Math.max(min, raw);
    return max === undefined ? clampedMin : Math.min(max, clampedMin);
  };
  const commit = (raw: string) => {
    if (raw === formatNumber(valueRef.current, step)) return true;
    if (!raw.trim()) return false;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return false;
    const next = normalizeStep(clamp(parsed), step);
    valueRef.current = next;
    setDraft(formatNumber(next, step));
    onChangeRef.current(next);
    return true;
  };
  const nudge = (direction: -1 | 1, multiplier = 1) => {
    const base = valueRef.current;
    const next = normalizeStep(clamp(base + (direction * step * multiplier)), step);
    if (next === base) return false;
    valueRef.current = next;
    setDraft(formatNumber(next, step));
    onChangeRef.current(next);
    return true;
  };
  const tickHold = () => {
    const hold = holdRef.current;
    if (!hold) return;
    const now = performance.now();
    if (document.hidden || !hold.element.isConnected || hold.element.disabled || (hold.progress.elapsedMs > 80 && !hold.element.matches(":active"))) {
      stopHold();
      return;
    }
    const { steps, ...progress } = advanceNumberHold(hold.progress, now - hold.lastAt, hold.curve);
    hold.lastAt = now;
    hold.progress = progress;
    if (steps > 0) {
      if (!nudge(hold.direction, steps)) {
        stopHold();
        return;
      }
    }
    hold.frame = window.requestAnimationFrame(tickHold);
  };
  const stopHold = () => {
    if (holdRef.current?.frame !== undefined) window.cancelAnimationFrame(holdRef.current.frame);
    holdRef.current = undefined;
  };
  const startHold = (direction: -1 | 1) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.focus();
    stopHold();
    nudge(direction);
    const now = performance.now();
    holdRef.current = { direction, lastAt: now, progress: { elapsedMs: 0, remainder: 0 }, element: event.currentTarget, curve: createNumberHoldCurve(step, min, max, holdAcceleration) };
    holdRef.current.frame = window.requestAnimationFrame(tickHold);
  };

  useEffect(() => {
    const stop = () => stopHold();
    const options = { capture: true };
    window.addEventListener("pointerup", stop, options);
    window.addEventListener("pointercancel", stop, options);
    window.addEventListener("mouseup", stop, options);
    window.addEventListener("blur", stop, options);
    document.addEventListener("visibilitychange", stop, options);
    document.addEventListener("pointerup", stop, options);
    document.addEventListener("pointercancel", stop, options);
    document.addEventListener("mouseup", stop, options);
    return () => {
      window.removeEventListener("pointerup", stop, options);
      window.removeEventListener("pointercancel", stop, options);
      window.removeEventListener("mouseup", stop, options);
      window.removeEventListener("blur", stop, options);
      document.removeEventListener("visibilitychange", stop, options);
      document.removeEventListener("pointerup", stop, options);
      document.removeEventListener("pointercancel", stop, options);
      document.removeEventListener("mouseup", stop, options);
    };
  }, []);

  useEffect(() => stopHold, []);

  return (
    <FormLabel>
      {label}
      <div className="grid h-8 grid-cols-[1.1rem_minmax(3.4rem,1fr)_1.1rem] overflow-hidden rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] transition duration-75 focus-within:border-[#2f6f34] focus-within:shadow-[0_0_0_2px_rgb(47_111_52_/_18%)]">
        <button
          aria-label={`Decrease ${label}`}
          className="select-none border-r border-[var(--input-border)] text-[11px] font-bold leading-none text-[var(--muted-text)] outline-none hover:bg-[var(--hover-bg)] focus-visible:bg-[var(--subtle-bg)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
          disabled={min !== undefined && value <= min}
          type="button"
          onPointerDown={startHold(-1)}
          onClick={(event) => { if (event.detail === 0) nudge(-1); }}
          onPointerUp={stopHold}
          onMouseUp={stopHold}
          onPointerCancel={stopHold}
          onLostPointerCapture={stopHold}
        >
          -
        </button>
        <input
          className="min-w-0 bg-transparent px-1 text-right font-mono text-[12px] tabular-nums text-[var(--app-text)] outline-none"
          style={{ paddingRight: "calc(0.25rem + " + numberFractionPadding(draft, step) + "ch)" }}
          inputMode="decimal"
          value={draft}
          onFocus={() => { editingRef.current = true; }}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            setDraft(raw);
          }}
          onBlur={(event) => {
            editingRef.current = false;
            if (!commit(event.currentTarget.value)) setDraft(formatNumber(value, step));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "ArrowUp") {
              event.preventDefault();
              commit(event.currentTarget.value);
              nudge(1, event.shiftKey ? 10 : 1);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              commit(event.currentTarget.value);
              nudge(-1, event.shiftKey ? 10 : 1);
            }
            if (event.key === "Escape") {
              event.preventDefault(); event.stopPropagation();
              event.currentTarget.value = formatNumber(valueRef.current, step);
              setDraft(event.currentTarget.value); event.currentTarget.blur();
            }
          }}
        />
        <button
          aria-label={`Increase ${label}`}
          className="select-none border-l border-[var(--input-border)] text-[11px] font-bold leading-none text-[var(--muted-text)] outline-none hover:bg-[var(--hover-bg)] focus-visible:bg-[var(--subtle-bg)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
          disabled={max !== undefined && value >= max}
          type="button"
          onPointerDown={startHold(1)}
          onClick={(event) => { if (event.detail === 0) nudge(1); }}
          onPointerUp={stopHold}
          onMouseUp={stopHold}
          onPointerCancel={stopHold}
          onLostPointerCapture={stopHold}
        >
          +
        </button>
      </div>
    </FormLabel>
  );
}

function clampCountVariation(value: IdealVariation | CountVariation): CountVariation {
  const ideal = Math.max(1, Math.min(64, Math.round(value.ideal)));
  const deviation = Math.max(0, Math.min(Math.round(value.deviation), ideal, 64 - ideal));
  return { ideal, deviation };
}

function normalizeStep(value: number, step: number) {
  if (step >= 1) return Math.round(value);
  const decimals = String(step).split(".")[1]?.length ?? 0;
  return Number(value.toFixed(Math.min(6, decimals + 1)));
}

function formatNumber(value: number, step: number) {
  if (step >= 1) return String(Math.round(value));
  return normalizeStep(value, step).toString();
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => boolean | void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const nextValue = draft.trim();
    if (nextValue === value) return;
    const result = onChange(nextValue);
    if (result === false) setDraft(value);
  };
  return (
    <FormLabel>
      {label}
      <input
        className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-2 text-[var(--app-text)]"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(value);
        }}
      />
    </FormLabel>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: ColorHex; onChange: (value: ColorHex) => void }) {
  const commitText = (nextValue: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(nextValue)) return false;
    if (nextValue !== value) onChange(nextValue as ColorHex);
    return true;
  };
  return (
    <FormLabel>
      {label}
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
        <input className="h-10 w-10 rounded-md border border-[var(--input-border)] bg-transparent p-0" type="color" value={value} onChange={(event) => onChange(event.currentTarget.value as ColorHex)} />
        <input
          key={value}
          className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-2 text-[var(--app-text)]"
          defaultValue={value}
          spellCheck={false}
          onBlur={(event) => { if (!commitText(event.currentTarget.value.trim())) event.currentTarget.value = value; }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.value = value; event.currentTarget.blur(); }
          }}
        />
      </div>
    </FormLabel>
  );
}

function findPhrase(phrases: GrowthPhrase[], id: string): GrowthPhrase | undefined {
  for (const phrase of phrases) {
    if (phrase.id === id) return phrase;
    if (phrase.type === "fork") {
      const found = findPhrase(phrase.continuation, id);
      if (found) return found;
    }
    if (phrase.type === "branch") {
      const found = findPhrase(phrase.offshoot, id);
      if (found) return found;
    }
    if (phrase.type === "choose") {
      for (const option of phrase.options) {
        const found = findPhrase(option.phrase, id);
        if (found) return found;
      }
    }
  }
  return undefined;
}

function canPhraseContain(phrase: GrowthPhrase) {
  return phrase.type === "fork" || phrase.type === "branch" || phrase.type === "choose";
}

function phraseContains(phrase: GrowthPhrase, id: string | undefined): boolean {
  if (!id) return false;
  if (phrase.id === id) return true;
  if (phrase.type === "fork") return phrase.continuation.some((child) => phraseContains(child, id));
  if (phrase.type === "branch") return phrase.offshoot.some((child) => phraseContains(child, id));
  if (phrase.type === "choose") return phrase.options.some((option) => option.phrase.some((child) => phraseContains(child, id)));
  return false;
}

function movePhraseInTree(root: GrowthPhrase[], draggedId: string, targetId: string, position: PhraseDropPosition): GrowthPhrase[] {
  const dragged = findPhrase(root, draggedId);
  const target = findPhrase(root, targetId);
  if (!dragged || !target || draggedId === targetId || phraseContains(dragged, targetId)) return root;

  const extracted = extractPhrase(root, draggedId);
  if (!extracted.phrase) return root;

  const inserted = insertPhraseAtTarget(extracted.phrases, targetId, extracted.phrase, position);
  return inserted.inserted ? inserted.phrases : root;
}

function extractPhrase(phrases: GrowthPhrase[], id: string): { phrases: GrowthPhrase[]; phrase?: GrowthPhrase } {
  let extracted: GrowthPhrase | undefined;
  const nextPhrases: GrowthPhrase[] = [];
  for (const phrase of phrases) {
    if (phrase.id === id) {
      extracted = phrase;
      continue;
    }
    if (phrase.type === "fork") {
      const child = extractPhrase(phrase.continuation, id);
      if (child.phrase) extracted = child.phrase;
      nextPhrases.push({ ...phrase, continuation: child.phrases });
      continue;
    }
    if (phrase.type === "branch") {
      const child = extractPhrase(phrase.offshoot, id);
      if (child.phrase) extracted = child.phrase;
      nextPhrases.push({ ...phrase, offshoot: child.phrases });
      continue;
    }
    if (phrase.type === "choose") {
      nextPhrases.push({
        ...phrase,
        options: phrase.options.map((option) => {
          const child = extractPhrase(option.phrase, id);
          if (child.phrase) extracted = child.phrase;
          return { ...option, phrase: child.phrases };
        }),
      });
      continue;
    }
    nextPhrases.push(phrase);
  }
  return { phrases: nextPhrases, phrase: extracted };
}

function insertPhraseAtTarget(phrases: GrowthPhrase[], targetId: string, insertedPhrase: GrowthPhrase, position: PhraseDropPosition): { phrases: GrowthPhrase[]; inserted: boolean } {
  let inserted = false;
  const nextPhrases = phrases.flatMap((phrase) => {
    if (phrase.id === targetId) {
      inserted = true;
      const nextPosition = position === "inside" && !canPhraseContain(phrase) ? "after" : position;
      if (nextPosition === "before") return [insertedPhrase, phrase];
      if (nextPosition === "after") return [phrase, insertedPhrase];
      return [insertInsidePhrase(phrase, insertedPhrase)];
    }
    if (phrase.type === "fork") {
      const child = insertPhraseAtTarget(phrase.continuation, targetId, insertedPhrase, position);
      if (child.inserted) inserted = true;
      return [{ ...phrase, continuation: child.phrases }];
    }
    if (phrase.type === "branch") {
      const child = insertPhraseAtTarget(phrase.offshoot, targetId, insertedPhrase, position);
      if (child.inserted) inserted = true;
      return [{ ...phrase, offshoot: child.phrases }];
    }
    if (phrase.type === "choose") {
      return [{
        ...phrase,
        options: phrase.options.map((option) => {
          const child = insertPhraseAtTarget(option.phrase, targetId, insertedPhrase, position);
          if (child.inserted) inserted = true;
          return { ...option, phrase: child.phrases };
        }),
      }];
    }
    return [phrase];
  });
  return { phrases: nextPhrases, inserted };
}

function insertInsidePhrase(phrase: GrowthPhrase, insertedPhrase: GrowthPhrase): GrowthPhrase {
  if (phrase.type === "fork") return { ...phrase, continuation: [...phrase.continuation, insertedPhrase] };
  if (phrase.type === "branch") return { ...phrase, offshoot: [...phrase.offshoot, insertedPhrase] };
  if (phrase.type === "choose") {
    const [firstOption, ...rest] = phrase.options;
    const option = firstOption ?? { weight: 1, phrase: [] };
    return { ...phrase, options: [{ ...option, phrase: [...option.phrase, insertedPhrase] }, ...rest] };
  }
  return phrase;
}

function updatePhrase(phrases: GrowthPhrase[], id: string, updater: (phrase: GrowthPhrase) => GrowthPhrase): GrowthPhrase[] {
  return phrases.map((phrase) => {
    if (phrase.id === id) return updater(phrase);
    if (phrase.type === "fork") return { ...phrase, continuation: updatePhrase(phrase.continuation, id, updater) };
    if (phrase.type === "branch") return { ...phrase, offshoot: updatePhrase(phrase.offshoot, id, updater) };
    if (phrase.type === "choose") return { ...phrase, options: phrase.options.map((option) => ({ ...option, phrase: updatePhrase(option.phrase, id, updater) })) };
    return phrase;
  });
}

function insertPhraseAfter(phrases: GrowthPhrase[], id: string, inserted: GrowthPhrase): GrowthPhrase[] {
  return phrases.flatMap((phrase) => {
    const current = (() => {
      if (phrase.type === "fork") return { ...phrase, continuation: insertPhraseAfter(phrase.continuation, id, inserted) };
      if (phrase.type === "branch") return { ...phrase, offshoot: insertPhraseAfter(phrase.offshoot, id, inserted) };
      if (phrase.type === "choose") return { ...phrase, options: phrase.options.map((option) => ({ ...option, phrase: insertPhraseAfter(option.phrase, id, inserted) })) };
      return phrase;
    })();
    return phrase.id === id ? [current, inserted] : [current];
  });
}

function removePhrase(phrases: GrowthPhrase[], id: string): GrowthPhrase[] {
  return phrases
    .filter((phrase) => phrase.id !== id)
    .map((phrase) => {
      if (phrase.type === "fork") return { ...phrase, continuation: removePhrase(phrase.continuation, id) };
      if (phrase.type === "branch") return { ...phrase, offshoot: removePhrase(phrase.offshoot, id) };
      if (phrase.type === "choose") return { ...phrase, options: phrase.options.map((option) => ({ ...option, phrase: removePhrase(option.phrase, id) })) };
      return phrase;
    });
}

function makeContinuePhrase(): GrowthPhrase {
  return {
    id: uniqueId("grow"),
    type: "continue",
    pathMode: "arc",
    label: "Grow forward",
    distance: { ideal: 0.12, deviation: 0.025 },
    radiusStart: { ideal: 0.012, deviation: 0.002 },
    radiusEnd: { ideal: 0.007, deviation: 0.001 },
    arcDegrees: { ideal: 4, deviation: 2 },
    arcAzimuthDegrees: { ideal: 0, deviation: 0 },
    formAlongPath: "stemSkin",
  };
}

function makeForkPhrase(): GrowthPhrase {
  return { id: uniqueId("fork"), type: "fork", label: "Fork continuations", count: { ideal: 6, deviation: 1 }, layout: "radial", spreadDegrees: { ideal: 360, deviation: 0 }, radius: { ideal: 0.04, deviation: 0.006 }, continuation: [makeFormPhrase()] };
}

function makeBranchPhrase(): GrowthPhrase {
  return { id: uniqueId("branch"), type: "branch", label: "Branch offshoot", count: { ideal: 1, deviation: 0 }, layout: "tip", deviationDegrees: { ideal: 55, deviation: 8 }, aroundAxisDegrees: { ideal: 0, deviation: 0 }, offshoot: [makeLeafBladePhrase()] };
}

function makeFormPhrase(): GrowthPhrase {
  return { id: uniqueId("form"), type: "form", label: "Form saddle petal", primitive: "saddlePetal", materialId: "petal", length: { ideal: 0.08, deviation: 0.01 }, width: { ideal: 0.04, deviation: 0.008 } };
}

function makeLeafBladePhrase(): GrowthPhrase {
  return { id: uniqueId("leaf"), type: "form", label: "Form leaf blade", primitive: "leafBlade", materialId: "stem", length: { ideal: 0.11, deviation: 0.025 }, width: { ideal: 0.045, deviation: 0.01 }, curl: { ideal: 0.12, deviation: 0.04 } };
}

function uniqueId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeInitialSpeciesAssets(): VegetationSpeciesAssetFile[] {
  return [
    makeSpeciesAsset("flowerBlue", "Blue Field Flower", "#a8c7fa"),
    makeSpeciesAsset("flowerWhite", "White Field Flower", "#f4f1df"),
    makeSpeciesAsset("flowerYellow", "Yellow Field Flower", "#f0d45a"),
    makeSpeciesAsset("flowerRed", "Red Field Flower", "#de6060"),
    makeCloverAsset(),
    makeTulipAsset(),
  ];
}

function makeSpeciesAsset(id: string, displayName: string, petalColor: ColorHex): VegetationSpeciesAssetFile {
  const next = cloneAsset(defaultVegetationAsset);
  next.species = {
    ...next.species,
    id,
    displayName,
    materials: {
      ...next.species.materials,
      petal: { ...next.species.materials.petal, baseColor: petalColor },
    },
    lod: {
      ...next.species.lod,
      farColor: petalColor,
    },
  };
  next.editor = {
    ...next.editor,
    tags: id === "clover" ? ["groundcover", "starter"] : id === "tulip" ? ["tall-flower", "starter"] : ["field-flower", "starter"],
  };
  return next;
}

function makeCloverAsset(): VegetationSpeciesAssetFile {
  const next = cloneAsset(defaultVegetationAsset);
  next.species = {
    ...next.species,
    id: "clover",
    displayName: "Clover Cluster",
    category: "groundcover",
    materials: {
      leaf: { baseColor: "#6dbb61", roughness: 0.95 },
      stem: { baseColor: "#477c38", roughness: 0.95 },
    },
    parts: [{
      id: "clover",
      kind: "groundMat",
      materialId: "leaf",
      shape: {
        type: "cloverCluster",
        leafCount: { min: 3, max: 4 },
        leafRadius: { min: 0.025, max: 0.042 },
        clusterRadius: { min: 0.06, max: 0.11 },
        lift: { min: 0.005, max: 0.026 },
      },
    }],
    constructionRecipe: {
      languageVersion: 1,
      root: [
        {
          id: "clover-lift",
          type: "continue",
    pathMode: "arc",
          label: "Lift from ground",
          distance: { ideal: 0.018, deviation: 0.008 },
          arcDegrees: { ideal: 0, deviation: 0 },
          arcAzimuthDegrees: { ideal: 0, deviation: 0 },
          formAlongPath: "none",
        },
        {
          id: "clover-leaflets",
          type: "fork",
          label: "Fork clover leaflets",
          count: { ideal: 3, deviation: 0 },
          layout: "radial",
          spreadDegrees: { ideal: 360, deviation: 0 },
          radius: { ideal: 0.035, deviation: 0.01 },
          continuation: [{
            id: "clover-leaf",
            type: "form",
            label: "Form leaflet",
            primitive: "leafBlade",
            materialId: "leaf",
            length: { ideal: 0.045, deviation: 0.012 },
            width: { ideal: 0.035, deviation: 0.008 },
          }],
        },
      ],
    },
    lod: { ...next.species.lod, farColor: "#6dbb61" },
  };
  next.editor = { ...next.editor, tags: ["groundcover", "starter"] };
  return next;
}

function makeTulipAsset(): VegetationSpeciesAssetFile {
  const next = cloneAsset(defaultVegetationAsset);
  next.species = {
    ...next.species,
    id: "tulip",
    displayName: "Tulip",
    category: "tallFlower",
    interaction: {
      protectedMistake: true,
      mowBehavior: "releaseHead",
      shotBehavior: "protectedDamage",
      headBehavior: "tulipCrush",
    },
    materials: {
      petal: { baseColor: "#d94f68", roughness: 0.84 },
      stem: { baseColor: "#3f7f3d", roughness: 0.95 },
      leaf: { baseColor: "#4c9a4b", roughness: 0.95 },
    },
    parts: [{
      id: "tulip",
      kind: "monolith",
      materialId: "petal",
      shape: {
        type: "tallFlower",
        stemHeight: { min: 0.32, max: 0.48 },
        stemRadius: { min: 0.009, max: 0.017 },
        stemLean: { min: -0.08, max: 0.08 },
        leaves: {
          count: { min: 1, max: 3 },
          length: { min: 0.12, max: 0.22 },
          width: { min: 0.035, max: 0.07 },
          curl: { min: 0.12, max: 0.28 },
        },
        head: {
          type: "tulipCup",
          diameter: { min: 0.075, max: 0.12 },
          heightScale: { min: 0.9, max: 1.25 },
          petalCount: { min: 5, max: 7 },
        },
      },
    }],
    constructionRecipe: {
      languageVersion: 1,
      root: [
        {
          id: "tulip-stem",
          type: "continue",
    pathMode: "arc",
          label: "Grow tall stem",
          distance: { ideal: 0.4, deviation: 0.08 },
          radiusStart: { ideal: 0.014, deviation: 0.003 },
          radiusEnd: { ideal: 0.009, deviation: 0.002 },
          formAlongPath: "stemSkin",
        },
        {
          id: "tulip-leaves",
          type: "branch",
          label: "Branch leaves from stem",
          count: { ideal: 2, deviation: 1 },
          layout: "alongPath",
          deviationDegrees: { ideal: 62, deviation: 10 },
          aroundAxisDegrees: { ideal: 35, deviation: 25 },
          offshoot: [{
            id: "tulip-leaf",
            type: "form",
            label: "Form long leaf",
            primitive: "leafBlade",
            materialId: "leaf",
            length: { ideal: 0.16, deviation: 0.04 },
            width: { ideal: 0.05, deviation: 0.015 },
            curl: { ideal: 0.2, deviation: 0.08 },
          }],
        },
        {
          id: "tulip-head",
          type: "fork",
          label: "Fork cup petals",
          count: { ideal: 6, deviation: 1 },
          layout: "radial",
          spreadDegrees: { ideal: 360, deviation: 0 },
          radius: { ideal: 0.045, deviation: 0.012 },
          continuation: [{
            id: "tulip-petal",
            type: "form",
            label: "Form tulip petal",
            primitive: "saddlePetal",
            materialId: "petal",
            length: { ideal: 0.12, deviation: 0.025 },
            width: { ideal: 0.058, deviation: 0.014 },
            cup: { ideal: 0.42, deviation: 0.08 },
            curl: { ideal: 0.16, deviation: 0.05 },
          }],
        },
      ],
    },
    lod: { ...next.species.lod, farColor: "#d94f68" },
  };
  next.editor = { ...next.editor, tags: ["tall-flower", "starter"] };
  return next;
}

function cloneAsset(asset: VegetationSpeciesAssetFile): VegetationSpeciesAssetFile {
  return JSON.parse(JSON.stringify(asset)) as VegetationSpeciesAssetFile;
}

function uniqueSpeciesId(assets: VegetationSpeciesAssetFile[], base: string) {
  const used = new Set(assets.map((item) => item.species.id));
  if (!used.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}${Date.now()}`;
}
