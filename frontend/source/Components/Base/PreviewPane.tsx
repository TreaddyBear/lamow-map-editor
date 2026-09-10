import type { ReactNode, Ref } from "react";
import { Flower, Grid2X2, RotateCcw } from "lucide-react";
import { Menu, MenuItem, MenuLabel } from "./Menu";
import { Button } from "./Button";

const Quincunx = () => <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">{[[4,4],[16,4],[10,10],[4,16],[16,16]].map(([x,y]) => <circle key={`${x}:${y}`} cx={x} cy={y} r="1.7" fill="currentColor" />)}</svg>;

export function PreviewPane({ paneRef, id, label, kind, angle, onAngle, onReset, children }: {
  paneRef: Ref<HTMLDivElement>; id: string; label: string; kind: "plant" | "patch" | "slat";
  angle: string; onAngle: (angle: "perspective" | "top" | "side") => void; onReset: () => void; children?: ReactNode;
}) {
  return <div ref={paneRef} role="region" aria-label={label} data-testid={`preview-${id}`} className={`relative min-h-0 touch-none rounded-lg border border-[var(--surface-border)] ${kind === "plant" ? "col-span-2" : ""}`}>
    <div className="absolute left-2 top-2 z-10 flex h-7 items-center rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)]/70 opacity-70 transition hover:opacity-100 focus-within:opacity-100">
      <div className="group relative">
        <Menu trigger={<Button size="compact" aria-label={`${label} view options`} className="!h-7 !border-0 !bg-transparent !px-1.5">{kind === "plant" ? <Flower size={18}/> : kind === "patch" ? <Quincunx/> : <Grid2X2 size={18}/>}</Button>}>
          <MenuLabel>{label}</MenuLabel>
          {(["perspective", "top", "side"] as const).map(value => <MenuItem key={value} selected={angle === value} onSelect={() => onAngle(value)}>{value[0].toUpperCase() + value.slice(1)}</MenuItem>)}
          {children}
        </Menu>
        <span role="tooltip" className="pointer-events-none absolute left-0 top-9 hidden whitespace-nowrap rounded bg-[var(--surface-bg)] px-2 py-1 text-xs shadow group-hover:block group-focus-within:block">{label}</span>
      </div>
      <Button size="compact" aria-label={`Reset ${label} view`} className="!h-7 !border-0 !bg-transparent !px-1.5" onClick={onReset}><RotateCcw size={12}/></Button>
    </div>
  </div>;
}
