import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { parseVegetationAsset, type VegetationSpeciesAssetFile } from "@lamow/landscape-renderer";
import { defaultVegetationAsset } from "@lamow/landscape-renderer/vegetation/assets";
import { Button, FileButton, Popover, TopBar, TopBarTitle } from "../Components/Base";
import { createVegetationPlaytest, type PreviewBrushMode } from "../Views/vegetationPlaytestRuntime";

/** Separate interactive host: consumes the portable package and exported asset. */
export function VegetationPlaytestPage() {
  const navigate = useNavigate(), location = useLocation();
  const [asset, setAsset] = useState<VegetationSpeciesAssetFile>(() => location.state?.asset ?? defaultVegetationAsset);
  const [remaining, setRemaining] = useState(0), [message, setMessage] = useState("");
  const [mode, setMode] = useState<PreviewBrushMode>("cut"), [radius, setRadius] = useState(0.45), [resetOpen, setResetOpen] = useState(false);
  const [softness, setSoftness] = useState(0.5);
  const canvas = useRef<HTMLCanvasElement>(null), runtime = useRef<ReturnType<typeof createVegetationPlaytest> | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    setRemaining(0);
    try { runtime.current = createVegetationPlaytest(canvas.current, asset, setRemaining); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load this species."); }
    return () => { runtime.current?.dispose(); runtime.current = null; };
  }, [asset]);
  useEffect(() => { runtime.current?.setBrush(mode, radius, softness); }, [asset, mode, radius, softness]);
  return <main className="grid h-screen grid-rows-[auto_minmax(0,1fr)] gap-3 p-4" data-testid="vegetation-playtest">
    <TopBar>
      <TopBarTitle>{asset.species.displayName} · Playtest</TopBarTitle>
      <span role="status" className="text-sm">{remaining} standing</span>
      <Popover open={resetOpen} onOpenChange={setResetOpen} trigger={<Button>Restore plants</Button>}>
        <div className="rounded border border-[var(--surface-border)] bg-[var(--surface-bg)] p-2 text-sm"><div className="mb-2">Reset painted and cut areas?</div><div className="flex gap-2"><Button size="compact" onClick={() => setResetOpen(false)}>Cancel</Button><Button size="compact" onClick={() => { runtime.current?.reset(); setResetOpen(false); }}>Reset patch</Button></div></div>
      </Popover>
      <FileButton accept=".json" onFile={file => file.text().then(text => setAsset(parseVegetationAsset(text))).catch(error => setMessage(error.message))}>Import species</FileButton>
      <Button onClick={() => navigate("/assets")}>Back to assets</Button>
    </TopBar>
    <div className="relative min-h-0 overflow-hidden rounded-lg">
      <canvas ref={canvas} data-testid="playtest-canvas" className="h-full w-full touch-none" />
      <div role="toolbar" aria-label="Playtest brush" className="absolute left-3 top-3 flex w-80 max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)] p-2 shadow-sm">
        <div className="flex gap-1">{([['cut','Cut'],['flowers','Flowers'],['grass','Grass'],['camera','Camera']] as const).map(([value, label]) => <Button key={value} size="compact" aria-label={value === 'flowers' ? 'Paint flowers' : value === 'grass' ? 'Paint grass' : label} aria-pressed={mode === value} title={value === 'cut' ? 'Hover to push; click or drag to mow' : value === 'flowers' ? 'Paint flowers' : value === 'grass' ? 'Paint grass' : 'Drag to turn the camera; right-drag to pan'} onClick={() => setMode(value)} className="flex-1 aria-pressed:bg-[#2f6f34] aria-pressed:text-white">{label}</Button>)}</div>
        {mode !== 'camera' && <div className="flex items-center gap-2 px-1"><span title="Small brush" aria-hidden="true" className="flex h-5 w-5 items-center justify-center"><span className="h-1 w-1 rounded-full bg-[#486d2f]"/></span><input aria-label="Brush size" type="range" min="0.1" max="1.5" step="0.05" value={radius} onChange={event => setRadius(Number(event.target.value))} className="min-w-0 flex-1 accent-[#2f6f34]"/><span title="Large brush" aria-hidden="true" className="flex h-5 w-5 items-center justify-center"><span className="h-4 w-4 rounded-full bg-[#486d2f]"/></span></div>}
        {(mode === 'flowers' || mode === 'grass') && <div className="flex items-center gap-2 px-1"><span title="Sharp edge" aria-hidden="true" className="h-5 w-5 rounded-full bg-[#486d2f]"/><input aria-label="Brush softness" type="range" min="0" max="1" step="0.05" value={softness} onChange={event => setSoftness(Number(event.target.value))} className="min-w-0 flex-1 accent-[#2f6f34]"/><span title="Soft edge" aria-hidden="true" className="h-5 w-5" style={{background:'radial-gradient(circle, #486d2f 0%, #486d2f80 30%, transparent 70%)'}}/></div>}
      </div>
      {message && <div role="alert" className="absolute bottom-3 left-3 rounded bg-[var(--app-bg)] p-3">{message}</div>}
    </div>
  </main>;
}
