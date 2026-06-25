import { clone, defaultPack, type MapPackV1 } from "./model";

export type SamplePack = {
  key: string;
  label: string;
  create: () => MapPackV1;
};

export const samplePacks: SamplePack[] = [
  {
    key: "default",
    label: "Front Lawn Demo",
    create: () => clone(defaultPack),
  },
  {
    key: "blank",
    label: "Blank Level",
    create: () => ({
      ...clone(defaultPack),
      levels: [
        {
          code: "blank",
          name: "Blank Level",
          parSeconds: 300,
          spawn: { position: [0, 0], headingDegrees: 0 },
          areas: [],
          roads: [],
          dirtPaths: [],
          fences: [],
          terrain: { heightFeatures: [] },
          objects: [],
          tags: [],
        },
      ],
    }),
  },
];
