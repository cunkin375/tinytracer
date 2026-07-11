export const SPHERE_CONFIGS = [
  { position: [-2, 0.7, 0] as const, radius: 0.7, color: 0x6366f1 },
  { position: [0, 1, 1.5] as const, radius: 1, color: 0xf472b6 },
  { position: [2.5, 0.5, -1] as const, radius: 0.5, color: 0x34d399 },
];

export const CUBE_CONFIGS = [
  { position: [-3, 0.5, -2.5] as const, size: 1, color: 0xdcb965 },
];

export const PYRAMID_CONFIGS = [
  {
    position: [3, 0.6, 2] as const,
    radius: 0.9,
    height: 1.2,
    color: 0xe0a3ac,
  },
];

export const ORTHO_FRUSTUM_SIZE = 8;

/** Initial tree count shown in the main app, and the tree-count slider's starting value. */
export const DEFAULT_TREE_COUNT = 15;
export const MAX_TREE_COUNT = 60;
