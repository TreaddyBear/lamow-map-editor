import { useState } from "react";
import type { SnapSettings } from "../utilities/editor/types";
import { Field, SelectField } from "../Components/Base/FormControls";
import { Popover, cn } from "../Components/Base";

type Props = {
  settings: SnapSettings;
  onChange: (settings: SnapSettings) => void;
};

export function SnapControls({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const toggleSnap = () => {
    const enabled = !settings.enabled;
    onChange({ ...settings, enabled });
    setOpen(enabled);
  };

  return (
    <div className="absolute left-7 top-7 z-10" onPointerEnter={() => settings.enabled && setOpen(true)}>
      <Popover
        open={settings.enabled && open}
        onOpenChange={setOpen}
        trigger={(
          <button className={cn("grid h-10 w-10 place-items-center rounded-lg border border-[var(--input-border)] bg-[color-mix(in_srgb,var(--surface-bg)_94%,transparent)] p-0 text-xl font-black leading-none text-[var(--muted-text)] shadow-[0_8px_22px_rgb(31_49_27_/_12%)]", settings.enabled && "border-[#2f6f34] bg-[#2f6f34] text-white")} type="button" title={settings.enabled ? "Disable snapping" : "Enable snapping"} aria-pressed={settings.enabled} onClick={toggleSnap}>
            <span aria-hidden="true">U</span>
          </button>
        )}
      >
        <div className="grid w-52 gap-2 rounded-lg border border-[var(--surface-border)] bg-[color-mix(in_srgb,var(--surface-bg)_97%,transparent)] p-3 shadow-[0_12px_30px_rgb(31_49_27_/_16%)] [&_input]:py-1.5 [&_label]:text-[0.68rem] [&_select]:py-1.5">
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
      </Popover>
    </div>
  );
}
