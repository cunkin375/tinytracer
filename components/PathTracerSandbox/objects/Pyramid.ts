import * as THREE from "three";

export interface PyramidConfig {
  position: readonly [number, number, number];
  radius: number;
  height: number;
  color: number;
  roughness?: number;
  metalness?: number;
  name?: string;
}

const DEFAULT_ROUGHNESS = 0.2;
const DEFAULT_METALNESS = 0.6;
const PYRAMID_SIDES = 4;

/** A selectable, shadow-casting 4-sided pyramid mesh used in the sandbox scene. */
export class Pyramid extends THREE.Mesh<
  THREE.ConeGeometry,
  THREE.MeshStandardMaterial
> {
  constructor({
    position,
    radius,
    height,
    color,
    roughness = DEFAULT_ROUGHNESS,
    metalness = DEFAULT_METALNESS,
    name,
  }: PyramidConfig) {
    super(
      new THREE.ConeGeometry(radius, height, PYRAMID_SIDES),
      new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );

    // A bare 4-sided cone has an edge facing forward; rotate so a flat
    // face does instead, matching the classic pyramid silhouette.
    this.rotation.y = Math.PI / 4;
    this.position.set(...position);
    this.castShadow = true;
    this.receiveShadow = true;
    if (name) this.name = name;
  }
}
