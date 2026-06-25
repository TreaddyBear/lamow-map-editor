import type { Area, EditorBlueprint } from "../domain/model";
import { areaBlueprints } from "../domain/blueprints";
import { CheckboxField } from "./formControls";
import { ActionRow, Button, Dialog } from "./ui";

type Props = {
  open: boolean;
  customBlueprints: EditorBlueprint[];
  selectedArea?: Area;
  pinnedAreaBlueprintKeys: string[];
  onPinBlueprint: (key: string, pinned: boolean) => void;
  onCreateFromSelection: () => void;
  onUpdateBlueprint: (blueprint: EditorBlueprint) => void;
  onDeleteBlueprint: (key: string) => void;
  onClose: () => void;
};

export function BlueprintsDialog({ open, customBlueprints, selectedArea, pinnedAreaBlueprintKeys, onPinBlueprint, onCreateFromSelection, onUpdateBlueprint, onDeleteBlueprint, onClose }: Props) {
  return (
    <Dialog open={open} title="Blueprints" onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <div className="panel-body stack">
        <section className="stack">
          <div className="section-title">
            <h3>Built-ins</h3>
          </div>
          {areaBlueprints.map((blueprint) => (
            <CheckboxField key={blueprint.key} label={`Pin ${blueprint.label.replace(" here", "")}`} checked={pinnedAreaBlueprintKeys.includes(blueprint.key)} onChange={(checked) => onPinBlueprint(blueprint.key, checked)} />
          ))}
        </section>
        <section className="stack">
          <div className="section-title">
            <h3>Custom</h3>
            <Button type="button" disabled={!selectedArea} onClick={onCreateFromSelection}>New from selection</Button>
          </div>
          {customBlueprints.length === 0 ? <div className="hint">Select an area and create a blueprint from it.</div> : null}
          {customBlueprints.map((blueprint) => (
            <BlueprintEditor key={blueprint.key} blueprint={blueprint} pinned={pinnedAreaBlueprintKeys.includes(blueprint.key)} onPin={(pinned) => onPinBlueprint(blueprint.key, pinned)} onChange={onUpdateBlueprint} onDelete={() => onDeleteBlueprint(blueprint.key)} />
          ))}
        </section>
        <div className="hint">Format v2 note: these custom area archetypes are editor metadata today. A future save format should formalize parameterized archetypes that compile into base level components.</div>
      </div>
    </Dialog>
  );
}

function BlueprintEditor({ blueprint, pinned, onPin, onChange, onDelete }: { blueprint: EditorBlueprint; pinned: boolean; onPin: (pinned: boolean) => void; onChange: (blueprint: EditorBlueprint) => void; onDelete: () => void }) {
  return (
    <div className="item stack">
      <ActionRow className="section-title">
        <strong>{blueprint.label}</strong>
        <Button tone="danger" type="button" onClick={onDelete}>Delete</Button>
      </ActionRow>
      <CheckboxField label="Pin in Add menus" checked={pinned} onChange={onPin} />
      <label>
        Label
        <input value={blueprint.label} onChange={(event) => onChange({ ...blueprint, label: event.currentTarget.value })} />
      </label>
      <label>
        Base id
        <input value={blueprint.baseId} onChange={(event) => onChange({ ...blueprint, baseId: event.currentTarget.value })} />
      </label>
      <label>
        Area JSON
        <textarea spellCheck={false} value={JSON.stringify(blueprint.area, null, 2)} onChange={(event) => onChange(parseAreaBlueprint(blueprint, event.currentTarget.value))} />
      </label>
    </div>
  );
}

function parseAreaBlueprint(blueprint: EditorBlueprint, value: string): EditorBlueprint {
  try {
    const area = JSON.parse(value) as Area;
    return { ...blueprint, area };
  } catch {
    return blueprint;
  }
}
