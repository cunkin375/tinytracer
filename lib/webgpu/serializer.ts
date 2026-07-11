import * as THREE from "three";

// ============================================================================
// TinyTracer – Scene Serializer
//
// Pure functions that extract Three.js scene data into tightly packed
// Float32Array buffers matching the WGSL struct layouts. Zero side effects.
// ============================================================================

// ── Constants ───────────────────────────────────────────────────────────────

/** Number of f32 values per Sphere struct (3 × vec4 = 12 floats = 48 bytes). */
const SPHERE_STRIDE = 12;

/** Number of f32 values in the Camera struct (4 × vec4 = 16 floats = 64 bytes). */
const CAMERA_STRIDE = 16;

// Default material values when mesh.userData doesn't specify them
const DEFAULT_MATERIAL_TYPE = 0;   // Lambertian
const DEFAULT_ROUGHNESS     = 0.5;
const DEFAULT_IOR           = 1.5; // Standard glass

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Reusable vector to avoid per-frame allocations. */
const _worldPos = new THREE.Vector3();

/**
 * Returns true if the mesh uses a SphereGeometry (the only geometry
 * supported by the path tracer in its current scope).
 */
function isSphereGeometry(
  geometry: THREE.BufferGeometry
): geometry is THREE.SphereGeometry {
  return geometry.type === "SphereGeometry";
}

// ── Sphere Serialization ────────────────────────────────────────────────────

/**
 * Walk the scene graph, find every `THREE.Mesh` whose geometry is a
 * `SphereGeometry`, and pack them into a flat `Float32Array` that maps
 * 1-to-1 with the WGSL `Sphere` struct layout:
 *
 * ```
 *  float index:   0   1   2   3    4   5   6   7    8     9    10  11
 *  meaning:      cx  cy  cz   r   ar  ag  ab  rough matT  ior  _   _
 * ```
 *
 * Non-sphere meshes are silently skipped.
 */
export function serializeSpheres(scene: THREE.Scene): Float32Array {
  const sphereMeshes: THREE.Mesh[] = [];

  scene.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      isSphereGeometry(obj.geometry)
    ) {
      sphereMeshes.push(obj);
    }
  });

  const data = new Float32Array(sphereMeshes.length * SPHERE_STRIDE);

  for (let i = 0; i < sphereMeshes.length; i++) {
    const mesh = sphereMeshes[i];
    const offset = i * SPHERE_STRIDE;

    // ── center_radius (vec4) ──────────────────────────────────────────
    mesh.getWorldPosition(_worldPos);
    const radius = (mesh.geometry as THREE.SphereGeometry).parameters.radius;

    data[offset + 0] = _worldPos.x;
    data[offset + 1] = _worldPos.y;
    data[offset + 2] = _worldPos.z;
    data[offset + 3] = radius;

    // ── albedo_roughness (vec4) ───────────────────────────────────────
    const material = mesh.material as THREE.MeshStandardMaterial;
    const color = material.color;

    // Resolve roughness: prefer userData, fall back to material, then default
    const roughness: number =
      mesh.userData.roughness ??
      material.roughness ??
      DEFAULT_ROUGHNESS;

    data[offset + 4] = color.r;
    data[offset + 5] = color.g;
    data[offset + 6] = color.b;
    data[offset + 7] = roughness;

    // ── mat_data (vec4) ──────────────────────────────────────────────
    const materialType: number =
      mesh.userData.materialType ?? DEFAULT_MATERIAL_TYPE;
    const ior: number = mesh.userData.ior ?? DEFAULT_IOR;

    data[offset + 8]  = materialType;
    data[offset + 9]  = ior;
    data[offset + 10] = 0; // padding
    data[offset + 11] = 0; // padding
  }

  return data;
}

/**
 * Returns the number of spheres found in the last `serializeSpheres` call.
 * Useful for uploading `sphere_count` into the RenderState uniform.
 */
export function countSpheres(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      isSphereGeometry(obj.geometry)
    ) {
      count++;
    }
  });
  return count;
}

// ── Camera Serialization ────────────────────────────────────────────────────

/** Reusable vectors for camera basis extraction. */
const _forward = new THREE.Vector3();
const _up      = new THREE.Vector3();
const _right   = new THREE.Vector3();

/**
 * Extract the camera's spatial data into a 16-float `Float32Array` matching
 * the WGSL `Camera` struct layout:
 *
 * ```
 *  float index:   0   1   2   3    4   5   6   7    8   9  10  11   12  13  14  15
 *  meaning:      px  py  pz  pad  dx  dy  dz  pad  ux  uy  uz pad  rx  ry  rz  fov
 * ```
 *
 * Directions are extracted from the camera's world quaternion so they
 * correctly reflect any orbit-controls transformations.
 */
export function serializeCamera(
  camera: THREE.PerspectiveCamera
): Float32Array {
  const data = new Float32Array(CAMERA_STRIDE);

  // Ensure the camera's world matrix is up to date
  camera.updateMatrixWorld(true);

  // Position
  data[0] = camera.position.x;
  data[1] = camera.position.y;
  data[2] = camera.position.z;
  data[3] = 0; // pad1

  // Forward direction: camera looks down -Z in its local space
  _forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  data[4] = _forward.x;
  data[5] = _forward.y;
  data[6] = _forward.z;
  data[7] = 0; // pad2

  // Up vector: camera's local +Y
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  data[8]  = _up.x;
  data[9]  = _up.y;
  data[10] = _up.z;
  data[11] = 0; // pad3

  // Right vector: camera's local +X
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  data[12] = _right.x;
  data[13] = _right.y;
  data[14] = _right.z;

  // FOV in radians
  data[15] = camera.fov * (Math.PI / 180);

  return data;
}
