import type { Selection } from "../../utilities/domain/model";

export function selectAttrs(item: Selection) {
  return { "data-selection-key": selectionKey(item), "data-select-kind": item.kind, "data-select-path": item.path?.join("."), "data-select-index": item.index };
}

export function selectionKey(item: Selection): string {
  return [item.kind, item.path?.join(".") ?? "", item.index ?? ""].join(":");
}
