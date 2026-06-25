import { X } from "lucide-react";
import { areaBlueprints } from "../domain/blueprints";
import { CheckboxField } from "./formControls";
import { Button } from "./ui";

type Props = {
  open: boolean;
  pinnedAreaBlueprintKeys: string[];
  onPinBlueprint: (key: string, pinned: boolean) => void;
  onClose: () => void;
};

export function BlueprintsDialog({ open, pinnedAreaBlueprintKeys, onPinBlueprint, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="blueprints-title">
        <div className="dialog-header">
          <h2 id="blueprints-title">Blueprints</h2>
          <Button className="icon-button" type="button" title="Close blueprints" onClick={onClose}><X /></Button>
        </div>
        <div className="panel-body stack">
          {areaBlueprints.map((blueprint) => (
            <CheckboxField key={blueprint.key} label={`Pin ${blueprint.label.replace(" here", "")}`} checked={pinnedAreaBlueprintKeys.includes(blueprint.key)} onChange={(checked) => onPinBlueprint(blueprint.key, checked)} />
          ))}
        </div>
      </section>
    </div>
  );
}
