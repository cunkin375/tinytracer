import * as THREE from "three";
import { getCachedGeometry, preloadGeometry } from "./geometryLoader";

export interface PyramidConfig {
  position: readonly [number, number, number];
  radius: number;
  height: number;
  color: number;
  /** Non-uniform per-axis stretch on top of radius/height. */
  scale?: readonly [number, number, number];
  roughness?: number;
  metalness?: number;
  name?: string;
}

const PYRAMID_OBJ_URL = "/models/pyramid.obj";

const DEFAULT_ROUGHNESS = 0.2;
const DEFAULT_METALNESS = 0.6;

/** A selectable, shadow-casting 4-sided pyramid mesh used in the sandbox scene. */
export class Pyramid extends THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshStandardMaterial
> {
  /** Must resolve before any `new Pyramid(...)` call (see useThreeScene.ts). */
  static preload(): Promise<THREE.BufferGeometry> {
    return preloadGeometry(PYRAMID_OBJ_URL);
  }

  constructor({
    position,
    radius,
    height,
    color,
    scale = [1, 1, 1],
    roughness = DEFAULT_ROUGHNESS,
    metalness = DEFAULT_METALNESS,
    name,
  }: PyramidConfig) {
    super(
      getCachedGeometry(PYRAMID_OBJ_URL),
      new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );

    // The shared geometry is a unit (radius 1, height 1) 4-sided cone; radius
    // maps to X/Z, height to Y, plus any extra per-axis stretch on top.
    this.scale.set(radius * scale[0], height * scale[1], radius * scale[2]);

    // A bare 4-sided cone has an edge facing forward; rotate so a flat
    // face does instead, matching the classic pyramid silhouette. This stays
    // a runtime rotation (not baked into the .obj) so it composes correctly
    // with the scale above regardless of order.
    this.rotation.y = Math.PI / 4;
    this.position.set(...position);
    this.castShadow = true;
    this.receiveShadow = true;
    if (name) this.name = name;
  }
}
