import type { SnapSettings } from "../editor/types";
import { CheckboxField, Field, SelectField } from "./formControls";

type Props = {
  settings: SnapSettings;
  onChange: (settings: SnapSettings) => void;
};

export function SnapControls({ settings, onChange }: Props) {
  return (
    <div className="snap-widget">
      <CheckboxField label="Snap" checked={settings.enabled} onChange={(enabled) => onChange({ ...settings, enabled })} />
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
  );
}
