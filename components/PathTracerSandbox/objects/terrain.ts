import * as THREE from "three";

const raycaster = new THREE.Raycaster();
const DROP_HEIGHT = 500; // start well above anything plausible in the scene

/**
 * Repositions `object` so its bounding-box bottom rests exactly on top of
 * `terrain`'s surface at its current X/Z — used to keep scene objects from
 * clipping into (or floating above) a sculpted terrain. No-op if `object`
 * isn't above any part of `terrain`.
 */
export function snapObjectToTerrain(
  object: THREE.Object3D,
  terrain: THREE.Object3D
): void {
  const worldPos = new THREE.Vector3();
  object.getWorldPosition(worldPos);

  raycaster.set(
    new THREE.Vector3(worldPos.x, DROP_HEIGHT, worldPos.z),
    new THREE.Vector3(0, -1, 0)
  );
  const hits = raycaster.intersectObject(terrain, true);
  if (hits.length === 0) return;

  const box = new THREE.Box3().setFromObject(object);
  const bottomOffset = object.position.y - box.min.y;
  object.position.y = hits[0].point.y + bottomOffset;
}

/**
 * Repositions `skybox` so its own bottom (from its geometry's bounding box)
 * sits level with `terrain`'s lowest point, so the skybox never floats
 * above or clips beneath the ground once a terrain is loaded.
 */
export function alignSkyboxToTerrain(
  skybox: THREE.Mesh,
  terrain: THREE.Object3D
): void {
  const terrainBounds = new THREE.Box3().setFromObject(terrain);

  skybox.geometry.computeBoundingBox();
  const skyboxBounds = skybox.geometry.boundingBox;
  if (!skyboxBounds) return;
  const halfHeight = (skyboxBounds.max.y - skyboxBounds.min.y) / 2;

  skybox.position.y = terrainBounds.min.y + halfHeight;
}
