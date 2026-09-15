import { Color3, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3, VertexData, type Scene } from "@babylonjs/core";
import { gameCutGrassShapes } from "./gameReference/cutGrass.js";
import { gameGrassSettings } from "./gameReference/settings.js";

export type CutPlacement = { x: number; z: number; y?: number; yaw?: number };
export type CutAppearance = { style: "stems" | "grass"; height: number; color?: string };

/** Shared cut geometry for editor and game hosts. Hosts own mowing/visibility state. */
export function createCutRemnants(scene: Scene, placements: CutPlacement[], appearance: CutAppearance, name = "cut-remnants") {
  if (!["stems", "grass"].includes(appearance.style) || !Number.isFinite(appearance.height) || appearance.height < 0.01 || appearance.height > 0.3 || (appearance.color !== undefined && !/^#[0-9a-f]{6}$/i.test(appearance.color)) || placements.some(p => ![p.x, p.y ?? 0, p.z, p.yaw ?? 0].every(Number.isFinite))) throw new Error("Invalid cut appearance or placement.");
  const material = new StandardMaterial(name + "-material", scene); material.specularColor = Color3.Black(); material.backFaceCulling = false;
  material.diffuseColor = appearance.color ? Color3.FromHexString(appearance.color) : appearance.style === "stems" ? Color3.FromHexString("#486d2f") : Color3.White();
  const groups = Array.from({ length: appearance.style === "grass" ? 4 : 1 }, (_, variant) => {
    const mesh = appearance.style === "stems" ? MeshBuilder.CreateCylinder(name, { height: 1, diameter: 1, tessellation: 5 }, scene) : new Mesh(name + "-" + variant, scene);
    if (appearance.style === "stems") mesh.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
    else {
      const shape = gameCutGrassShapes[variant], data = new VertexData(), normals: number[] = [], colors: number[] = [];
      VertexData.ComputeNormals(shape.positions, shape.indices, normals);
      const bottom = Color3.FromHexString(gameGrassSettings.cutGrassRootColor), top = Color3.FromHexString(variant % 2 ? gameGrassSettings.cutGrassTopColorA : gameGrassSettings.cutGrassTopColorB);
      for (let i = 1; i < shape.positions.length; i += 3) { const color = Color3.Lerp(bottom, top, Math.min(1, shape.positions[i])); colors.push(color.r, color.g, color.b, 1); }
      Object.assign(data, { positions: shape.positions, indices: shape.indices, normals, colors }); data.applyToMesh(mesh);
    }
    mesh.material = material; mesh.isPickable = false;
    const indices: number[] = [], matrices: Matrix[] = [];
    placements.forEach((p, i) => {
      // Same 1:2:1:1 silhouette mixture as the game, with stable assignment.
      const choice = [0, 1, 1, 2, 3][i % 5]; if (appearance.style === "grass" && choice !== variant) return;
      indices.push(i); matrices.push(Matrix.Compose(new Vector3(appearance.style === "stems" ? 0.024 : 1.15, appearance.height, appearance.style === "stems" ? 0.024 : 1.15), Quaternion.FromEulerAngles(0, p.yaw ?? i * 2.399963, 0), new Vector3(p.x, p.y ?? 0, p.z)));
    });
    const buffer = new Float32Array(matrices.length * 16); matrices.forEach((m, i) => m.copyToArray(buffer, i * 16));
    mesh.thinInstanceSetBuffer("matrix", buffer, 16, false); mesh.setEnabled(false);
    return { mesh, matrices, indices };
  });
  return {
    meshes: groups.map(group => group.mesh),
    setVisible(predicate: (index: number) => boolean) {
      for (const { mesh, matrices, indices } of groups) {
        mesh.thinInstanceCount = matrices.length; let count = 0;
        indices.forEach((index, i) => { if (predicate(index)) mesh.thinInstanceSetMatrixAt(count++, matrices[i], false); });
        mesh.thinInstanceCount = count; mesh.thinInstanceGetWorldMatrices().length = count; mesh.setEnabled(count > 0);
        if (count) { mesh.thinInstanceBufferUpdated("matrix"); mesh.thinInstanceRefreshBoundingInfo(); }
      }
    },
    dispose() { groups.forEach(group => group.mesh.dispose()); material.dispose(); },
  };
}
