import * as THREE from "three";

const raycaster = new THREE.Raycaster();
const DROP_HEIGHT = 500; // start well above anything plausible in the scene

const UP = new THREE.Vector3(0, 1, 0);
const tiltQuat = new THREE.Quaternion();
const yawQuat = new THREE.Quaternion();

/**
 * Repositions `object` so its bounding-box bottom rests exactly on top of
 * `terrain`'s surface at its current X/Z, and tilts it to match the slope
 * of the terrain face underneath it — used to keep scene objects from
 * clipping into (or floating above, or standing upright on a hillside) a
 * sculpted terrain. No-op if `object` isn't above any part of `terrain`.
 *
 * The object's original facing direction (yaw around world Y, cached on
 * first snap) is preserved and re-applied on top of the slope tilt each
 * time, rather than reusing the object's *current* rotation — otherwise
 * repeated snaps (e.g. every drag-end) would compound the tilt further
 * each time instead of recomputing it fresh from the current face normal.
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

  const hit = hits[0];

  if (object.userData.baseYaw === undefined) {
    object.userData.baseYaw = object.rotation.y;
  }
  if (hit.face) {
    const worldNormal = hit.face.normal
      .clone()
      .transformDirection(hit.object.matrixWorld)
      .normalize();
    tiltQuat.setFromUnitVectors(UP, worldNormal);
    yawQuat.setFromAxisAngle(UP, object.userData.baseYaw as number);
    object.quaternion.copy(tiltQuat).multiply(yawQuat);
  }

  const box = new THREE.Box3().setFromObject(object);
  const bottomOffset = object.position.y - box.min.y;
  object.position.y = hit.point.y + bottomOffset;
}

const SKYBOX_HORIZONTAL_MARGIN = 4; // how far past the terrain's footprint the skybox extends
const SKYBOX_VERTICAL_MARGIN = 6; // multiplier on the terrain's own height range

/**
 * Resizes `skybox`'s geometry (in place, same shape type) so it comfortably
 * surrounds `terrain`'s footprint. Works for either a cylinder or a sphere
 * skybox, but the two need different vertical placement: a cylinder has a
 * flat open bottom rim, so planting that at the terrain's lowest point looks
 * right; a sphere's texture pinches at its poles, so doing the same to a
 * sphere would plant the camera right up against that pole (severe UV
 * distortion) — instead its center is kept near the terrain's own vertical
 * midpoint, keeping the camera near the equator where the texture is clean.
 */
export function fitSkyboxToTerrain(
  skybox: THREE.Mesh,
  terrain: THREE.Object3D
): void {
  const terrainBounds = new THREE.Box3().setFromObject(terrain);
  const size = new THREE.Vector3();
  terrainBounds.getSize(size);

  const radius = Math.max(size.x, size.z, 1) * SKYBOX_HORIZONTAL_MARGIN;
  const height = Math.max(size.y * SKYBOX_VERTICAL_MARGIN, radius);

  const isSphere = skybox.geometry.type === "SphereGeometry";
  const newGeometry = isSphere
    ? new THREE.SphereGeometry(radius, 60, 40)
    : new THREE.CylinderGeometry(radius, radius, height, 60, 1, true);

  skybox.geometry.dispose();
  skybox.geometry = newGeometry;
  skybox.position.y = isSphere
    ? (terrainBounds.min.y + terrainBounds.max.y) / 2
    : terrainBounds.min.y + height / 2;
}
