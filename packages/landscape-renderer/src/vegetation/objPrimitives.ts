import type { ColorHex } from "./assets.js";

export type ObjPrimitiveVertex = {
  id: string;
  x: number;
  y: number;
  z: number;
  color: ColorHex;
};

export type ObjPrimitiveFace = {
  vertices: number[];
  smoothingGroup: string | null;
};

export type ObjPrimitiveMesh = {
  id: string;
  displayName: string;
  sourcePath?: string;
  vertices: ObjPrimitiveVertex[];
  faces: ObjPrimitiveFace[];
  sharpEdges: string[];
};

export type ObjRenderData = {
  positions: number[];
  indices: number[];
  colors: number[];
};

export function validateObjPrimitiveMesh(mesh: ObjPrimitiveMesh) {
  if (!mesh || typeof mesh.id !== "string" || !mesh.id || typeof mesh.displayName !== "string" || !Array.isArray(mesh.vertices) || !mesh.vertices.length || mesh.vertices.length > 10000 || !Array.isArray(mesh.faces) || mesh.faces.length > 20000 || !Array.isArray(mesh.sharpEdges)) throw new Error("Invalid OBJ primitive structure.");
  for (const vertex of mesh.vertices) {
    if (!vertex || ![vertex.x, vertex.y, vertex.z].every((value) => Number.isFinite(value) && Math.abs(value) <= 1000) || !/^#[0-9a-f]{6}$/i.test(vertex.color)) throw new Error(`Primitive "${mesh.id}" has an invalid vertex.`);
  }
  for (const face of mesh.faces) {
    if (!face || !Array.isArray(face.vertices) || face.vertices.length < 3 || face.vertices.some((index) => !Number.isInteger(index) || index < 0 || index >= mesh.vertices.length)) throw new Error(`Primitive "${mesh.id}" has an invalid face.`);
  }
  for (const edge of mesh.sharpEdges) {
    if (typeof edge !== "string" || !/^\d+:\d+$/.test(edge) || edge.split(":").some((index) => Number(index) >= mesh.vertices.length)) throw new Error(`Primitive "${mesh.id}" has an invalid sharp edge.`);
  }
}

export const defaultObjPrimitiveId = "saddlePetal";

const fallbackObjSources = {
  stemSkin: {
    displayName: "Stem Skin",
    obj: `# lamow: id stemSkin
# lamow: displayName Stem Skin
o stemSkin
v 0.50 0.00 0.00 1 1 1
v 0.00 0.00 0.50 1 1 1
v -0.50 0.00 0.00 1 1 1
v 0.00 0.00 -0.50 1 1 1
v 0.50 1.00 0.00 1 1 1
v 0.00 1.00 0.50 1 1 1
v -0.50 1.00 0.00 1 1 1
v 0.00 1.00 -0.50 1 1 1
s 1
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
s off
f 1 4 3 2
f 5 6 7 8
`,
  },
  saddlePetal: {
    displayName: "Saddle Petal",
    obj: `# lamow: id saddlePetal
# lamow: displayName Saddle Petal
o saddlePetal
v -0.10 0.015 0.00 1 1 1
v 0.00 -0.010 0.00 1 1 1
v 0.10 0.015 0.00 1 1 1
v -0.34 0.035 0.32 1 1 1
v 0.00 -0.018 0.34 1 1 1
v 0.34 0.035 0.32 1 1 1
v -0.44 0.060 0.68 1 1 1
v 0.00 -0.010 0.72 1 1 1
v 0.44 0.060 0.68 1 1 1
v -0.22 0.125 1.00 1 1 1
v 0.00 0.080 1.00 1 1 1
v 0.22 0.125 1.00 1 1 1
s 1
f 1 4 5 2
f 2 5 6 3
f 4 7 8 5
f 5 8 9 6
f 7 10 11 8
f 8 11 12 9
`,
  },
  leafBlade: {
    displayName: "Leaf Blade",
    obj: `# lamow: id leafBlade
# lamow: displayName Leaf Blade
# lamow: sharpEdge 1 2
o leafBlade
v -0.16 0.000 0.00 1 1 1
v 0.16 0.000 0.00 1 1 1
v -0.24 0.020 0.42 1 1 1
v 0.24 0.020 0.42 1 1 1
v -0.06 0.045 1.00 1 1 1
v 0.06 0.045 1.00 1 1 1
s 1
f 1 3 4 2
f 3 5 6 4
`,
  },
  centerDisc: {
    displayName: "Center Disc",
    obj: `# lamow: id centerDisc
# lamow: displayName Center Disc
o centerDisc
v 0.00 1.00 0.00 1 1 1
v 1.00 0.00 0.00 1 1 1
v 0.70 0.00 0.70 1 1 1
v 0.00 0.00 1.00 1 1 1
v -0.70 0.00 0.70 1 1 1
v -1.00 0.00 0.00 1 1 1
v -0.70 0.00 -0.70 1 1 1
v 0.00 0.00 -1.00 1 1 1
v 0.70 0.00 -0.70 1 1 1
s 1
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 6
f 1 6 7
f 1 7 8
f 1 8 9
f 1 9 2
`,
  },
  quadSlat: {
    displayName: "Quad Slat",
    obj: `# lamow: id quadSlat
# lamow: displayName Quad Slat
o quadSlat
v -0.50 0.00 0.00 1 1 1
v 0.50 0.00 0.00 1 1 1
v 0.50 1.00 0.00 1 1 1
v -0.50 1.00 0.00 1 1 1
s off
f 1 2 3 4
`,
  },
  seedFuzz: {
    displayName: "Seed Fuzz",
    obj: `# lamow: id seedFuzz
# lamow: displayName Seed Fuzz
o seedFuzz
v -0.08 0.00 0.00 1 1 1
v 0.08 0.00 0.00 1 1 1
v 0.00 0.04 1.00 1 1 1
v 0.00 0.00 -0.08 1 1 1
v 0.00 0.00 0.08 1 1 1
v 0.04 0.04 1.00 1 1 1
s off
f 1 2 3
f 4 5 6
`,
  },
} satisfies Record<string, { displayName: string; obj: string }>;

export function defaultObjPrimitiveLibrary() {
  return Object.entries(fallbackObjSources).map(([id, source]) => parseObjPrimitiveMesh(source.obj, { id, displayName: source.displayName }));
}

export async function loadBuiltInObjPrimitiveLibrary(fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher("/vegetation-primitives/manifest.json");
    if (!response.ok) throw new Error(`Manifest returned ${response.status}.`);
    const manifest = await response.json() as { primitives?: { id: string; displayName: string; path: string }[] };
    const loaded = await Promise.all((manifest.primitives ?? []).map(async (entry) => {
      const objResponse = await fetcher(entry.path);
      if (!objResponse.ok) throw new Error(`${entry.path} returned ${objResponse.status}.`);
      return parseObjPrimitiveMesh(await objResponse.text(), { id: entry.id, displayName: entry.displayName, sourcePath: entry.path });
    }));
    return loaded.length ? loaded : defaultObjPrimitiveLibrary();
  } catch {
    return defaultObjPrimitiveLibrary();
  }
}

export function parseObjPrimitiveMesh(text: string, fallback: { id: string; displayName: string; sourcePath?: string }): ObjPrimitiveMesh {
  const vertices: ObjPrimitiveVertex[] = [];
  const faces: ObjPrimitiveFace[] = [];
  const sharpEdges = new Set<string>();
  let id = fallback.id;
  let displayName = fallback.displayName;
  let smoothingGroup: string | null = "1";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const meta = line.match(/^#\s*lamow:\s*(.+)$/i)?.[1]?.trim();
      if (!meta) continue;
      const [key, ...rest] = meta.split(/\s+/);
      if (key === "id" && rest[0]) id = sanitizePrimitiveId(rest[0]);
      if (key === "displayName" && rest.length) displayName = rest.join(" ");
      if (key === "sharpEdge" && rest.length >= 2) {
        sharpEdges.add(edgeKey(Number(rest[0]) - 1, Number(rest[1]) - 1));
      }
      continue;
    }
    const [command, ...parts] = line.split(/\s+/);
    if (command === "o" && parts.length && displayName === fallback.displayName) displayName = parts.join(" ");
    if (command === "s") smoothingGroup = parts[0] === "off" || parts[0] === "0" ? null : parts[0] ?? "1";
    if (command === "v") {
      const [x, y, z, r, g, b] = parts.map(Number);
      if (![x, y, z].every(Number.isFinite)) throw new Error(`Invalid OBJ vertex line: ${line}`);
      vertices.push({
        id: `v${vertices.length + 1}`,
        x,
        y,
        z,
        color: rgbToHex(
          Number.isFinite(r) ? r : 1,
          Number.isFinite(g) ? g : 1,
          Number.isFinite(b) ? b : 1,
        ),
      });
    }
    if (command === "f") {
      const indices = parts.map((part) => parseObjFaceIndex(part, vertices.length));
      if (indices.length < 3) throw new Error(`OBJ face needs at least three vertices: ${line}`);
      faces.push({ vertices: indices, smoothingGroup });
    }
  }

  if (!vertices.length) throw new Error("OBJ primitive must contain at least one vertex.");
  if (!faces.length) throw new Error("OBJ primitive must contain at least one face.");
  return { id, displayName, sourcePath: fallback.sourcePath, vertices, faces, sharpEdges: [...sharpEdges].sort() };
}

export function serializeObjPrimitiveMesh(mesh: ObjPrimitiveMesh) {
  const lines = [
    `# lamow: id ${mesh.id}`,
    `# lamow: displayName ${mesh.displayName}`,
    ...mesh.sharpEdges.map((key) => {
      const [a, b] = edgeVertices(key);
      return `# lamow: sharpEdge ${a + 1} ${b + 1}`;
    }),
    `o ${mesh.id}`,
    ...mesh.vertices.map((vertex) => {
      const [r, g, b] = hexToRgbUnit(vertex.color);
      return `v ${formatObjNumber(vertex.x)} ${formatObjNumber(vertex.y)} ${formatObjNumber(vertex.z)} ${formatObjNumber(r)} ${formatObjNumber(g)} ${formatObjNumber(b)}`;
    }),
  ];
  let currentSmoothing: string | null | undefined;
  for (const face of mesh.faces) {
    if (face.smoothingGroup !== currentSmoothing) {
      lines.push(face.smoothingGroup ? `s ${face.smoothingGroup}` : "s off");
      currentSmoothing = face.smoothingGroup;
    }
    lines.push(`f ${face.vertices.map((index) => index + 1).join(" ")}`);
  }
  return `${lines.join("\n")}\n`;
}

export function objPrimitiveToRenderData(mesh: ObjPrimitiveMesh): ObjRenderData {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const renderVertexByKey = new Map<string, number>();
  const getRenderVertex = (sourceIndex: number, faceIndex: number, face: ObjPrimitiveFace) => {
    const source = mesh.vertices[sourceIndex];
    const splitForSharpEdge = faceHasSharpEdgeAtVertex(mesh, face, sourceIndex);
    const key = face.smoothingGroup && !splitForSharpEdge ? `${face.smoothingGroup}:${sourceIndex}` : `${faceIndex}:${sourceIndex}`;
    const existing = renderVertexByKey.get(key);
    if (existing !== undefined) return existing;
    const nextIndex = positions.length / 3;
    positions.push(source.x, source.y, source.z);
    const [r, g, b] = hexToRgbUnit(source.color);
    colors.push(r, g, b, 1);
    renderVertexByKey.set(key, nextIndex);
    return nextIndex;
  };

  for (const [faceIndex, face] of mesh.faces.entries()) {
    for (let i = 1; i < face.vertices.length - 1; i += 1) {
      indices.push(
        getRenderVertex(face.vertices[0], faceIndex, face),
        getRenderVertex(face.vertices[i], faceIndex, face),
        getRenderVertex(face.vertices[i + 1], faceIndex, face),
      );
    }
  }

  return { positions, indices, colors };
}

export function objPrimitiveEdges(mesh: ObjPrimitiveMesh) {
  const edges = new Set<string>();
  for (const face of mesh.faces) {
    for (let index = 0; index < face.vertices.length; index += 1) {
      edges.add(edgeKey(face.vertices[index], face.vertices[(index + 1) % face.vertices.length]));
    }
  }
  return [...edges].sort((a, b) => {
    const [a0, a1] = edgeVertices(a);
    const [b0, b1] = edgeVertices(b);
    return a0 - b0 || a1 - b1;
  });
}

export function edgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function edgeVertices(key: string): [number, number] {
  const [a, b] = key.split(":").map(Number);
  return [a, b];
}

export function replaceObjPrimitiveVertex(mesh: ObjPrimitiveMesh, vertexIndex: number, patch: Partial<ObjPrimitiveVertex>): ObjPrimitiveMesh {
  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex, index) => index === vertexIndex ? { ...vertex, ...patch } : vertex),
  };
}

export function setObjPrimitiveEdgeSharp(mesh: ObjPrimitiveMesh, key: string, sharp: boolean): ObjPrimitiveMesh {
  const current = new Set(mesh.sharpEdges);
  if (sharp) current.add(key);
  else current.delete(key);
  return { ...mesh, sharpEdges: [...current].sort() };
}

function faceHasSharpEdgeAtVertex(mesh: ObjPrimitiveMesh, face: ObjPrimitiveFace, sourceIndex: number) {
  for (let index = 0; index < face.vertices.length; index += 1) {
    const a = face.vertices[index];
    const b = face.vertices[(index + 1) % face.vertices.length];
    if ((a === sourceIndex || b === sourceIndex) && mesh.sharpEdges.includes(edgeKey(a, b))) return true;
  }
  return false;
}

function parseObjFaceIndex(token: string, vertexCount: number) {
  const raw = Number(token.split("/")[0]);
  if (!Number.isInteger(raw) || raw === 0) throw new Error(`Invalid OBJ face index: ${token}`);
  const index = raw > 0 ? raw - 1 : vertexCount + raw;
  if (index < 0 || index >= vertexCount) throw new Error(`OBJ face index out of range: ${token}`);
  return index;
}

function sanitizePrimitiveId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "") || defaultObjPrimitiveId;
}

function rgbToHex(r: number, g: number, b: number): ColorHex {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function toHexByte(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0");
}

function hexToRgbUnit(color: ColorHex): [number, number, number] {
  const match = color.match(/^#?([0-9a-f]{6})$/i);
  const hex = match?.[1] ?? "ffffff";
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function formatObjNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}
