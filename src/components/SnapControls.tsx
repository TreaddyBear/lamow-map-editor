import { useEffect, useRef, useState } from "react";
import type { SnapSettings } from "../editor/types";
import { Field, SelectField } from "./formControls";

type Props = {
  settings: SnapSettings;
  onChange: (settings: SnapSettings) => void;
};

export function SnapControls({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const toggleSnap = () => {
    const enabled = !settings.enabled;
    onChange({ ...settings, enabled });
    setOpen(enabled);
  };

  return (
    <div ref={ref} className={`snap-widget ${settings.enabled ? "active" : ""}`} onPointerEnter={() => settings.enabled && setOpen(true)}>
      <button className="snap-toggle" type="button" title={settings.enabled ? "Disable snapping" : "Enable snapping"} aria-pressed={settings.enabled} onClick={toggleSnap}>
        <span aria-hidden="true">U</span>
      </button>
      {settings.enabled && open ? (
        <div className="snap-popover">
          <SelectField
            label="mode"
            value={settings.mode}
            options={[
              { value: "toGrid", label: "To grid" },
              { value: "byIncrement", label: "By increment" },
            ]}
            onChange={(mode) => onChange({ ...settings, mode: mode as SnapSettings["mode"] })}
          />
          <Field label="increment" type="number" value={settings.increment} onCommit={(value) => onChange({ ...settings, increment: Math.max(0.1, Number(value) || 1) })} />
        </div>
      ) : null}
    </div>
  );
}
