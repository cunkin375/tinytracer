import * as THREE from "three";
import { getCachedGeometry, preloadGeometry } from "./geometryLoader";

export interface SphereConfig {
  position: readonly [number, number, number];
  radius: number;
  color: number;
  /** Non-uniform per-axis stretch on top of `radius` (e.g. `[1, 1.4, 1]` for an egg). */
  scale?: readonly [number, number, number];
  roughness?: number;
  metalness?: number;
  name?: string;
  /** Path-tracer material: 0 = Lambertian, 1 = Metal, 2 = Dielectric. */
  materialType?: number;
  /** Index of refraction, used by the dielectric material. */
  ior?: number;
}

const SPHERE_OBJ_URL = "/models/sphere.obj";

const DEFAULT_ROUGHNESS = 0.2;
const DEFAULT_METALNESS = 0.6;

// Path-tracer material defaults injected into userData so the serializer can
// read them. materialType/ior follow the spec defaults; roughness deliberately
// mirrors the visual material's roughness (rather than the spec's literal 0.5)
// so the WebGL preview and the traced result stay coherent.
const DEFAULT_MATERIAL_TYPE = 0; // Lambertian
const DEFAULT_IOR = 1.5; // Standard glass

/** A selectable, shadow-casting sphere mesh used in the sandbox scene. */
export class Sphere extends THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshStandardMaterial
> {
  /** Must resolve before any `new Sphere(...)` call (see useThreeScene.ts). */
  static preload(): Promise<THREE.BufferGeometry> {
    return preloadGeometry(SPHERE_OBJ_URL);
  }

  constructor({
    position,
    radius,
    color,
    scale = [1, 1, 1],
    roughness = DEFAULT_ROUGHNESS,
    metalness = DEFAULT_METALNESS,
    name,
    materialType = DEFAULT_MATERIAL_TYPE,
    ior = DEFAULT_IOR,
  }: SphereConfig) {
    super(
      getCachedGeometry(SPHERE_OBJ_URL),
      new THREE.MeshStandardMaterial({ color, roughness, metalness })
    );

    // The shared geometry is a unit (radius 1) sphere; radius and any extra
    // per-axis stretch are both expressed as mesh scale.
    this.scale.set(radius * scale[0], radius * scale[1], radius * scale[2]);
    this.position.set(...position);
    this.castShadow = true;
    this.receiveShadow = true;
    if (name) this.name = name;

    // Consumed by the path tracer (see lib/webgpu/serializer.ts). The shared
    // geometry is no longer a THREE.SphereGeometry, so `isSphere`/`radius`
    // are how the serializer identifies and sizes a traced sphere — it uses
    // this base `radius`, not the (possibly non-uniform) mesh scale, so an
    // egg-shaped sphere still traces as a uniform sphere of `radius`.
    this.userData.isSphere = true;
    this.userData.radius = radius;
    this.userData.materialType = materialType;
    this.userData.roughness = roughness;
    this.userData.ior = ior;
  }
}
