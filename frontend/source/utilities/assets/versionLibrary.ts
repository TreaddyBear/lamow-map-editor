import { parseVegetationAsset, type VegetationSpeciesAssetFile } from "./vegetation";

export type SavedVersion = { id: string; number: number; label: string; createdAt: string; assetHash: string; parentVersionId: string | null; kind: "saved" | "recovery" };
export type ArchetypeVersions = { speciesId: string; displayName: string; standardVersionId: string | null; versions: SavedVersion[] };
export type VersionLibrary = { schemaVersion: 1; revision: number; archetypes: ArchetypeVersions[] };
export type VersionSnapshot = SavedVersion & { schemaVersion: 1; asset: VegetationSpeciesAssetFile };
export type CatalogAsset = { asset: VegetationSpeciesAssetFile; isStandard: boolean; versionId?: string };
const endpoint = "/api/vegetation-library";

export class VersionLibraryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request<T>(path = "", body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(endpoint + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) }); }
  catch { throw new VersionLibraryError(0, "Cannot reach the version library. Your draft is still here; retry when the local server is available."); }
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new VersionLibraryError(404, "Saved versions require the local editor server: pnpm dev or pnpm preview.");
  const data = await response.json();
  if (!response.ok) throw new VersionLibraryError(response.status, data.error ?? "The version operation failed.");
  return data as T;
}
export const readVersionLibrary = () => request<VersionLibrary>();
export const ensureArchetype = (asset: VegetationSpeciesAssetFile) => request<VersionLibrary>("/ensure", { asset });
export type ArchetypeArchive = { versions: VersionSnapshot[]; standardVersionId: string | null; currentVersionId: string | null };
export const transferArchetype = (input: { asset: VegetationSpeciesAssetFile; expectedRevision: number; sourceSpeciesId?: string; targetId?: string; displayName?: string; currentVersionId?: string | null; bundle?: ArchetypeArchive }) => request<{ index: VersionLibrary; asset: VegetationSpeciesAssetFile; currentVersionId: string }>("/transfer", input);
export async function exportArchetype(asset: VegetationSpeciesAssetFile, currentVersionId: string | null) {
  const index = await readVersionLibrary();
  const entry = index.archetypes.find(entry => entry.speciesId === asset.species.id);
  const versions = await Promise.all((entry?.versions ?? []).map(version => readVersion(version.id)));
  return { ...asset, archetypeLibrary: { versions, standardVersionId: entry?.standardVersionId ?? null, currentVersionId } satisfies ArchetypeArchive };
}
export async function readVersion(id: string) {
  const snapshot = await request<VersionSnapshot>("/versions/" + encodeURIComponent(id));
  return { ...snapshot, asset: parseVegetationAsset(JSON.stringify(snapshot.asset)) };
}
export const saveVersion = (asset: VegetationSpeciesAssetFile, label: string, expectedRevision: number, parentVersionId: string | null, kind: "saved" | "recovery" = "saved") => request<{ index: VersionLibrary; version: SavedVersion }>("/versions", { asset, label, expectedRevision, parentVersionId, kind });
export const makeStandard = (speciesId: string, versionId: string, expectedRevision: number) => request<VersionLibrary>("/standard", { speciesId, versionId, expectedRevision });
export async function assetDigest(asset: VegetationSpeciesAssetFile) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parseVegetationAsset(JSON.stringify(asset)))));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}
export async function readArchetypeCatalog(): Promise<CatalogAsset[]> {
  try {
    const library = await readVersionLibrary();
    return Promise.all(library.archetypes.filter(entry => entry.versions.length).map(async entry => ({
      asset: (await readVersion(entry.standardVersionId ?? entry.versions.at(-1)!.id)).asset,
      isStandard: Boolean(entry.standardVersionId),
      versionId: entry.standardVersionId ?? entry.versions.at(-1)!.id,
    })));
  } catch (error) {
    // Static builds contain approved standards, but never pretend to offer writable storage.
    if (!(error instanceof VersionLibraryError) || error.status !== 404) throw error;
    const response = await fetch("/vegetation-standards.json");
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) return [];
    const data = await response.json();
    return data.standards.map((asset: VegetationSpeciesAssetFile) => ({ asset: parseVegetationAsset(JSON.stringify(asset)), isStandard: true }));
  }
}

/** Project standards initialize fresh drafts; existing local work always wins. */
export function mergeArchetypeCatalog(starters: VegetationSpeciesAssetFile[], catalog: CatalogAsset[], drafts: VegetationSpeciesAssetFile[] = []) {
  const assets = new Map(starters.map(asset => [asset.species.id, asset]));
  for (const entry of catalog) if (entry.isStandard || !assets.has(entry.asset.species.id)) assets.set(entry.asset.species.id, entry.asset);
  for (const asset of drafts) assets.set(asset.species.id, asset);
  return [...assets.values()];
}
