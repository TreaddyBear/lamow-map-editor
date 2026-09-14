import { useRef, useState } from "react";
import { ChevronDown, Copy, Download, FileUp, Plus, Trash2 } from "lucide-react";
import { Dialog } from "../Components/Base/Dialog";
import { ActionRow, Button } from "../Components/Base/Button";
import { TextInput } from "../Components/Base/FormControls";
import type { VegetationSpeciesAssetFile } from "../utilities/assets/vegetation";

type Props = {
  asset: VegetationSpeciesAssetFile; assets: VegetationSpeciesAssetFile[];
  onSelect: (id: string) => void; onNew: () => void | Promise<void>; onDuplicate: () => Promise<void>;
  onRename: (name: string) => void;
  onImport: (file: File) => Promise<void>; onExport: () => Promise<void>;
  onRemove: () => void; canRemove: boolean;
};
export function AssetMenu(props: Props) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const run = async (action: () => Promise<void>, close = true) => {
    setBusy(true); setError("");
    try { await action(); if (close) setOpen(false); } catch (error) { setError((error as Error).message); setOpen(true); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" data-testid="asset-selector" data-species-id={props.asset.species.id} aria-label={`Select asset: ${props.asset.species.displayName}`} title="Assets · New, Duplicate, Import, Export" aria-haspopup="dialog" onClick={() => { setSearch(""); setError(""); setOpen(true); }} className="inline-flex min-w-0 max-w-[min(22rem,50vw)] items-center gap-2 rounded px-1 py-1 text-[1.85rem] font-extralight leading-tight hover:bg-[var(--subtle-bg)] focus-visible:outline-2 focus-visible:outline-[#2f6f34]">
      <span className="truncate">{props.asset.species.displayName}</span><ChevronDown size={16} className="shrink-0 text-[var(--muted-text)]" />
    </button>
    <input ref={file} type="file" aria-label="Import" accept=".json,.lamow-vegetation.json,application/json" hidden onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void run(() => props.onImport(selected)); }} />
    <Dialog open={open} title="Assets" onOpenChange={next => { if (!busy) setOpen(next); }}>
      <div className="grid gap-3 overflow-auto p-3" data-testid="asset-selection-dialog">
        <ActionRow>
          <Button size="compact" disabled={busy} onClick={() => void run(async () => { await props.onNew(); })}><Plus className="mr-1 inline h-4 w-4"/>New</Button>
          <Button size="compact" disabled={busy} onClick={() => void run(props.onDuplicate)}><Copy className="mr-1 inline h-4 w-4"/>Duplicate</Button>
          <Button size="compact" disabled={busy} onClick={() => file.current?.click()}><FileUp className="mr-1 inline h-4 w-4"/>Import</Button>
          <Button size="compact" disabled={busy} onClick={() => void run(props.onExport, false)}><Download className="mr-1 inline h-4 w-4"/>Export</Button>
        </ActionRow>
        <TextInput aria-label="Display name" value={props.asset.species.displayName} disabled={busy} onChange={event => props.onRename(event.target.value)} />
        <TextInput aria-label="Find asset" placeholder="Find asset" value={search} onChange={event => setSearch(event.target.value)}/>
        <div className="grid max-h-72 gap-1 overflow-auto">
          {props.assets.filter(asset => asset.species.displayName.toLowerCase().includes(search.toLowerCase())).map(asset => <button key={asset.species.id} type="button" data-testid={`asset-option-${asset.species.id}`} disabled={busy} aria-pressed={props.asset.species.id === asset.species.id} onClick={() => { props.onSelect(asset.species.id); setOpen(false); }} className={`rounded border bg-[var(--input-bg)] px-3 py-2 text-left text-sm ${props.asset.species.id === asset.species.id ? "border-[#2f6f34] ring-1 ring-[#2f6f34]" : "border-[var(--input-border)]"}`}>{asset.species.displayName}</button>)}
        </div>
        {props.canRemove && <Button size="compact" tone="danger" disabled={busy} onClick={() => { props.onRemove(); setOpen(false); }}><Trash2 className="mr-1 inline h-4 w-4"/>Remove draft</Button>}
        {error && <div role="alert" className="text-sm">{error}</div>}
      </div>
    </Dialog>
  </>;
}
