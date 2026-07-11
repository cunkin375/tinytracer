import * as THREE from "three";

export interface CubeConfig {
  position: readonly [number, number, number];
  size: number;
  color: number;
  roughness?: number;
  metalness?: number;
  name?: string;
}

const DEFAULT_ROUGHNESS = 0.2;
const DEFAULT_METALNESS = 0.6;

/** A selectable, shadow-casting cube mesh used in the sandbox scene. */
export class Cube extends THREE.Mesh<
  THREE.BoxGeometry,
  THREE.MeshStandardMaterial
> {
  constructor({
    position,
    size,
    color,
    roughness = DEFAULT_ROUGHNESS,
    metalness = DEFAULT_METALNESS,
    name,
  }: CubeConfig) {
    super(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );

    this.position.set(...position);
    this.castShadow = true;
    this.receiveShadow = true;
    if (name) this.name = name;
  }
}
