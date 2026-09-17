import { importJsonValue } from "../domain/importExport";
import { clone, defaultPack, type LevelV1, type MapPackV1 } from "../domain/model";

export const mapDraftKey = "lamow.map-workspace.v1";
export type MapSource = { label: string; revision?: string; kind: "game" | "file" | "sample" };
export type MapWorkspace = { pack: MapPackV1; baseline: MapPackV1; selectedLevelIndex: number; source: MapSource };
export function levelCode(pack: MapPackV1, level: LevelV1) { return level.fullCode ?? pack.pack.prefix + level.code.charAt(0).toUpperCase() + level.code.slice(1); }
export function levelIndex(pack: MapPackV1, code?: string) { return Math.max(0, pack.levels.findIndex(level => level.code === code || levelCode(pack, level) === code)); }
export function nextLevelCode(pack: MapPackV1) {
  let n = pack.levels.length + 1;
  while (pack.levels.some(level => level.code.toLowerCase() === `level${n}`)) n++;
  return `level${n}`;
}
export function readMapWorkspace(storage: Pick<Storage, "getItem">): { workspace: MapWorkspace; recovered: boolean; error?: string } {
  const fallback: MapWorkspace = { pack: clone(defaultPack), baseline: clone(defaultPack), selectedLevelIndex: 0, source: { kind: "sample", label: "Starter map" } };
  try {
    const text = storage.getItem(mapDraftKey); if (!text) return { workspace: fallback, recovered: false };
    const value = JSON.parse(text);
    if (!value.pack?.levels?.length || !value.baseline?.levels?.length || !["game", "file", "sample"].includes(value.source?.kind)) throw new Error("Invalid map draft");
    const pack = importJsonValue(value.pack).pack, baseline = importJsonValue(value.baseline).pack;
    const selectedLevelIndex = Number.isInteger(value.selectedLevelIndex) ? Math.max(0, Math.min(pack.levels.length - 1, value.selectedLevelIndex)) : 0;
    return { workspace: { pack, baseline, selectedLevelIndex, source: value.source }, recovered: true };
  } catch { return { workspace: fallback, recovered: false, error: "The saved map draft could not be opened. It has been kept in browser storage; export your work before leaving." }; }
}
