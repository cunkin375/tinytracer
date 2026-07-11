import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

/**
 * Sphere/Cube/Pyramid geometry lives in static unit-size .obj files under
 * `public/models/` rather than being constructed procedurally, so the shape
 * editor's exported models and the app's own primitives go through the same
 * loading path. Each URL is fetched once and its geometry cached — classes
 * that need it call `preloadGeometry` up front (see useThreeScene.ts) and
 * then read the cached copy synchronously from their constructor.
 */

const cache = new Map<string, THREE.BufferGeometry>();
const pending = new Map<string, Promise<THREE.BufferGeometry>>();
const loader = new OBJLoader();

function firstMeshGeometry(group: THREE.Group, url: string): THREE.BufferGeometry {
  const mesh = group.children.find(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh
  );
  if (!mesh) throw new Error(`No mesh found while loading geometry from "${url}"`);
  return mesh.geometry;
}

/** Fetches and caches the geometry at `url`. Safe to call more than once. */
export async function preloadGeometry(url: string): Promise<THREE.BufferGeometry> {
  const cached = cache.get(url);
  if (cached) return cached;

  const inFlight = pending.get(url);
  if (inFlight) return inFlight;

  const promise = loader.loadAsync(url).then((group) => {
    const geometry = firstMeshGeometry(group, url);
    cache.set(url, geometry);
    pending.delete(url);
    return geometry;
  });
  pending.set(url, promise);
  return promise;
}

/** Synchronously reads a geometry already warmed by `preloadGeometry`. */
export function getCachedGeometry(url: string): THREE.BufferGeometry {
  const geometry = cache.get(url);
  if (!geometry) {
    throw new Error(
      `Geometry "${url}" was not preloaded — call preloadGeometry() before constructing this shape.`
    );
  }
  return geometry;
}
