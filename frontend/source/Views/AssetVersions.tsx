import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Save, Star, X } from "lucide-react";
import { Dialog } from "../Components/Base/Dialog";
import { Popover } from "../Components/Base/Popover";
import { ActionRow, Button } from "../Components/Base/Button";
import { FormLabel, TextInput } from "../Components/Base/FormControls";
import { assetDigest, ensureArchetype, makeStandard, readVersion, readVersionLibrary, saveVersion, VersionLibraryError, type SavedVersion, type VersionLibrary } from "../utilities/assets/versionLibrary";
import { parseVegetationAsset, type VegetationSpeciesAssetFile } from "../utilities/assets/vegetation";

type Props = {
  asset: VegetationSpeciesAssetFile; baselineAsset: VegetationSpeciesAssetFile;
  currentVersionId: string | null; onVersionSaved: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onRestore: (asset: VegetationSpeciesAssetFile, id: string) => void;
  onStandardChanged: (asset: VegetationSpeciesAssetFile) => void;
};
const content = (asset: VegetationSpeciesAssetFile) => { try { return JSON.stringify(parseVegetationAsset(JSON.stringify(asset))); } catch { return JSON.stringify(asset); } };

export function AssetVersions({ asset, baselineAsset, currentVersionId, onVersionSaved, onDirtyChange, onRestore, onStandardChanged }: Props) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [library, setLibrary] = useState<VersionLibrary>();
  const [baseline, setBaseline] = useState<VegetationSpeciesAssetFile>();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [creating, setCreating] = useState(false), [name, setName] = useState(""), [selectedId, setSelectedId] = useState("");
  const [confirm, setConfirm] = useState<SavedVersion>();
  const entry = library?.archetypes.find(entry => entry.speciesId === asset.species.id);
  const current = entry?.versions.find(version => version.id === currentVersionId);
  const currentContent = useMemo(() => content(asset), [asset]);
  const baselineDocument = baseline ?? baselineAsset;
  const baseContent = useMemo(() => content(baselineDocument), [baselineDocument]);
  const dirty = currentContent !== baseContent;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useLayoutEffect(() => { onDirtyChange(dirty); }, [dirty, asset.species.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let index = await readVersionLibrary();
      let item = index.archetypes.find(item => item.speciesId === asset.species.id);
      if (!item) { index = await ensureArchetype(baselineAsset); item = index.archetypes.find(item => item.speciesId === asset.species.id); }
      if (!item) throw new Error("The archetype could not be opened.");
      const digests: string[] = currentVersionId ? [] : await Promise.all([assetDigest(asset), assetDigest(asset, true)]);
      const id = item.versions.find(version => version.id === currentVersionId)?.id
        ?? [...item.versions].reverse().find(version => digests.includes(version.assetHash))?.id
        ?? item.standardVersionId ?? item.versions[0].id;
      const saved = await readVersion(id);
      if (cancelled) return;
      setLibrary(index); setBaseline(saved.asset); setSelectedId(id); setError("");
      if (id !== currentVersionId) onVersionSaved(id);
    })().catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [asset.species.id, currentVersionId]);

  const refresh = async () => { const index = await readVersionLibrary(); setLibrary(index); return index; };
  const act = async (operation: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await operation(); } catch (error) {
      if (error instanceof VersionLibraryError && error.status === 409) await refresh().catch(() => {});
      setError((error as Error).message);
    } finally { setBusy(false); }
  };
  const save = (label: string) => act(async () => {
    if (!library) return;
    const result = await saveVersion(asset, label, library.revision, current?.id ?? null);
    const saved = await readVersion(result.version.id);
    if (!mounted.current) return;
    setLibrary(result.index); setBaseline(saved.asset); setSelectedId(result.version.id); onVersionSaved(result.version.id); setCreating(false);
  });
  const applyVersion = (version: SavedVersion, discardApproved = false) => act(async () => {
    const saved = await readVersion(version.id);
    if (!mounted.current) return;
    if (dirtyRef.current && !discardApproved) { setConfirm(version); setOpen(false); return; }
    setBaseline(saved.asset); onRestore(saved.asset, saved.id); setSelectedId(saved.id); setConfirm(undefined); setOpen(false);
  });
  const makeCurrent = (version: SavedVersion) => {
    if (dirty) { setConfirm(version); setOpen(false); } else void applyVersion(version);
  };
  const makeDefault = (version: SavedVersion) => act(async () => {
    if (!library) return;
    const saved = await readVersion(version.id);
    const index = await makeStandard(asset.species.id, version.id, library.revision);
    if (!mounted.current) return;
    setLibrary(index); onStandardChanged(saved.asset);
  });
  return <>
    <Popover open={open} onOpenChange={next => { if (!busy) { setOpen(next); if (next) { setSelectedId(currentVersionId ?? ""); setCreating(false); void act(async () => { await refresh(); }); } } }} align="end" className="w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)] text-[var(--app-text)] shadow-lg"
      trigger={<Button size="compact" aria-label="Asset versions" data-testid="asset-version-trigger" className="inline-flex shrink-0 items-center gap-1 font-medium">{current ? `v${current.number}${dirty ? "*" : ""}` : "v1"}<ChevronDown size={12} /></Button>}>
      <div className="grid max-h-[min(36rem,calc(100vh-6rem))] gap-3 overflow-y-auto p-3" data-testid="asset-versions">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Versions</h2><Button size="compact" aria-label="Close versions" onClick={() => setOpen(false)}><X size={14}/></Button></div>
        <ActionRow>
          <Button size="compact" disabled={busy || !library} onClick={() => { setName(`Version ${(entry?.versions.length ?? 0) + 1}`); setCreating(true); }}><Plus className="mr-1 inline h-3.5 w-3.5"/>Create new version</Button>
          {dirty && <Button size="compact" disabled={busy || !library} onClick={() => void save(`Version ${(entry?.versions.length ?? 0) + 1}`)}><Save className="mr-1 inline h-3.5 w-3.5"/>Save draft</Button>}
        </ActionRow>
        {creating && <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (name.trim()) void save(name.trim()); }}>
          <FormLabel>Version name<TextInput autoFocus value={name} maxLength={80} onChange={event => setName(event.target.value)} disabled={busy}/></FormLabel>
          <ActionRow><Button size="compact" type="submit" disabled={busy || !name.trim()}>Create version</Button><Button size="compact" disabled={busy} onClick={() => setCreating(false)}>Cancel</Button></ActionRow>
        </form>}
        <div className="grid gap-2" role="list" aria-label="Saved versions">
          {[...(entry?.versions ?? [])].reverse().map(version => {
            const isCurrent = version.id === currentVersionId, isDefault = version.id === entry?.standardVersionId;
            return <div key={version.id} role="listitem" className={`flex items-center gap-2 rounded-md border bg-[var(--input-bg)] ${selectedId === version.id ? "border-[#2f6f34] ring-1 ring-[#2f6f34]" : "border-[var(--input-border)]"}`}>
              <button type="button" disabled={busy} aria-label={`Select v${version.number} · ${version.label}`} aria-pressed={selectedId === version.id} onClick={() => setSelectedId(version.id)} className="grid min-w-0 flex-1 gap-1 p-2 text-left text-sm">
                <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">v{version.number} · {version.label}</span></span>
                <span className="text-xs text-[var(--muted-text)]">{new Date(version.createdAt).toLocaleString()}</span>
              </button>
              <div className="mr-2 flex shrink-0 items-center gap-1.5">
                <button type="button" disabled={busy || isDefault} title={isDefault ? "Default" : "Make default"} aria-label={isDefault ? "Default version" : `Make v${version.number} default`} data-testid="version-default" data-active={isDefault} onClick={() => void makeDefault(version)} className="grid h-7 w-7 place-items-center rounded border border-[var(--input-border)] text-[var(--muted-text)] enabled:hover:bg-[var(--subtle-bg)] data-[active=true]:text-[#2f6f34]">
                  <Star size={14} fill={isDefault ? "currentColor" : "none"}/>
                </button>
                <button type="button" disabled={busy || (isCurrent && !dirty)} title={isCurrent ? dirty ? "Discard draft" : "Current" : "Make current"} aria-label={isCurrent ? dirty ? "Discard draft" : "Current version" : `Make v${version.number} current`} data-testid="version-current" data-active={isCurrent} onClick={() => makeCurrent(version)} className="grid h-7 w-7 place-items-center rounded border border-[var(--input-border)] text-[var(--muted-text)] enabled:hover:bg-[var(--subtle-bg)] data-[active=true]:bg-[#e4efdf] data-[active=true]:text-[#2f6f34]">
                  <Check size={14} strokeWidth={isCurrent ? 3 : 1.5}/>
                </button>
              </div>
            </div>;
          })}
        </div>
        {error && <div role="alert" className="text-sm">{error}</div>}
      </div>
    </Popover>
    <Dialog open={Boolean(confirm)} title="Discard draft changes?" onOpenChange={next => { if (!next && !busy) { setConfirm(undefined); setOpen(true); } }}>
      <ActionRow className="justify-end p-4" ><Button autoFocus disabled={busy} onClick={() => { setConfirm(undefined); setOpen(true); }}>Cancel</Button><Button tone="danger" disabled={busy} onClick={() => confirm && void applyVersion(confirm, true)}>Discard & switch</Button></ActionRow>
      {error && <div role="alert" className="px-4 pb-4 text-sm">{error}</div>}
    </Dialog>
  </>;
}
