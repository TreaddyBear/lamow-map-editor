import { Matrix, Mesh, MeshBuilder, VertexData } from "@babylonjs/core";
import type { Material, Scene } from "@babylonjs/core";

export type FieldFlowerVariant = "blue" | "white" | "yellow" | "red";

export type FieldFlowerInput = {
  x: number;
  z: number;
  variant: FieldFlowerVariant;
  yaw: number;
  height: number;
  petalCount: number;
  seed?: number;
};

export type FieldFlowerMaterials = {
  petal: Record<FieldFlowerVariant, Material>;
  stem: Material;
  center: Material;
};

type PlantInstance = {
  x: number;
  z: number;
  mowed: boolean;
  visible: boolean;
  variant: FieldFlowerVariant;
  petalStart: number;
  petalCount: number;
  index: number;
};

const VARIANTS: FieldFlowerVariant[] = ["blue", "white", "yellow", "red"];

function hashFlowerSeed(flower: FieldFlowerInput, index: number): number {
  if (flower.seed !== undefined) {
    return flower.seed >>> 0;
  }

  let h = (0x4c614d6f ^ index) >>> 0;
  h = (Math.imul(h, 16777619) ^ Math.round(flower.x * 1000)) >>> 0;
  h = (Math.imul(h, 16777619) ^ Math.round(flower.z * 1000)) >>> 0;
  h = (Math.imul(h, 16777619) ^ Math.round(flower.yaw * 100000)) >>> 0;
  h = (Math.imul(h, 16777619) ^ Math.round(flower.height * 100000)) >>> 0;
  h = (Math.imul(h, 16777619) ^ flower.petalCount) >>> 0;
  return h;
}

function makeRng(seed: number): () => number {
  let state = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Builds one low-poly petal as a hyperbolic-paraboloid (saddle): the long side
// edges curl up while the base and tip droop. Local space: length along +Z,
// width along X, pinched at both ends. Unit-sized.
function buildSaddlePetal(scene: Scene): Mesh {
  const widthCols = 3;
  const lengthRows = 4;
  const baseHalfWidth = 0.5;
  const cupAmount = 0.28;
  const curlAmount = 0.2;

  const widthProfile = (v: number) => Math.max(0.04, Math.sin(Math.PI * Math.min(1, 0.12 + (v * 0.92))));

  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < lengthRows; row += 1) {
    const v = row / (lengthRows - 1);
    const halfWidth = baseHalfWidth * widthProfile(v);

    for (let col = 0; col < widthCols; col += 1) {
      const ux = ((col / (widthCols - 1)) * 2) - 1;
      const x = ux * halfWidth;
      const z = v;
      const y = (cupAmount * ux * ux * widthProfile(v)) - (curlAmount * ((2 * v) - 1) ** 2);
      positions.push(x, y, z);
    }
  }

  for (let row = 0; row < lengthRows - 1; row += 1) {
    for (let col = 0; col < widthCols - 1; col += 1) {
      const a = (row * widthCols) + col;
      const b = a + 1;
      const c = a + widthCols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const mesh = new Mesh("field-flower-petal", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.applyToMesh(mesh);
  return mesh;
}

export type FieldFlowerLayer = ReturnType<typeof createFieldFlowerLayer>;

export function createFieldFlowerLayer(input: {
  scene: Scene;
  materials: FieldFlowerMaterials;
  groundHeightAt: (x: number, z: number) => number;
}) {
  const { scene, materials, groundHeightAt } = input;

  const petalMesh = {} as Record<FieldFlowerVariant, Mesh>;
  for (const variant of VARIANTS) {
    const mesh = buildSaddlePetal(scene);
    mesh.material = materials.petal[variant];
    mesh.isPickable = false;
    petalMesh[variant] = mesh;
  }

  const stem = MeshBuilder.CreateCylinder("field-flower-stem", { height: 1, diameter: 1, tessellation: 5 }, scene);
  stem.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  stem.material = materials.stem;
  stem.isPickable = false;

  const center = MeshBuilder.CreateSphere("field-flower-center", { diameter: 1, segments: 6 }, scene);
  center.material = materials.center;
  center.isPickable = false;

  const allMeshes = [...VARIANTS.map((v) => petalMesh[v]), stem, center];
  for (const mesh of allMeshes) {
    mesh.setEnabled(false);
  }

  const petalBuffer = {} as Record<FieldFlowerVariant, Float32Array>;
  const petalSourceBuffer = {} as Record<FieldFlowerVariant, Float32Array>;
  for (const variant of VARIANTS) {
    petalBuffer[variant] = new Float32Array(0);
    petalSourceBuffer[variant] = new Float32Array(0);
  }
  let stemBuffer = new Float32Array(0);
  let stemSourceBuffer = new Float32Array(0);
  let centerBuffer = new Float32Array(0);
  let centerSourceBuffer = new Float32Array(0);
  let plants: PlantInstance[] = [];

  const showInstances = (mesh: Mesh, buffer: Float32Array) => {
    if (buffer.length === 0) {
      mesh.thinInstanceCount = 0;
      mesh.setEnabled(false);
      return;
    }

    mesh.setEnabled(true);
    mesh.thinInstanceSetBuffer("matrix", buffer, 16, false);
    mesh.thinInstanceRefreshBoundingInfo();
  };

  const collapseInstance = (buffer: Float32Array, instanceIndex: number) => {
    buffer.fill(0, instanceIndex * 16, (instanceIndex * 16) + 16);
  };

  const restoreInstance = (target: Float32Array, source: Float32Array, instanceIndex: number) => {
    target.set(source.subarray(instanceIndex * 16, (instanceIndex * 16) + 16), instanceIndex * 16);
  };

  const setPlantVisibleInBuffers = (plant: PlantInstance, visible: boolean) => {
    const variantBuffer = petalBuffer[plant.variant];
    const variantSourceBuffer = petalSourceBuffer[plant.variant];

    for (let k = 0; k < plant.petalCount; k += 1) {
      const index = plant.petalStart + k;
      if (visible && !plant.mowed) {
        restoreInstance(variantBuffer, variantSourceBuffer, index);
      } else {
        collapseInstance(variantBuffer, index);
      }
    }

    if (visible && !plant.mowed) {
      restoreInstance(stemBuffer, stemSourceBuffer, plant.index);
      restoreInstance(centerBuffer, centerSourceBuffer, plant.index);
    } else {
      collapseInstance(stemBuffer, plant.index);
      collapseInstance(centerBuffer, plant.index);
    }
  };

  const setFlowers = (flowers: FieldFlowerInput[]) => {
    plants = [];

    const petalTotals = {} as Record<FieldFlowerVariant, number>;
    for (const variant of VARIANTS) {
      petalTotals[variant] = 0;
    }
    for (const flower of flowers) {
      petalTotals[flower.variant] += flower.petalCount;
    }

    for (const variant of VARIANTS) {
      petalBuffer[variant] = new Float32Array(petalTotals[variant] * 16);
      petalSourceBuffer[variant] = new Float32Array(petalTotals[variant] * 16);
    }
    stemBuffer = new Float32Array(flowers.length * 16);
    stemSourceBuffer = new Float32Array(flowers.length * 16);
    centerBuffer = new Float32Array(flowers.length * 16);
    centerSourceBuffer = new Float32Array(flowers.length * 16);

    const petalCursor = {} as Record<FieldFlowerVariant, number>;
    for (const variant of VARIANTS) {
      petalCursor[variant] = 0;
    }

    for (let i = 0; i < flowers.length; i += 1) {
      const flower = flowers[i]!;
      const random = makeRng(hashFlowerSeed(flower, i));
      const groundY = groundHeightAt(flower.x, flower.z);
      const world = Matrix.Translation(flower.x, groundY, flower.z);
      const facing = Matrix.RotationY(flower.yaw);
      const headLift = Matrix.Translation(0, flower.height, 0);

      const stemRadius = 0.012 + (random() * 0.006);
      const lean = Matrix.RotationX((random() - 0.5) * 0.16)
        .multiply(Matrix.RotationZ((random() - 0.5) * 0.16));
      Matrix.Scaling(stemRadius, flower.height, stemRadius).multiply(lean).multiply(world)
        .copyToArray(stemBuffer, i * 16);

      const centerSize = 0.04 + (random() * 0.02);
      Matrix.Scaling(centerSize, centerSize * 0.55, centerSize)
        .multiply(headLift)
        .multiply(facing)
        .multiply(world)
        .copyToArray(centerBuffer, i * 16);

      const petalLength = 0.085 + (random() * 0.03);
      const petalWidth = 0.05 + (random() * 0.022);
      const radialOffset = 0.014 + (random() * 0.006);
      const openTilt = 0.55 + (random() * 0.32);
      const variantBuffer = petalBuffer[flower.variant];
      const petalStart = petalCursor[flower.variant];

      for (let p = 0; p < flower.petalCount; p += 1) {
        const theta = ((p / flower.petalCount) * Math.PI * 2) + ((random() - 0.5) * 0.12);
        const lengthScale = petalLength * (0.88 + (random() * 0.26));

        Matrix.Scaling(petalWidth, lengthScale, lengthScale)
          .multiply(Matrix.Translation(0, 0, radialOffset))
          .multiply(Matrix.RotationX(-openTilt))
          .multiply(Matrix.RotationY(theta))
          .multiply(headLift)
          .multiply(facing)
          .multiply(world)
          .copyToArray(variantBuffer, petalCursor[flower.variant] * 16);
        petalCursor[flower.variant] += 1;
      }

      plants.push({
        x: flower.x,
        z: flower.z,
        mowed: false,
        visible: true,
        variant: flower.variant,
        petalStart,
        petalCount: flower.petalCount,
        index: i,
      });
    }

    for (const variant of VARIANTS) {
      petalSourceBuffer[variant].set(petalBuffer[variant]);
    }
    stemSourceBuffer.set(stemBuffer);
    centerSourceBuffer.set(centerBuffer);

    for (const variant of VARIANTS) {
      showInstances(petalMesh[variant], petalBuffer[variant]);
    }
    showInstances(stem, stemBuffer);
    showInstances(center, centerBuffer);
  };

  return {
    setFlowers,

    updateMowedUnder(mowerX: number, mowerZ: number, radiusSquared: number) {
      if (plants.length === 0) {
        return;
      }

      const dirtyVariants = new Set<FieldFlowerVariant>();

      for (const plant of plants) {
        if (plant.mowed) {
          continue;
        }

        const dx = plant.x - mowerX;
        const dz = plant.z - mowerZ;

        if ((dx * dx) + (dz * dz) > radiusSquared) {
          continue;
        }

        plant.mowed = true;
        setPlantVisibleInBuffers(plant, false);
        dirtyVariants.add(plant.variant);
      }

      if (dirtyVariants.size > 0) {
        for (const variant of dirtyVariants) {
          petalMesh[variant].thinInstanceBufferUpdated("matrix");
        }
        stem.thinInstanceBufferUpdated("matrix");
        center.thinInstanceBufferUpdated("matrix");
      }
    },

    syncVisibility(mowerX: number, mowerZ: number, radiusSquared: number) {
      if (plants.length === 0) {
        return;
      }

      const dirtyVariants = new Set<FieldFlowerVariant>();
      let sharedChanged = false;

      for (const plant of plants) {
        if (plant.mowed) {
          continue;
        }

        const dx = plant.x - mowerX;
        const dz = plant.z - mowerZ;
        const visible = ((dx * dx) + (dz * dz)) <= radiusSquared;

        if (plant.visible === visible) {
          continue;
        }

        plant.visible = visible;
        setPlantVisibleInBuffers(plant, visible);
        dirtyVariants.add(plant.variant);
        sharedChanged = true;
      }

      for (const variant of dirtyVariants) {
        petalMesh[variant].thinInstanceBufferUpdated("matrix");
      }
      if (sharedChanged) {
        stem.thinInstanceBufferUpdated("matrix");
        center.thinInstanceBufferUpdated("matrix");
      }
    },

    dispose() {
      for (const mesh of allMeshes) {
        mesh.dispose();
      }
    },
  };
}
