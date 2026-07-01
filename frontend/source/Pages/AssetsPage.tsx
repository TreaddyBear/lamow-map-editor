import { Copy, Download, FileUp, GitBranch, GripVertical, Map, Menu as MenuIcon, PackageOpen, Plus, Split, Sprout, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { ActionRow, Button, FileButton, Menu, MenuItem, MenuLabel, MenuSeparator, Panel, PanelBody, PanelHeader, Popover, Stack, TopBar, TopBarTitle } from "../Components/Base";
import { FormLabel, SelectField } from "../Components/Base/FormControls";
import { VegetationBabylonPreview } from "../Views/VegetationBabylonPreview";
import {
  defaultGrassLodSettings,
  defaultVegetationAsset,
  fieldFlowerShapeToRecipe,
  parseVegetationAsset,
  recipeToFieldFlowerShape,
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
};
type PhraseDropPosition = "before" | "after" | "inside";
type PhraseDropTarget = { id: string; position: PhraseDropPosition };

export function AssetsPage({ onOpenMapEditor }: Props) {
  const [speciesAssets, setSpeciesAssets] = useState<VegetationSpeciesAssetFile[]>(() => makeInitialSpeciesAssets());
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(defaultVegetationAsset.species.id);
  const [selectedPhraseId, setSelectedPhraseId] = useState("petal-whorl");
  const [message, setMessage] = useState("Editing vegetation as a growth recipe.");
  const [draggedPhraseId, setDraggedPhraseId] = useState<string | undefined>();
  const [dropTarget, setDropTarget] = useState<PhraseDropTarget | undefined>();
  const asset = speciesAssets.find((item) => item.species.id === selectedSpeciesId) ?? speciesAssets[0] ?? defaultVegetationAsset;
  const grass = asset.editor?.grassLod ?? defaultGrassLodSettings;
  const shape = asset.species.parts[0].shape;
  const fieldFlowerShape = shape.type === "fieldFlower" ? shape : undefined;
  const recipe = asset.species.constructionRecipe ?? (fieldFlowerShape ? fieldFlowerShapeToRecipe(fieldFlowerShape, asset.species.parts[0].materialId) : defaultVegetationAsset.species.constructionRecipe!);
  const selectedPhrase = findPhrase(recipe.root, selectedPhraseId);
  const exportText = useMemo(() => JSON.stringify(asset, null, 2), [asset]);
  const builtInIds = useMemo(() => new Set(["flowerBlue", "flowerWhite", "flowerYellow", "flowerRed", "clover", "tulip"]), []);
  const isProtectedSpecies = asset.editor?.tags?.includes("starter") && !asset.editor?.tags?.includes("custom");
  const canDeleteSpecies = !isProtectedSpecies && speciesAssets.length > 1;

  const updateAsset = (updater: (current: VegetationSpeciesAssetFile) => VegetationSpeciesAssetFile) => {
    setSpeciesAssets((currentAssets) => currentAssets.map((current) => current.species.id === asset.species.id ? updater(current) : current));
  };

  const updateRecipe = (nextRecipe: VegetationGrowthRecipe) => {
    updateAsset((current) => {
      const currentShape = current.species.parts[0].shape;
      const nextShape = currentShape.type === "fieldFlower" ? recipeToFieldFlowerShape(nextRecipe, currentShape) : currentShape;
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

  const addAfterSelected = (phrase: GrowthPhrase) => {
    if (!selectedPhrase) return addRootPhrase(phrase);
    applyRecipeRoot(insertPhraseAfter(recipe.root, selectedPhrase.id, phrase), phrase.id);
  };

  const addInsideSelected = (phrase: GrowthPhrase) => {
    if (!selectedPhrase) return addRootPhrase(phrase);
    const nextRoot = updatePhrase(recipe.root, selectedPhrase.id, (current) => {
      if (current.type === "fork") return { ...current, continuation: [...current.continuation, phrase] };
      if (current.type === "branch") return { ...current, offshoot: [...current.offshoot, phrase] };
      if (current.type === "choose") {
        const [firstOption, ...rest] = current.options;
        const option = firstOption ?? { weight: 1, phrase: [] };
        return { ...current, options: [{ ...option, phrase: [...option.phrase, phrase] }, ...rest] };
      }
      return current;
    });
    applyRecipeRoot(nextRoot, phrase.id);
  };

  const createNewSpecies = () => {
    const id = uniqueSpeciesId(speciesAssets, "customFlower");
    const next = cloneAsset(defaultVegetationAsset);
    next.species = {
      ...next.species,
      id,
      displayName: "Custom Flower",
    };
    next.editor = {
      ...next.editor,
      tags: ["field-flower", "custom"],
    };
    setSpeciesAssets((current) => [...current, next]);
    setSelectedSpeciesId(id);
    setSelectedPhraseId(next.species.constructionRecipe?.root[0]?.id ?? "grow-stem");
    setMessage(`Created species "${id}".`);
  };

  const duplicateSpecies = () => {
    const id = uniqueSpeciesId(speciesAssets, `${asset.species.id}Copy`);
    const next = cloneAsset(asset);
    next.species = {
      ...next.species,
      id,
      displayName: `${asset.species.displayName} Copy`,
    };
    next.editor = {
      ...next.editor,
      tags: [...new Set([...(next.editor?.tags ?? []).filter((tag) => tag !== "starter"), "custom"])],
    };
    setSpeciesAssets((current) => [...current, next]);
    setSelectedSpeciesId(id);
    setSelectedPhraseId(next.species.constructionRecipe?.root[0]?.id ?? "grow-stem");
    setMessage(`Duplicated species as "${id}".`);
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

  const updateGrass = (patch: Partial<GrassLodSettings>) => updateAsset((current) => ({ ...current, editor: { ...current.editor, grassLod: { ...defaultGrassLodSettings, ...current.editor?.grassLod, ...patch } } }));

  const selectSpecies = (id: string) => {
    setSelectedSpeciesId(id);
    const next = speciesAssets.find((item) => item.species.id === id);
    setSelectedPhraseId(next?.species.constructionRecipe?.root[0]?.id ?? "grow-stem");
  };

  const deleteSpecies = () => {
    if (!canDeleteSpecies) {
      setMessage("Built-in starter species are protected. Duplicate one, then edit or delete the duplicate.");
      return;
    }
    const remaining = speciesAssets.filter((item) => item.species.id !== asset.species.id);
    const next = remaining[0] ?? defaultVegetationAsset;
    setSpeciesAssets(remaining.length ? remaining : [next]);
    setSelectedSpeciesId(next.species.id);
    setSelectedPhraseId(next.species.constructionRecipe?.root[0]?.id ?? "grow-stem");
    setMessage(`Deleted species "${asset.species.id}".`);
  };

  const loadJsonText = (text: string) => {
    try {
      const next = parseVegetationAsset(text);
      setSpeciesAssets((current) => {
        const exists = current.some((item) => item.species.id === next.species.id);
        return exists ? current.map((item) => item.species.id === next.species.id ? next : item) : [...current, next];
      });
      setSelectedSpeciesId(next.species.id);
      setSelectedPhraseId(next.species.constructionRecipe?.root[0]?.id ?? "grow-stem");
      setMessage(`Imported species "${next.species.id}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import vegetation asset.");
    }
  };

  const downloadJson = () => {
    const blob = new Blob([exportText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${asset.species.id}.lamow-vegetation.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage("Exported vegetation species JSON.");
  };

  return (
    <main className="grid h-screen max-h-screen gap-4 overflow-hidden p-4 [grid-template-rows:auto_minmax(0,1fr)] [grid-template-columns:minmax(340px,410px)_minmax(0,1fr)_minmax(360px,430px)] max-[1180px]:[grid-template-rows:auto_minmax(0,1fr)_minmax(280px,42vh)] max-[1180px]:[grid-template-columns:minmax(320px,390px)_minmax(0,1fr)] max-[820px]:h-auto max-[820px]:max-h-none max-[820px]:overflow-auto max-[820px]:[grid-template-columns:1fr] max-[820px]:[grid-template-rows:auto_auto_auto_auto]">
      <TopBar className="col-span-full">
        <ActionRow className="items-center">
          <Menu trigger={<Button size="icon" type="button" title="App menu"><MenuIcon /></Button>}>
            <MenuLabel>Navigate</MenuLabel>
            <MenuItem onSelect={onOpenMapEditor}><Map className="mr-2 inline h-4 w-4" /> Map editor</MenuItem>
            <MenuItem disabled><PackageOpen className="mr-2 inline h-4 w-4" /> Asset editor</MenuItem>
            <MenuSeparator />
            <MenuLabel>Assets</MenuLabel>
            <MenuItem onSelect={createNewSpecies}><Wand2 className="mr-2 inline h-4 w-4" /> New species</MenuItem>
            <MenuItem onSelect={duplicateSpecies}><Copy className="mr-2 inline h-4 w-4" /> Duplicate species</MenuItem>
          </Menu>
          <TopBarTitle>Vegetation Assets</TopBarTitle>
        </ActionRow>
        <div className="min-w-0 truncate text-sm font-semibold text-[var(--muted-text)]">{asset.species.displayName}</div>
      </TopBar>

      <Panel as="aside">
        <PanelHeader><h2 className="m-0 text-lg">Species / Recipe</h2></PanelHeader>
        <PanelBody>
          <Stack>
            <SelectField
              label="Species"
              value={asset.species.id}
              options={speciesAssets.map((item) => ({ value: item.species.id, label: item.species.displayName }))}
              onChange={selectSpecies}
            />
            <ActionRow>
              <Button type="button" size="compact" onClick={createNewSpecies}><Wand2 className="mr-1 h-4 w-4" /> New</Button>
              <Button type="button" size="compact" onClick={duplicateSpecies}><Copy className="mr-1 h-4 w-4" /> Duplicate</Button>
              <Button type="button" tone="danger" size="compact" disabled={!canDeleteSpecies} onClick={deleteSpecies}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
            </ActionRow>
            {isProtectedSpecies ? (
              <div className="rounded-md bg-[var(--subtle-bg)] px-3 py-2 text-sm text-[var(--muted-text)]">Built-in id: {asset.species.id}</div>
            ) : (
              <TextField
                label="Species id"
                value={asset.species.id}
                onChange={(id) => {
                  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
                    setMessage("Species id must start with a letter and use only letters, numbers, underscores, or dashes.");
                    return false;
                  }
                  if (builtInIds.has(id) && id !== asset.species.id) {
                    setMessage(`Species id "${id}" is reserved for a built-in species.`);
                    return false;
                  }
                  if (id !== asset.species.id && speciesAssets.some((item) => item.species.id === id)) {
                    setMessage(`Species id "${id}" already exists.`);
                    return false;
                  }
                  const previousId = asset.species.id;
                  updateAsset((current) => ({ ...current, species: { ...current.species, id } }));
                  setSelectedSpeciesId(id);
                  setMessage(`Renamed species "${previousId}" to "${id}".`);
                  return true;
                }}
              />
            )}
            <TextField label="Display name" value={asset.species.displayName} onChange={(displayName) => updateAsset((current) => ({ ...current, species: { ...current.species, displayName } }))} />
            <AddPhrasePalette materials={Object.keys(asset.species.materials)} onAdd={addRootPhrase} />
            <div className="rounded-md bg-[var(--subtle-bg)] px-3 py-2 text-sm text-[var(--muted-text)]">
              A recipe is a growing cursor. It can continue, fork into alike continuations, branch off different offshoots, steer, or form geometry.
            </div>
            {shape.type !== "fieldFlower" ? (
              <div className="rounded-md bg-[var(--subtle-bg)] px-3 py-2 text-sm text-[var(--muted-text)]">
                {shape.type} has a basic shape preview. Dedicated recipe-driven generation for this shape is still pending.
              </div>
            ) : null}
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
                    onSelect={setSelectedPhraseId}
                  />
                ))
              ) : (
                <div className="rounded-md border border-dashed border-[var(--panel-border)] px-3 py-4 text-sm text-[var(--muted-text)]">
                  This recipe is empty. Add a root phrase to build from scratch.
                </div>
              )}
            </div>
          </Stack>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><h2 className="m-0 text-lg">Babylon Previews</h2></PanelHeader>
        <PanelBody className="grid h-full min-h-0 overflow-hidden">
          <VegetationBabylonPreview asset={asset} grass={grass} focusPhraseId={selectedPhrase?.id} />
        </PanelBody>
      </Panel>

      <Panel as="aside" className="max-[1180px]:col-span-full">
        <PanelHeader><h2 className="m-0 text-lg">Inspector</h2></PanelHeader>
        <PanelBody>
          <Stack>
            {selectedPhrase ? (
              <>
                <PhraseProperties
                  phrase={selectedPhrase}
                  materials={Object.keys(asset.species.materials)}
                  onChange={updateSelectedPhrase}
                  onAddAfter={addAfterSelected}
                  onAddInside={addInsideSelected}
                />
              </>
            ) : (
              <div className="rounded-md bg-[var(--subtle-bg)] px-3 py-2 text-sm text-[var(--muted-text)]">Select a recipe phrase to edit it.</div>
            )}
            <div className="h-px bg-[var(--panel-border)]" />
            <MaterialEditor asset={asset} onChange={updateAsset} />
            <div className="h-px bg-[var(--panel-border)]" />
            <GrassLodEditor grass={grass} onChange={updateGrass} />
            <ActionRow>
              <FileButton accept=".json,.lamow-vegetation.json,application/json" size="compact" onFile={(file) => file.text().then(loadJsonText)}><FileUp className="mr-1 h-4 w-4" /> Import</FileButton>
              <Button type="button" size="compact" onClick={downloadJson}><Download className="mr-1 inline h-4 w-4" /> Export</Button>
            </ActionRow>
            <div className="rounded-md bg-[var(--subtle-bg)] px-3 py-2 text-sm text-[var(--muted-text)]">{message}</div>
            <details className="rounded-md border border-[var(--surface-border)] p-3">
              <summary className="cursor-pointer text-sm font-bold text-[var(--muted-text)]">Raw asset JSON</summary>
              <textarea className="mt-3 min-h-48 w-full resize-none rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] p-2 font-mono text-xs text-[var(--app-text)]" spellCheck={false} readOnly value={exportText} />
            </details>
          </Stack>
        </PanelBody>
      </Panel>
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
      <div
        className={`relative grid min-h-8 grid-cols-[1.35rem_1rem_1.2rem_minmax(0,1fr)_auto] items-center gap-1 rounded-md border px-1.5 text-left text-sm ${selectedId === phrase.id ? "border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)]" : "border-[var(--panel-border)] bg-[var(--surface-bg)] text-[var(--app-text)]"} ${dragDisabled ? "opacity-55" : ""} ${rowDropClass}`}
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
          title="Delete phrase"
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
        <button className="min-w-0 truncate py-1 text-left" type="button" onClick={() => onSelect(phrase.id)}>
          {phrase.label}
        </button>
        <span className="text-xs uppercase text-[var(--muted-text)]">{phrase.type}</span>
      </div>
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
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function PhraseIcon({ type }: { type: GrowthPhrase["type"] }) {
  if (type === "fork") return <Split className="h-4 w-4" />;
  if (type === "branch") return <GitBranch className="h-4 w-4" />;
  if (type === "continue") return <Sprout className="h-4 w-4" />;
  return <Plus className="h-4 w-4" />;
}

function AddPhrasePalette({ materials, title = "Add root phrase", onAdd }: { materials: string[]; title?: string; onAdd: (phrase: GrowthPhrase) => void }) {
  const items = [
    { label: "Continue", factory: makeContinuePhrase, icon: <Sprout className="mr-1 h-4 w-4" /> },
    { label: "Steer", factory: makeSteerPhrase, icon: <Plus className="mr-1 h-4 w-4" /> },
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
  const [draft, setDraft] = useState<GrowthPhrase>(() => factory());
  const openChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setDraft(factory());
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
        <div>
          <div className="text-xs font-black uppercase tracking-[0.04em] text-[var(--muted-text)]">Add {label}</div>
          <div className="mt-1 text-sm text-[var(--app-text)]">{phraseHelp(draft.type)}</div>
        </div>
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

function PhraseDraftFields({ phrase, materials, onChange }: { phrase: GrowthPhrase; materials: string[]; onChange: (phrase: GrowthPhrase) => void }) {
  return (
    <Stack>
      <InlineTextField label="Label" value={phrase.label} onChange={(label) => onChange({ ...phrase, label })} />
      {phrase.type === "continue" ? (
        <>
          <VariationField label="Distance" value={phrase.distance} onChange={(distance) => onChange({ ...phrase, distance })} />
          <VariationField label="Start radius" value={phrase.radiusStart ?? { ideal: 0.01, deviation: 0 }} onChange={(radiusStart) => onChange({ ...phrase, radiusStart })} />
          <VariationField label="End radius" value={phrase.radiusEnd ?? { ideal: 0.006, deviation: 0 }} onChange={(radiusEnd) => onChange({ ...phrase, radiusEnd })} />
          <SelectField label="Form along path" value={phrase.formAlongPath ?? "none"} options={["none", "stemSkin", "blade"].map((value) => ({ value, label: value }))} onChange={(formAlongPath) => onChange({ ...phrase, formAlongPath: formAlongPath as "none" | "stemSkin" | "blade" })} />
        </>
      ) : null}
      {phrase.type === "steer" ? (
        <>
          <VariationField label="Pitch degrees" value={phrase.pitchDegrees ?? { ideal: 0, deviation: 0 }} onChange={(pitchDegrees) => onChange({ ...phrase, pitchDegrees })} />
          <VariationField label="Yaw degrees" value={phrase.yawDegrees ?? { ideal: 0, deviation: 0 }} onChange={(yawDegrees) => onChange({ ...phrase, yawDegrees })} />
          <VariationField label="Roll degrees" value={phrase.rollDegrees ?? { ideal: 0, deviation: 0 }} onChange={(rollDegrees) => onChange({ ...phrase, rollDegrees })} />
        </>
      ) : null}
      {phrase.type === "fork" ? (
        <>
          <VariationField label="Count" value={phrase.count} integer onChange={(count) => onChange({ ...phrase, count: count as CountVariation })} />
          <SelectField label="Layout" value={phrase.layout} options={["radial", "spiral", "mirrored", "cluster", "sameAxis"].map((value) => ({ value, label: value }))} onChange={(layout) => onChange({ ...phrase, layout: layout as ForkPhrase["layout"] })} />
          <VariationField label="Spread degrees" value={phrase.spreadDegrees} onChange={(spreadDegrees) => onChange({ ...phrase, spreadDegrees })} />
          <VariationField label="Radius" value={phrase.radius} onChange={(radius) => onChange({ ...phrase, radius })} />
        </>
      ) : null}
      {phrase.type === "branch" ? (
        <>
          <VariationField label="Offshoot count" value={phrase.count} integer onChange={(count) => onChange({ ...phrase, count: count as CountVariation })} />
          <SelectField label="Layout" value={phrase.layout} options={["alongPath", "radial", "alternating", "tip", "fromForm"].map((value) => ({ value, label: value }))} onChange={(layout) => onChange({ ...phrase, layout: layout as "alongPath" | "radial" | "alternating" | "tip" | "fromForm" })} />
        </>
      ) : null}
      {phrase.type === "form" ? (
        <FormPhraseDraftFields phrase={phrase} materials={materials} onChange={(nextPhrase) => onChange(nextPhrase)} />
      ) : null}
    </Stack>
  );
}

function FormPhraseDraftFields({ phrase, materials, onChange }: { phrase: FormPhrase; materials: string[]; onChange: (phrase: FormPhrase) => void }) {
  return (
    <>
      <SelectField label="Primitive" value={phrase.primitive} options={["stemSkin", "saddlePetal", "centerDisc", "leafBlade", "quadSlat", "seedFuzz", "importedMesh"].map((value) => ({ value, label: value }))} onChange={(primitive) => onChange({ ...phrase, primitive: primitive as FormPhrase["primitive"] })} />
      <SelectField label="Material" value={phrase.materialId} options={materials.map((value) => ({ value, label: value }))} onChange={(materialId) => onChange({ ...phrase, materialId })} />
      <VariationField label="Length" value={phrase.length ?? { ideal: 0.08, deviation: 0.01 }} onChange={(length) => onChange({ ...phrase, length })} />
      <VariationField label="Width" value={phrase.width ?? { ideal: 0.04, deviation: 0.01 }} onChange={(width) => onChange({ ...phrase, width })} />
      <VariationField label="Cup" value={phrase.cup ?? { ideal: 0.2, deviation: 0.05 }} onChange={(cup) => onChange({ ...phrase, cup })} />
      <VariationField label="Curl" value={phrase.curl ?? { ideal: 0.14, deviation: 0.04 }} onChange={(curl) => onChange({ ...phrase, curl })} />
    </>
  );
}

function InlineTextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <FormLabel>
      {label}
      <input className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-2 text-[var(--app-text)]" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </FormLabel>
  );
}

function PhraseProperties({ phrase, materials, onChange, onAddAfter, onAddInside }: { phrase: GrowthPhrase; materials: string[]; onChange: (updater: (phrase: GrowthPhrase) => GrowthPhrase) => void; onAddAfter: (phrase: GrowthPhrase) => void; onAddInside: (phrase: GrowthPhrase) => void }) {
  const canContainPhrases = phrase.type === "fork" || phrase.type === "branch" || phrase.type === "choose";
  return (
    <Stack>
      <TextField label="Label" value={phrase.label} onChange={(label) => onChange((current) => ({ ...current, label }))} />
      <div className="rounded-md bg-[var(--subtle-bg)] px-3 py-2 text-sm text-[var(--muted-text)]">{phraseHelp(phrase.type)}</div>
      <AddPhrasePalette materials={materials} title="Add after selected" onAdd={onAddAfter} />
      {canContainPhrases ? (
        <AddPhrasePalette materials={materials} title={`Add inside ${phrase.type}`} onAdd={onAddInside} />
      ) : null}
      {phrase.type === "continue" ? (
        <>
          <VariationField label="Distance" value={phrase.distance} onChange={(distance) => onChange((current) => current.type === "continue" ? { ...current, distance } : current)} />
          <VariationField label="Start radius" value={phrase.radiusStart ?? { ideal: 0.01, deviation: 0 }} onChange={(radiusStart) => onChange((current) => current.type === "continue" ? { ...current, radiusStart } : current)} />
          <VariationField label="End radius" value={phrase.radiusEnd ?? { ideal: 0.006, deviation: 0 }} onChange={(radiusEnd) => onChange((current) => current.type === "continue" ? { ...current, radiusEnd } : current)} />
          <SelectField label="Form along path" value={phrase.formAlongPath ?? "none"} options={["none", "stemSkin", "blade"].map((value) => ({ value, label: value }))} onChange={(formAlongPath) => onChange((current) => current.type === "continue" ? { ...current, formAlongPath: formAlongPath as "none" | "stemSkin" | "blade" } : current)} />
        </>
      ) : null}
      {phrase.type === "fork" ? (
        <>
          <VariationField label="Count" value={phrase.count} integer onChange={(count) => onChange((current) => current.type === "fork" ? { ...current, count: count as CountVariation } : current)} />
          <SelectField label="Layout" value={phrase.layout} options={["radial", "spiral", "mirrored", "cluster", "sameAxis"].map((value) => ({ value, label: value }))} onChange={(layout) => onChange((current) => current.type === "fork" ? { ...current, layout: layout as ForkPhrase["layout"] } : current)} />
          <VariationField label="Spread degrees" value={phrase.spreadDegrees} onChange={(spreadDegrees) => onChange((current) => current.type === "fork" ? { ...current, spreadDegrees } : current)} />
          <VariationField label="Radius" value={phrase.radius} onChange={(radius) => onChange((current) => current.type === "fork" ? { ...current, radius } : current)} />
        </>
      ) : null}
      {phrase.type === "branch" ? (
        <>
          <VariationField label="Offshoot count" value={phrase.count} integer onChange={(count) => onChange((current) => current.type === "branch" ? { ...current, count: count as CountVariation } : current)} />
          <SelectField label="Layout" value={phrase.layout} options={["alongPath", "radial", "alternating", "tip", "fromForm"].map((value) => ({ value, label: value }))} onChange={(layout) => onChange((current) => current.type === "branch" ? { ...current, layout: layout as "alongPath" | "radial" | "alternating" | "tip" | "fromForm" } : current)} />
        </>
      ) : null}
      {phrase.type === "form" ? (
        <FormPhraseProperties phrase={phrase} materials={materials} onChange={onChange} />
      ) : null}
      {phrase.type === "steer" ? (
        <>
          <VariationField label="Pitch degrees" value={phrase.pitchDegrees ?? { ideal: 0, deviation: 0 }} onChange={(pitchDegrees) => onChange((current) => current.type === "steer" ? { ...current, pitchDegrees } : current)} />
          <VariationField label="Yaw degrees" value={phrase.yawDegrees ?? { ideal: 0, deviation: 0 }} onChange={(yawDegrees) => onChange((current) => current.type === "steer" ? { ...current, yawDegrees } : current)} />
          <VariationField label="Roll degrees" value={phrase.rollDegrees ?? { ideal: 0, deviation: 0 }} onChange={(rollDegrees) => onChange((current) => current.type === "steer" ? { ...current, rollDegrees } : current)} />
        </>
      ) : null}
    </Stack>
  );
}

function FormPhraseProperties({ phrase, materials, onChange }: { phrase: FormPhrase; materials: string[]; onChange: (updater: (phrase: GrowthPhrase) => GrowthPhrase) => void }) {
  return (
    <>
      <SelectField label="Primitive" value={phrase.primitive} options={["stemSkin", "saddlePetal", "centerDisc", "leafBlade", "quadSlat", "seedFuzz", "importedMesh"].map((value) => ({ value, label: value }))} onChange={(primitive) => onChange((current) => current.type === "form" ? { ...current, primitive: primitive as FormPhrase["primitive"] } : current)} />
      <SelectField label="Material" value={phrase.materialId} options={materials.map((value) => ({ value, label: value }))} onChange={(materialId) => onChange((current) => current.type === "form" ? { ...current, materialId } : current)} />
      <VariationField label="Length" value={phrase.length ?? { ideal: 0.08, deviation: 0.01 }} onChange={(length) => onChange((current) => current.type === "form" ? { ...current, length } : current)} />
      <VariationField label="Width" value={phrase.width ?? { ideal: 0.04, deviation: 0.01 }} onChange={(width) => onChange((current) => current.type === "form" ? { ...current, width } : current)} />
      <VariationField label="Cup" value={phrase.cup ?? { ideal: 0.2, deviation: 0.05 }} onChange={(cup) => onChange((current) => current.type === "form" ? { ...current, cup } : current)} />
      <VariationField label="Curl" value={phrase.curl ?? { ideal: 0.14, deviation: 0.04 }} onChange={(curl) => onChange((current) => current.type === "form" ? { ...current, curl } : current)} />
    </>
  );
}

function GrassLodEditor({ grass, onChange }: { grass: GrassLodSettings; onChange: (patch: Partial<GrassLodSettings>) => void }) {
  return (
    <Stack>
      <h3 className="m-0 text-base">LOD / Slats</h3>
      <FormLabel>
        Density {Math.round(grass.density * 100)}%
        <input type="range" min={0.05} max={1} step={0.01} value={grass.density} onChange={(event) => onChange({ density: Number(event.currentTarget.value) })} />
      </FormLabel>
      <ColorField label="50% grass color" value={grass.preview50Color} onChange={(preview50Color) => onChange({ preview50Color })} />
      <ColorField label="100% grass color" value={grass.preview100Color} onChange={(preview100Color) => onChange({ preview100Color })} />
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

function VariationField({ label, value, integer, onChange }: { label: string; value: IdealVariation | CountVariation; integer?: boolean; onChange: (value: IdealVariation | CountVariation) => void }) {
  const step = integer ? 1 : 0.001;
  const update = (patch: Partial<IdealVariation>) => {
    const next = { ...value, ...patch };
    onChange(integer ? clampCountVariation(next) : next);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6.25rem_6.25rem] items-end gap-1.5">
      <div className="text-xs font-bold text-[var(--muted-text)]">{label}</div>
      <NumberField label="Ideal" value={value.ideal} step={step} min={integer ? 1 : undefined} onChange={(ideal) => update({ ideal })} />
      <NumberField label="+/-" value={value.deviation} step={step} min={0} max={integer ? Math.max(0, value.ideal) : undefined} onChange={(deviation) => update({ deviation })} />
    </div>
  );
}

function NumberField({ label, value, step, min, max, onChange }: { label: string; value: number; step: number; min?: number; max?: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(formatNumber(value, step));
  const valueRef = useRef(value);
  const holdRef = useRef<{ frame?: number; direction: -1 | 1; startedAt: number; accumulator: number; lastAt: number } | undefined>(undefined);

  useEffect(() => {
    valueRef.current = value;
    setDraft(formatNumber(value, step));
  }, [value, step]);

  const clamp = (raw: number) => {
    const clampedMin = min === undefined ? raw : Math.max(min, raw);
    return max === undefined ? clampedMin : Math.min(max, clampedMin);
  };
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return false;
    const next = normalizeStep(clamp(parsed), step);
    valueRef.current = next;
    setDraft(formatNumber(next, step));
    onChange(next);
    return true;
  };
  const nudge = (direction: -1 | 1, multiplier = 1) => {
    const base = valueRef.current;
    const next = normalizeStep(clamp(base + (direction * step * multiplier)), step);
    if (next === base) return;
    valueRef.current = next;
    setDraft(formatNumber(next, step));
    onChange(next);
  };
  const holdRate = (elapsed: number) => {
    if (elapsed < 360) return 0;
    const active = elapsed - 360;
    if (step >= 1) return Math.min(18, 4.5 + active / 180);
    return Math.min(54, 12 + active / 70);
  };
  const tickHold = (now: number) => {
    const hold = holdRef.current;
    if (!hold) return;
    const elapsed = now - hold.startedAt;
    const delta = Math.min(80, now - hold.lastAt);
    hold.lastAt = now;
    hold.accumulator += (holdRate(elapsed) * delta) / 1000;
    const steps = Math.floor(hold.accumulator);
    if (steps > 0) {
      hold.accumulator -= steps;
      nudge(hold.direction, steps);
    }
    hold.frame = window.requestAnimationFrame(tickHold);
  };
  const stopHold = () => {
    if (holdRef.current?.frame !== undefined) window.cancelAnimationFrame(holdRef.current.frame);
    holdRef.current = undefined;
  };
  const startHold = (direction: -1 | 1) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    stopHold();
    nudge(direction);
    const now = performance.now();
    holdRef.current = { direction, startedAt: now, accumulator: 0, lastAt: now };
    holdRef.current.frame = window.requestAnimationFrame(tickHold);
  };

  useEffect(() => stopHold, []);

  return (
    <FormLabel>
      {label}
      <div className="grid h-8 grid-cols-[1.35rem_minmax(2.9rem,1fr)_1.35rem] overflow-hidden rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] transition focus-within:border-[#2f6f34] focus-within:shadow-[0_0_0_2px_rgb(47_111_52_/_18%)]">
        <button
          aria-label={`Decrease ${label}`}
          className="select-none border-r border-[var(--input-border)] text-[11px] font-bold leading-none text-[var(--muted-text)] outline-none hover:bg-[var(--hover-bg)] focus-visible:bg-[var(--subtle-bg)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
          disabled={min !== undefined && value <= min}
          type="button"
          onPointerDown={startHold(-1)}
          onPointerUp={stopHold}
          onPointerCancel={stopHold}
          onLostPointerCapture={stopHold}
        >
          -
        </button>
        <input
          className="min-w-0 bg-transparent px-1 text-center text-[12px] tabular-nums text-[var(--app-text)] outline-none"
          inputMode="decimal"
          value={draft}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            setDraft(raw);
            if (/^-?\d*\.?\d+$/.test(raw)) commit(raw);
          }}
          onBlur={(event) => {
            if (!commit(event.currentTarget.value)) setDraft(formatNumber(value, step));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "ArrowUp") {
              event.preventDefault();
              nudge(1, event.shiftKey ? 10 : 1);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              nudge(-1, event.shiftKey ? 10 : 1);
            }
          }}
        />
        <button
          aria-label={`Increase ${label}`}
          className="select-none border-l border-[var(--input-border)] text-[11px] font-bold leading-none text-[var(--muted-text)] outline-none hover:bg-[var(--hover-bg)] focus-visible:bg-[var(--subtle-bg)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
          disabled={max !== undefined && value >= max}
          type="button"
          onPointerDown={startHold(1)}
          onPointerUp={stopHold}
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
  const ideal = Math.max(1, Math.round(value.ideal));
  const deviation = Math.max(0, Math.min(Math.round(value.deviation), ideal));
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
    if (/^#[0-9A-Fa-f]{6}$/.test(nextValue)) onChange(nextValue as ColorHex);
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
          onBlur={(event) => commitText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </div>
    </FormLabel>
  );
}

function phraseHelp(type: GrowthPhrase["type"]) {
  if (type === "continue") return "The current growth cursor advances and stays the same logical thought.";
  if (type === "fork") return "The cursor splits into multiple alike continuations, such as petals in a whorl.";
  if (type === "branch") return "The main cursor keeps going while leaving a different offshoot behind.";
  if (type === "form") return "Actual geometry is formed at the cursor: petal, leaf, center, slat, or mesh.";
  if (type === "steer") return "The cursor changes direction, tilt, roll, or scale before the next phrase.";
  if (type === "color") return "The material context changes for following forms.";
  return "One of several phrase paths is chosen during generation.";
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
  return { id: uniqueId("continue"), type: "continue", label: "Continue growth", distance: { ideal: 0.08, deviation: 0.015 }, formAlongPath: "none" };
}

function makeForkPhrase(): GrowthPhrase {
  return { id: uniqueId("fork"), type: "fork", label: "Fork continuations", count: { ideal: 6, deviation: 1 }, layout: "radial", spreadDegrees: { ideal: 360, deviation: 0 }, radius: { ideal: 0.04, deviation: 0.006 }, continuation: [makeFormPhrase()] };
}

function makeBranchPhrase(): GrowthPhrase {
  return { id: uniqueId("branch"), type: "branch", label: "Branch offshoot", count: { ideal: 1, deviation: 0 }, layout: "tip", offshoot: [makeFormPhrase()] };
}

function makeSteerPhrase(): GrowthPhrase {
  return { id: uniqueId("steer"), type: "steer", label: "Steer cursor", pitchDegrees: { ideal: 0, deviation: 0 }, yawDegrees: { ideal: 0, deviation: 0 }, rollDegrees: { ideal: 0, deviation: 0 } };
}

function makeFormPhrase(): GrowthPhrase {
  return { id: uniqueId("form"), type: "form", label: "Form part", primitive: "saddlePetal", materialId: "petal", length: { ideal: 0.08, deviation: 0.01 }, width: { ideal: 0.04, deviation: 0.008 } };
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
          label: "Lift from ground",
          distance: { ideal: 0.018, deviation: 0.008 },
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
  next.editor = { ...next.editor, tags: ["groundcover", "starter"], notes: "Formal clover shape; dedicated clover preview controls are pending." };
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
  next.editor = { ...next.editor, tags: ["tall-flower", "starter"], notes: "Formal tulip asset; gameplay behavior is represented but dedicated tall-flower preview controls are pending." };
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
