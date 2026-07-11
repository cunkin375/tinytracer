import * as THREE from "three";

export interface SphereConfig {
  position: readonly [number, number, number];
  radius: number;
  color: number;
  roughness?: number;
  metalness?: number;
  name?: string;
}

const DEFAULT_ROUGHNESS = 0.2;
const DEFAULT_METALNESS = 0.6;
const SPHERE_SEGMENTS = 64;

/** A selectable, shadow-casting sphere mesh used in the sandbox scene. */
export class Sphere extends THREE.Mesh<
  THREE.SphereGeometry,
  THREE.MeshStandardMaterial
> {
  constructor({
    position,
    radius,
    color,
    roughness = DEFAULT_ROUGHNESS,
    metalness = DEFAULT_METALNESS,
    name,
  }: SphereConfig) {
    super(
      new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
      new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );

    this.position.set(...position);
    this.castShadow = true;
    this.receiveShadow = true;
    if (name) this.name = name;
  }
}
