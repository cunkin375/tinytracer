import * as THREE from "three";
import { getCachedGeometry, preloadGeometry } from "./geometryLoader";

export interface CubeConfig {
  position: readonly [number, number, number];
  size: number;
  color: number;
  /** Non-uniform per-axis stretch on top of `size` (e.g. `[2, 1, 1]` for a rectangular box). */
  scale?: readonly [number, number, number];
  roughness?: number;
  metalness?: number;
  name?: string;
}

const CUBE_OBJ_URL = "/models/cube.obj";

const DEFAULT_ROUGHNESS = 0.2;
const DEFAULT_METALNESS = 0.6;

/** A selectable, shadow-casting cube mesh used in the sandbox scene. */
export class Cube extends THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshStandardMaterial
> {
  /** Must resolve before any `new Cube(...)` call (see useThreeScene.ts). */
  static preload(): Promise<THREE.BufferGeometry> {
    return preloadGeometry(CUBE_OBJ_URL);
  }

  constructor({
    position,
    size,
    color,
    scale = [1, 1, 1],
    roughness = DEFAULT_ROUGHNESS,
    metalness = DEFAULT_METALNESS,
    name,
  }: CubeConfig) {
    super(
      getCachedGeometry(CUBE_OBJ_URL),
      new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );

    // The shared geometry is a unit (1x1x1) cube; size and any extra
    // per-axis stretch are both expressed as mesh scale.
    this.scale.set(size * scale[0], size * scale[1], size * scale[2]);
    this.position.set(...position);
    this.castShadow = true;
    this.receiveShadow = true;
    this.userData.isTraceable = true;
    if (name) this.name = name;
  }
}
