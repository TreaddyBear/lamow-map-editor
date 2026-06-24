import type { Selection } from "../../domain/model";

export function selectAttrs(item: Selection) {
  return { "data-select-kind": item.kind, "data-select-path": item.path?.join("."), "data-select-index": item.index };
}
