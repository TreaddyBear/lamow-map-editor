import { Color3, Matrix, Mesh, StandardMaterial, VertexData, type Scene } from "@babylonjs/core";
import type { GrassLodSettings } from "../utilities/assets/vegetation";

/** Grass context in the 50% mixed patch; one instanced draw, rebuilt only for density/area. */
export function createCoverageGrass(scene: Scene) {
  const mesh = new Mesh("coverage-grass", scene); mesh.layerMask = 2; mesh.isPickable = false;
  const material = new StandardMaterial("coverage-grass-material", scene); material.diffuseColor = Color3.White(); material.specularColor = Color3.Black(); material.backFaceCulling = false; material.twoSidedLighting = true; mesh.material = material;
  const positions = [-0.006,0,0, 0.006,0,0, 0.003,0.1,0.02, 0,0,-0.006, 0,0,0.006, 0.02,0.12,0.003];
  const indices = [0,1,2,3,4,5], normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.normals = normals; data.indices = indices; data.colors = new Array(24).fill(1); data.applyToMesh(mesh, true);
  let key = "";
  return {
    update(grass: GrassLodSettings, width: number) {
      const colors: number[] = [];
      for (let i = 0; i < 6; i++) { const color = Color3.FromHexString(i % 3 === 2 ? grass.topColorA : grass.bottomColor); colors.push(color.r, color.g, color.b, 1); }
      mesh.updateVerticesData("color", colors);
      const next = width + ":" + grass.density; if (key === next) return;
      const count = Math.round(width * width * 150 * grass.density * 0.5), buffer = new Float32Array(count * 16);
      for (let i = 0; i < count; i++) {
        const x = (((i + 0.5) * 0.754877666) % 1 - 0.5) * width, z = (((i + 0.5) * 0.569840291) % 1 - 0.5) * width;
        Matrix.RotationY(i * 2.399963).multiply(Matrix.Translation(x, 0, z)).copyToArray(buffer, i * 16);
      }
      mesh.thinInstanceSetBuffer("matrix", buffer, 16, true); mesh.thinInstanceRefreshBoundingInfo(); key = next;
    },
    dispose() { mesh.dispose(); material.dispose(); },
  };
}
