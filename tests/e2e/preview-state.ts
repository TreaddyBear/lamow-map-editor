import type { Page } from "@playwright/test";

/** Inspect the actual Babylon scene through its existing module, not a mock or UI counter. */
export async function previewState(page: Page) {
  return page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /\/@babylonjs_core\.js/.test(name));
    if (!url) throw new Error("Babylon module was not loaded.");
    const { EngineStore } = await import(url);
    const engine = EngineStore.Instances.find((engine: any) => engine.getRenderingCanvas()?.dataset.testid === "vegetation-preview-board");
    const scene = engine?.scenes[0];
    if (!scene) throw new Error("Vegetation preview scene was not found.");
    const hash = (values: number[]) => {
      let h = 2166136261;
      for (const value of values) h = Math.imul(h ^ Math.round(value * 1e7), 16777619);
      return h >>> 0;
    };
    const camera = scene.cameras[0];
    return {
      engineCount: EngineStore.Instances.length, cameras: scene.cameras.map((c: any) => [c.alpha, c.beta, c.radius, ...c.target.asArray()]),
      camera: [camera.alpha, camera.beta, camera.radius, ...camera.target.asArray()],
      frames: scene.getFrameId(),
      meshIds: scene.meshes.map((mesh: any) => mesh.uniqueId),
      materialIds: scene.materials.map((material: any) => material.uniqueId),
      meshes: scene.meshes.filter((mesh: any) => mesh.name.startsWith("species-")).map((mesh: any) => ({
        id: mesh.uniqueId, name: mesh.name, layerMask: mesh.layerMask, geometry: hash(mesh.getVerticesData("position") ?? []),
        colors: hash(mesh.getVerticesData("color") ?? []), vertices: mesh.getTotalVertices(),
        material: mesh.material?.diffuseColor.toHexString(), instances: mesh.thinInstanceCount,
      })),
      grass: scene.meshes.filter((mesh: any) => mesh.name.startsWith("vegetation-slats-")).map((mesh: any) => ({
        name: mesh.name, geometry: hash(mesh.getVerticesData("position") ?? []), uniforms: mesh.material?._colors3, colors: hash(mesh.getVerticesData("color") ?? []), instances: mesh.thinInstanceCount,
      })),
    };
  });
}
