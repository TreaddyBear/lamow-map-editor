import type { Area, EditorBlueprint } from "../utilities/domain/model";
import { areaBlueprints } from "../utilities/domain/blueprints";
import { CheckboxField, FormLabel, TextareaControl, TextInput } from "../Components/Base/FormControls";
import { ActionRow, Button, Dialog, Hint, Item, PanelBody, SectionHeader, Stack } from "../Components/Base";

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
      <PanelBody>
        <Stack>
          <section className="grid gap-3">
            <SectionHeader>
              <h3>Built-ins</h3>
            </SectionHeader>
            {areaBlueprints.map((blueprint) => (
              <CheckboxField key={blueprint.key} label={`Pin ${blueprint.label.replace(" here", "")}`} checked={pinnedAreaBlueprintKeys.includes(blueprint.key)} onChange={(checked) => onPinBlueprint(blueprint.key, checked)} />
            ))}
          </section>
          <section className="grid gap-3">
            <SectionHeader>
              <h3>Custom</h3>
              <Button type="button" disabled={!selectedArea} onClick={onCreateFromSelection}>New from selection</Button>
            </SectionHeader>
            {customBlueprints.length === 0 ? <Hint>Select an area and create a blueprint from it.</Hint> : null}
            {customBlueprints.map((blueprint) => (
              <BlueprintEditor key={blueprint.key} blueprint={blueprint} pinned={pinnedAreaBlueprintKeys.includes(blueprint.key)} onPin={(pinned) => onPinBlueprint(blueprint.key, pinned)} onChange={onUpdateBlueprint} onDelete={() => onDeleteBlueprint(blueprint.key)} />
            ))}
          </section>
          <Hint>Format v2 note: these custom area archetypes are editor metadata today. A future save format should formalize parameterized archetypes that compile into base level components.</Hint>
        </Stack>
      </PanelBody>
    </Dialog>
  );
}

function BlueprintEditor({ blueprint, pinned, onPin, onChange, onDelete }: { blueprint: EditorBlueprint; pinned: boolean; onPin: (pinned: boolean) => void; onChange: (blueprint: EditorBlueprint) => void; onDelete: () => void }) {
  return (
    <Item>
      <Stack>
        <ActionRow className="mb-2.5 items-center justify-between">
          <strong>{blueprint.label}</strong>
          <Button tone="danger" type="button" onClick={onDelete}>Delete</Button>
        </ActionRow>
        <CheckboxField label="Pin in Add menus" checked={pinned} onChange={onPin} />
        <FormLabel>
          Label
          <TextInput value={blueprint.label} onChange={(event) => onChange({ ...blueprint, label: event.currentTarget.value })} />
        </FormLabel>
        <FormLabel>
          Base id
          <TextInput value={blueprint.baseId} onChange={(event) => onChange({ ...blueprint, baseId: event.currentTarget.value })} />
        </FormLabel>
        <FormLabel>
          Area JSON
          <TextareaControl spellCheck={false} value={JSON.stringify(blueprint.area, null, 2)} onChange={(event) => onChange(parseAreaBlueprint(blueprint, event.currentTarget.value))} />
        </FormLabel>
      </Stack>
    </Item>
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
