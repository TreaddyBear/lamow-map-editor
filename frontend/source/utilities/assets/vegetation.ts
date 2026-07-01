export type RangeF = { min: number; max: number };
export type RangeI = { min: number; max: number };
export type IdealVariation = { ideal: number; deviation: number };
export type CountVariation = { ideal: number; deviation: number };
export type ColorHex = `#${string}`;
export type ColorRgb = { space: "rgb"; r: number; g: number; b: number };
export type ColorHsl = { space: "hsl"; h: number; s: number; l: number };
export type VegetationColorValue = ColorHex | ColorRgb | ColorHsl;

export type VegetationVertexColor = {
  vertex: string;
  albedo: VegetationColorValue;
  emissive?: VegetationColorValue;
  emissiveStrength?: number;
};

export type VegetationSurfaceColor = {
  mode: "flat" | "verticalGradient" | "uvGradient" | "vertex";
  albedo?: VegetationColorValue;
  rootAlbedo?: VegetationColorValue;
  tipAlbedo?: VegetationColorValue;
  vertexColors?: VegetationVertexColor[];
};

export type VegetationMaterialDefinition = {
  baseColor: ColorHex;
  emissiveColor?: ColorHex;
  emissiveStrength?: number;
  surface?: VegetationSurfaceColor;
  roughness?: number;
  alpha?: number;
};

export type FieldFlowerShapeDefinition = {
  type: "fieldFlower";
  petalSurface: "saddle";
  petalCount: RangeI;
  petalLength: RangeF;
  petalWidth: RangeF;
  cup: RangeF;
  curl: RangeF;
  stemHeight: RangeF;
  stemRadius: RangeF;
  centerRadius: RangeF;
};

export type TallFlowerHeadDefinition =
  | { type: "tulipCup"; diameter: RangeF; heightScale: RangeF; petalCount?: RangeI }
  | { type: "dandelionYellow"; centerDiameter: RangeF; rayCount: RangeI; rayLength: RangeF }
  | { type: "dandelionSeedPuff"; coreRadius: RangeF; fuzzCount: RangeI; puffRadius: RangeF; fuzzSize: RangeF };

export type TallFlowerLeafDefinition = {
  count: RangeI;
  length: RangeF;
  width: RangeF;
  curl?: RangeF;
};

export type VegetationShapeDefinition =
  | FieldFlowerShapeDefinition
  | {
    type: "tallFlower";
    stemHeight: RangeF;
    stemRadius: RangeF;
    stemLean: RangeF;
    head: TallFlowerHeadDefinition;
    leaves?: TallFlowerLeafDefinition;
  }
  | {
    type: "cloverCluster";
    leafCount: RangeI;
    leafRadius: RangeF;
    clusterRadius: RangeF;
    lift: RangeF;
  }
  | {
    type: "billboard";
    width: RangeF;
    height: RangeF;
    pivot: "base" | "center";
  }
  | {
    type: "importedMesh";
    assetId: string;
  };

export type VegetationSpeciesDefinition = {
  id: string;
  displayName: string;
  category: "fieldFlower" | "tallFlower" | "groundcover" | "shrub" | "tree" | "decorative";
  generator: "monolithicPlant";
  constructionRecipe?: VegetationGrowthRecipe;
  materials: Record<string, VegetationMaterialDefinition>;
  parts: [{
    id: string;
    kind: "monolith" | "stem" | "leaf" | "bud" | "petalCluster" | "groundMat";
    materialId: string;
    shape: VegetationShapeDefinition;
  }];
  instanceRanges: {
    yaw: RangeF;
    scale: RangeF;
  };
  lod: {
    nearGeometry: "procedural" | "importedMesh";
    farRepresentation: "none" | "grassSlatTint" | "coloredSlats" | "billboard";
    farColor?: ColorHex;
    farStrength?: number;
    maxRenderDistance?: number;
  };
  interaction?: {
    protectedMistake?: boolean;
    mowBehavior?: "collapse" | "cutStem" | "releaseHead" | "releaseSeeds" | "releasePetals";
    shotBehavior?: "none" | "sameAsMow" | "protectedDamage";
    headBehavior?: "none" | "tulipCrush" | "dandelionSeedRelease" | "dandelionYellowPetalPop";
  };
};

export type GrowthPhraseBase = {
  id: string;
  label: string;
};

export type ContinuePhrase = GrowthPhraseBase & {
  type: "continue";
  distance: IdealVariation;
  radiusStart?: IdealVariation;
  radiusEnd?: IdealVariation;
  bend?: IdealVariation;
  formAlongPath?: "none" | "stemSkin" | "blade";
};

export type ForkPhrase = GrowthPhraseBase & {
  type: "fork";
  count: CountVariation;
  layout: "radial" | "spiral" | "mirrored" | "cluster" | "sameAxis";
  spreadDegrees: IdealVariation;
  radius: IdealVariation;
  continuation: GrowthPhrase[];
};

export type BranchPhrase = GrowthPhraseBase & {
  type: "branch";
  count: CountVariation;
  layout: "alongPath" | "radial" | "alternating" | "tip" | "fromForm";
  sideBiasDegrees?: IdealVariation;
  offshoot: GrowthPhrase[];
};

export type SteerPhrase = GrowthPhraseBase & {
  type: "steer";
  yawDegrees?: IdealVariation;
  pitchDegrees?: IdealVariation;
  rollDegrees?: IdealVariation;
  scale?: IdealVariation;
};

export type FormPhrase = GrowthPhraseBase & {
  type: "form";
  primitive: "stemSkin" | "saddlePetal" | "centerDisc" | "leafBlade" | "quadSlat" | "seedFuzz" | "importedMesh";
  materialId: string;
  length?: IdealVariation;
  width?: IdealVariation;
  cup?: IdealVariation;
  curl?: IdealVariation;
  vertexAlbedo?: VegetationVertexColor[];
};

export type ColorPhrase = GrowthPhraseBase & {
  type: "color";
  materialId: string;
};

export type ChoosePhrase = GrowthPhraseBase & {
  type: "choose";
  options: { weight: number; phrase: GrowthPhrase[] }[];
};

export type GrowthPhrase = ContinuePhrase | ForkPhrase | BranchPhrase | SteerPhrase | FormPhrase | ColorPhrase | ChoosePhrase;

export type VegetationGrowthRecipe = {
  languageVersion: 1;
  root: GrowthPhrase[];
};

export type VegetationSpeciesAssetFile = {
  assetVersion: 1;
  kind: "vegetationSpecies";
  species: VegetationSpeciesDefinition;
  editor?: {
    tags?: string[];
    notes?: string;
    preview?: {
      cameraDistance?: number;
      populationSeed?: number;
      populationCount?: number;
      groundPatchMeters?: number;
    };
    grassLod?: GrassLodSettings;
  };
};

export type GrassLodSettings = {
  density: number;
  preview50Color: ColorHex;
  preview100Color: ColorHex;
  topColorA: ColorHex;
  topColorB: ColorHex;
  midColor: ColorHex;
  bottomColor: ColorHex;
};

export const defaultGrassLodSettings: GrassLodSettings = {
  density: 0.5,
  preview50Color: "#6fa855",
  preview100Color: "#3f7c32",
  topColorA: "#92c35c",
  topColorB: "#6da04b",
  midColor: "#4f8239",
  bottomColor: "#23491f",
};

export const defaultVegetationAsset: VegetationSpeciesAssetFile = {
  assetVersion: 1,
  kind: "vegetationSpecies",
  species: {
    id: "flowerBlue",
    displayName: "Blue Field Flower",
    category: "fieldFlower",
    generator: "monolithicPlant",
    constructionRecipe: {
      languageVersion: 1,
      root: [
        {
          id: "grow-stem",
          type: "continue",
          label: "Grow stem",
          distance: { ideal: 0.14, deviation: 0.04 },
          radiusStart: { ideal: 0.016, deviation: 0.003 },
          radiusEnd: { ideal: 0.009, deviation: 0.002 },
          bend: { ideal: 0.08, deviation: 0.04 },
          formAlongPath: "stemSkin",
        },
        {
          id: "petal-whorl",
          type: "fork",
          label: "Fork petals around the head",
          count: { ideal: 7, deviation: 1 },
          layout: "radial",
          spreadDegrees: { ideal: 360, deviation: 0 },
          radius: { ideal: 0.045, deviation: 0.008 },
          continuation: [
            {
              id: "petal-tilt",
              type: "steer",
              label: "Tilt petal outward",
              pitchDegrees: { ideal: -42, deviation: 7 },
            },
            {
              id: "petal-form",
              type: "form",
              label: "Form saddle petal",
              primitive: "saddlePetal",
              materialId: "petal",
              length: { ideal: 0.095, deviation: 0.02 },
              width: { ideal: 0.055, deviation: 0.016 },
              cup: { ideal: 0.27, deviation: 0.07 },
              curl: { ideal: 0.21, deviation: 0.07 },
            },
          ],
        },
        {
          id: "flower-center",
          type: "form",
          label: "Form center disc",
          primitive: "centerDisc",
          materialId: "center",
          width: { ideal: 0.05, deviation: 0.01 },
        },
      ],
    },
    materials: {
      petal: { baseColor: "#a8c7fa", emissiveColor: "#4d5f7a", roughness: 0.9 },
      center: { baseColor: "#f0c75e", roughness: 0.85 },
      stem: { baseColor: "#486d2f", roughness: 0.95 },
    },
    parts: [{
      id: "flower",
      kind: "monolith",
      materialId: "petal",
      shape: {
        type: "fieldFlower",
        petalSurface: "saddle",
        petalCount: { min: 5, max: 8 },
        petalLength: { min: 0.075, max: 0.115 },
        petalWidth: { min: 0.04, max: 0.072 },
        cup: { min: 0.2, max: 0.34 },
        curl: { min: 0.14, max: 0.28 },
        stemHeight: { min: 0.1, max: 0.18 },
        stemRadius: { min: 0.012, max: 0.018 },
        centerRadius: { min: 0.04, max: 0.06 },
      },
    }],
    instanceRanges: {
      yaw: { min: 0, max: Math.PI * 2 },
      scale: { min: 0.9, max: 1.12 },
    },
    lod: {
      nearGeometry: "procedural",
      farRepresentation: "none",
      farColor: "#a8c7fa",
      farStrength: 0.4,
    },
  },
  editor: {
    tags: ["field-flower", "blue"],
    preview: { populationSeed: 1, populationCount: 80, groundPatchMeters: 4 },
    grassLod: defaultGrassLodSettings,
  },
};

export function parseVegetationAsset(text: string): VegetationSpeciesAssetFile {
  const value = JSON.parse(text) as Partial<VegetationSpeciesAssetFile>;
  if (value.assetVersion !== 1 || value.kind !== "vegetationSpecies" || !value.species) {
    throw new Error("Expected a vegetationSpecies assetVersion 1 file.");
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value.species.id)) {
    throw new Error("Species id must match ^[A-Za-z][A-Za-z0-9_-]*$.");
  }
  if (!value.species.parts?.length || !Object.keys(value.species.materials ?? {}).length) {
    throw new Error("Species must include at least one part and one material.");
  }
  const species = ensureSpeciesRecipe(migrateLegacySpecies(value.species));
  validateSpecies(species);
  return {
    ...value,
    species,
    editor: {
      ...value.editor,
      grassLod: { ...defaultGrassLodSettings, ...value.editor?.grassLod },
    },
  } as VegetationSpeciesAssetFile;
}

function migrateLegacySpecies(species: VegetationSpeciesDefinition): VegetationSpeciesDefinition {
  return {
    ...species,
    parts: species.parts.map((part) => {
      const shape = part.shape as VegetationShapeDefinition | (Omit<FieldFlowerShapeDefinition, "type" | "petalSurface"> & { type: "saddleFlower" });
      if (shape.type !== "saddleFlower") return part;
      const { type: _legacyType, ...rest } = shape;
      return { ...part, shape: { ...rest, type: "fieldFlower", petalSurface: "saddle" } };
    }) as VegetationSpeciesDefinition["parts"],
  };
}

function ensureSpeciesRecipe(species: VegetationSpeciesDefinition): VegetationSpeciesDefinition {
  if (species.constructionRecipe) return species;
  const shape = species.parts[0]?.shape;
  if (shape?.type !== "fieldFlower") return species;
  return { ...species, constructionRecipe: fieldFlowerShapeToRecipe(shape, species.parts[0].materialId) };
}

export function fieldFlowerShapeToRecipe(shape: FieldFlowerShapeDefinition, petalMaterialId: string): VegetationGrowthRecipe {
  return {
    languageVersion: 1,
    root: [
      {
        id: "grow-stem",
        type: "continue",
        label: "Grow stem",
        distance: rangeToIdeal(shape.stemHeight),
        radiusStart: rangeToIdeal(shape.stemRadius),
        radiusEnd: { ideal: rangeToIdeal(shape.stemRadius).ideal * 0.62, deviation: rangeToIdeal(shape.stemRadius).deviation * 0.62 },
        bend: { ideal: 0.08, deviation: 0.04 },
        formAlongPath: "stemSkin",
      },
      {
        id: "petal-whorl",
        type: "fork",
        label: "Fork petals around the head",
        count: rangeToIdeal(shape.petalCount),
        layout: "radial",
        spreadDegrees: { ideal: 360, deviation: 0 },
        radius: rangeToIdeal(shape.centerRadius),
        continuation: [
          { id: "petal-tilt", type: "steer", label: "Tilt petal outward", pitchDegrees: { ideal: -42, deviation: 7 } },
          {
            id: "petal-form",
            type: "form",
            label: "Form saddle petal",
            primitive: "saddlePetal",
            materialId: petalMaterialId,
            length: rangeToIdeal(shape.petalLength),
            width: rangeToIdeal(shape.petalWidth),
            cup: rangeToIdeal(shape.cup),
            curl: rangeToIdeal(shape.curl),
          },
        ],
      },
      {
        id: "flower-center",
        type: "form",
        label: "Form center disc",
        primitive: "centerDisc",
        materialId: "center",
        width: rangeToIdeal(shape.centerRadius),
      },
    ],
  };
}

export function recipeToFieldFlowerShape(recipe: VegetationGrowthRecipe, fallback: FieldFlowerShapeDefinition): FieldFlowerShapeDefinition {
  const phrases = flattenPhrases(recipe.root);
  const stem = phrases.find((phrase): phrase is ContinuePhrase => phrase.type === "continue" && phrase.formAlongPath === "stemSkin");
  const fork = phrases.find((phrase): phrase is ForkPhrase => phrase.type === "fork" && flattenPhrases(phrase.continuation).some(isSaddlePetalForm));
  const petal = phrases.find(isSaddlePetalForm);
  const center = phrases.find((phrase): phrase is FormPhrase => phrase.type === "form" && phrase.primitive === "centerDisc");
  return {
    ...fallback,
    petalCount: fork ? idealToRangeI(fork.count) : fallback.petalCount,
    petalLength: petal?.length ? idealToRange(petal.length) : fallback.petalLength,
    petalWidth: petal?.width ? idealToRange(petal.width) : fallback.petalWidth,
    cup: petal?.cup ? idealToRange(petal.cup) : fallback.cup,
    curl: petal?.curl ? idealToRange(petal.curl) : fallback.curl,
    stemHeight: stem ? idealToRange(stem.distance) : fallback.stemHeight,
    stemRadius: stem?.radiusStart ? idealToRange(stem.radiusStart) : fallback.stemRadius,
    centerRadius: center?.width ? idealToRange(center.width) : fallback.centerRadius,
  };
}

function isSaddlePetalForm(phrase: GrowthPhrase): phrase is FormPhrase {
  return phrase.type === "form" && phrase.primitive === "saddlePetal";
}

function validateSpecies(species: VegetationSpeciesDefinition) {
  for (const part of species.parts) {
    if (!species.materials[part.materialId]) {
      throw new Error(`Part "${part.id}" references missing material "${part.materialId}".`);
    }
    validateShape(part.shape);
  }
  if (species.lod.farStrength !== undefined && (species.lod.farStrength < 0 || species.lod.farStrength > 1)) {
    throw new Error("lod.farStrength must be between 0 and 1.");
  }
  if (species.lod.maxRenderDistance !== undefined && species.lod.maxRenderDistance <= 0) {
    throw new Error("lod.maxRenderDistance must be greater than 0.");
  }
  if (species.constructionRecipe) validateRecipe(species.constructionRecipe, species);
}

function validateRecipe(recipe: VegetationGrowthRecipe, species: VegetationSpeciesDefinition) {
  if (recipe.languageVersion !== 1) throw new Error("constructionRecipe.languageVersion must be 1.");
  for (const phrase of flattenPhrases(recipe.root)) {
    if (phrase.type === "form" || phrase.type === "color") {
      if (!species.materials[phrase.materialId]) throw new Error(`Recipe phrase "${phrase.id}" references missing material "${phrase.materialId}".`);
    }
    for (const value of collectPhraseVariations(phrase)) {
      if (!Number.isFinite(value.ideal) || !Number.isFinite(value.deviation)) throw new Error("Recipe ideal/deviation values must be finite.");
      if (value.deviation < 0) throw new Error("Recipe deviations must be zero or greater.");
    }
  }
}

function flattenPhrases(phrases: GrowthPhrase[]): GrowthPhrase[] {
  return phrases.flatMap((phrase) => {
    if (phrase.type === "fork") return [phrase, ...flattenPhrases(phrase.continuation)];
    if (phrase.type === "branch") return [phrase, ...flattenPhrases(phrase.offshoot)];
    if (phrase.type === "choose") return [phrase, ...phrase.options.flatMap((option) => flattenPhrases(option.phrase))];
    return [phrase];
  });
}

function collectPhraseVariations(phrase: GrowthPhrase): (IdealVariation | CountVariation)[] {
  if (phrase.type === "continue") return [phrase.distance, ...(phrase.radiusStart ? [phrase.radiusStart] : []), ...(phrase.radiusEnd ? [phrase.radiusEnd] : []), ...(phrase.bend ? [phrase.bend] : [])];
  if (phrase.type === "fork") return [phrase.count, phrase.spreadDegrees, phrase.radius];
  if (phrase.type === "branch") return [phrase.count, ...(phrase.sideBiasDegrees ? [phrase.sideBiasDegrees] : [])];
  if (phrase.type === "steer") return [...(phrase.yawDegrees ? [phrase.yawDegrees] : []), ...(phrase.pitchDegrees ? [phrase.pitchDegrees] : []), ...(phrase.rollDegrees ? [phrase.rollDegrees] : []), ...(phrase.scale ? [phrase.scale] : [])];
  if (phrase.type === "form") return [...(phrase.length ? [phrase.length] : []), ...(phrase.width ? [phrase.width] : []), ...(phrase.cup ? [phrase.cup] : []), ...(phrase.curl ? [phrase.curl] : [])];
  return [];
}

function validateShape(shape: VegetationShapeDefinition) {
  for (const range of collectRanges(shape)) validateRange(range);
  for (const range of collectIntegerRanges(shape)) validateIntegerRange(range);
}

function validateRange(range: RangeF | RangeI) {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) throw new Error("Every range must be finite.");
  if (range.min > range.max) throw new Error("Range min must be less than or equal to max.");
}

function validateIntegerRange(range: RangeI) {
  validateRange(range);
  if (!Number.isInteger(range.min) || !Number.isInteger(range.max)) throw new Error("Integer ranges must contain whole numbers.");
}

function collectRanges(shape: VegetationShapeDefinition): (RangeF | RangeI)[] {
  if (shape.type === "fieldFlower") return [shape.petalCount, shape.petalLength, shape.petalWidth, shape.cup, shape.curl, shape.stemHeight, shape.stemRadius, shape.centerRadius];
  if (shape.type === "cloverCluster") return [shape.leafCount, shape.leafRadius, shape.clusterRadius, shape.lift];
  if (shape.type === "billboard") return [shape.width, shape.height];
  if (shape.type === "tallFlower") return [shape.stemHeight, shape.stemRadius, shape.stemLean, ...collectTallHeadRanges(shape.head), ...(shape.leaves ? [shape.leaves.count, shape.leaves.length, shape.leaves.width, ...(shape.leaves.curl ? [shape.leaves.curl] : [])] : [])];
  return [];
}

function collectIntegerRanges(shape: VegetationShapeDefinition): RangeI[] {
  if (shape.type === "fieldFlower") return [shape.petalCount];
  if (shape.type === "cloverCluster") return [shape.leafCount];
  if (shape.type === "tallFlower") return [...collectTallHeadIntegerRanges(shape.head), ...(shape.leaves ? [shape.leaves.count] : [])];
  return [];
}

function collectTallHeadRanges(head: TallFlowerHeadDefinition): (RangeF | RangeI)[] {
  if (head.type === "tulipCup") return [head.diameter, head.heightScale, ...(head.petalCount ? [head.petalCount] : [])];
  if (head.type === "dandelionYellow") return [head.centerDiameter, head.rayCount, head.rayLength];
  return [head.coreRadius, head.fuzzCount, head.puffRadius, head.fuzzSize];
}

function collectTallHeadIntegerRanges(head: TallFlowerHeadDefinition): RangeI[] {
  if (head.type === "tulipCup") return head.petalCount ? [head.petalCount] : [];
  if (head.type === "dandelionYellow") return [head.rayCount];
  return [head.fuzzCount];
}

function rangeToIdeal(range: RangeF | RangeI): IdealVariation {
  return { ideal: (range.min + range.max) / 2, deviation: Math.abs(range.max - range.min) / 2 };
}

function idealToRange(value: IdealVariation): RangeF {
  return { min: value.ideal - value.deviation, max: value.ideal + value.deviation };
}

function idealToRangeI(value: CountVariation): RangeI {
  return { min: Math.max(0, Math.round(value.ideal - value.deviation)), max: Math.max(0, Math.round(value.ideal + value.deviation)) };
}
