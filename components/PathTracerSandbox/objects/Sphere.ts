import * as THREE from "three";

export interface SphereConfig {
  position: readonly [number, number, number];
  radius: number;
  color: number;
  roughness?: number;
  metalness?: number;
  name?: string;
  /** Path-tracer material: 0 = Lambertian, 1 = Metal, 2 = Dielectric. */
  materialType?: number;
  /** Index of refraction, used by the dielectric material. */
  ior?: number;
}

const DEFAULT_ROUGHNESS = 0.2;
const DEFAULT_METALNESS = 0.6;
const SPHERE_SEGMENTS = 64;

// Path-tracer material defaults injected into userData so the serializer can
// read them. materialType/ior follow the spec defaults; roughness deliberately
// mirrors the visual material's roughness (rather than the spec's literal 0.5)
// so the WebGL preview and the traced result stay coherent.
const DEFAULT_MATERIAL_TYPE = 0; // Lambertian
const DEFAULT_IOR = 1.5; // Standard glass

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
    materialType = DEFAULT_MATERIAL_TYPE,
    ior = DEFAULT_IOR,
  }: SphereConfig) {
    super(
      new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
      new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );

    this.position.set(...position);
    this.castShadow = true;
    this.receiveShadow = true;
    if (name) this.name = name;

    // Material properties consumed by the path tracer (see lib/webgpu/serializer.ts).
    this.userData.materialType = materialType;
    this.userData.roughness = roughness;
    this.userData.ior = ior;
  }
}
