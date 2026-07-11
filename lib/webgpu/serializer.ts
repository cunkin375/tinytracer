import * as THREE from "three";

// ============================================================================
// TinyTracer – Scene Serializer
//
// Pure functions that extract Three.js scene data into tightly packed
// Float32Array buffers matching the WGSL struct layouts.
//
// The path tracer mixes two primitive kinds:
//   • Spheres are kept analytic — packed as (center, radius) so the shader can
//     intersect them exactly and shade them with smooth per-point normals.
//   • Every other supported mesh (boxes, cones) is tessellated into a flat
//     world-space triangle soup: each vertex is pushed through the mesh's world
//     matrix (so translation, rotation, and non-uniform scale are all baked in)
//     and packed with per-triangle material data.
// ============================================================================

// ── Constants ───────────────────────────────────────────────────────────────

/** Number of f32 values per Sphere struct (3 × vec4 = 12 floats = 48 bytes). */
export const FLOATS_PER_SPHERE = 12;

/**
 * Number of f32 values per Triangle struct. Layout (std430, 80 bytes):
 * ```
 *  0  1  2  3   4  5  6  7   8  9 10 11   12 13 14 15   16  17  18 19
 * v0x v0y v0z _ v1x v1y v1z _ v2x v2y v2z _  ar ag ab rgh  mT ior _  _
 * ```
 */
export const FLOATS_PER_TRIANGLE = 20;

/** Number of f32 values per BVHNode struct (8 floats = 32 bytes). */
export const FLOATS_PER_BVH_NODE = 8;

interface BVHPrimitive {
  v0: THREE.Vector3;
  v1: THREE.Vector3;
  v2: THREE.Vector3;
  centroid: THREE.Vector3;
  mat: ReturnType<typeof readMaterial>;
}

interface BVHNode {
  aabbMin: THREE.Vector3;
  aabbMax: THREE.Vector3;
  leftFirst: number; // Left child index OR first triangle index
  triCount: number;  // 0 for interior, > 0 for leaf
}

// Default material values when a mesh's userData doesn't specify them.
const DEFAULT_MATERIAL_TYPE = 0; // Lambertian
const DEFAULT_ROUGHNESS = 0.5;
const DEFAULT_IOR = 1.5; // Standard glass

/** Number of f32 values in the Camera struct (4 × vec4 = 16 floats = 64 bytes). */
const CAMERA_STRIDE = 16;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Reusable vector to avoid per-frame allocations. */
const _worldPos = new THREE.Vector3();

/**
 * True for meshes the path tracer treats as an analytic sphere (the only
 * geometry supported by the path tracer in its current scope). Sphere
 * geometry loads from a static .obj file (see objects/geometryLoader.ts)
 * rather than being a THREE.SphereGeometry, so Sphere.ts tags its mesh with
 * `userData.isSphere` — the geometry.type check is kept only as a fallback.
 */
function isTracedSphere(obj: THREE.Object3D): obj is THREE.Mesh {
  return (
    obj instanceof THREE.Mesh &&
    obj.userData.isSphere === true
  );
}

/**
 * Geometry types fed into the triangle soup. Spheres are handled analytically
 * (see {@link serializeSpheres}); everything else in the scene (ground plane,
 * transform gizmo, grid, lights) is skipped so it never leaks into the image.
 */
function isTriangleTraceable(mesh: THREE.Mesh): boolean {
  return mesh.userData.isTraceable === true;
}

/**
 * Extract the per-mesh material fields the tracer cares about, preferring
 * `userData` overrides, then the visual material, then the spec defaults.
 */
function readMaterial(mesh: THREE.Mesh): {
  r: number;
  g: number;
  b: number;
  roughness: number;
  matType: number;
  ior: number;
} {
  const material = mesh.material as THREE.MeshStandardMaterial;
  const color = material.color;
  const roughness: number =
    mesh.userData.roughness ?? material.roughness ?? DEFAULT_ROUGHNESS;
  const matType: number = mesh.userData.materialType ?? DEFAULT_MATERIAL_TYPE;
  const ior: number = mesh.userData.ior ?? DEFAULT_IOR;
  return { r: color.r, g: color.g, b: color.b, roughness, matType, ior };
}

// ── Sphere Serialization ──────────────────────────────────────────────────────

/** Reusable scratch to avoid per-mesh allocations. */
const _worldScale = new THREE.Vector3();

/**
 * Walk the scene graph, find every sphere mesh, and pack it into a flat
 * `Float32Array` matching the WGSL `Sphere` struct:
 *
 * ```
 *  float index:   0   1   2   3    4   5   6   7    8     9    10  11
 *  meaning:      cx  cy  cz   r   ar  ag  ab  rough matT  ior  _   _
 * ```
 *
 * The world radius bakes in the mesh's (uniform) scale so resizing a sphere in
 * the editor is reflected in the traced image. Non-sphere meshes are skipped.
 */
export function serializeSpheres(scene: THREE.Scene): Float32Array {
  scene.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    if (isTracedSphere(obj)) {
      meshes.push(obj);
    }
  });

  const data = new Float32Array(meshes.length * FLOATS_PER_SPHERE);

  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const offset = i * FLOATS_PER_SPHERE;

    const mat = readMaterial(mesh);

    // ── center_radius (vec4) ──────────────────────────────────────────
    mesh.getWorldPosition(_worldPos);
    mesh.getWorldScale(_worldScale);

    // Sphere.ts stores its base radius in userData (mesh.scale may carry an
    // additional non-uniform "egg" stretch on top, which an analytic sphere
    // intersection can't represent). geometry.parameters is a fallback for
    // an actual THREE.SphereGeometry, should one ever end up in the scene.
    const baseRadius =
      mesh.userData.radius ??
      (mesh.geometry as THREE.SphereGeometry).parameters?.radius ??
      1;

    // Analytic spheres stay spheres, so collapse a (possibly non-uniform)
    // scale to a single factor via its largest axis.
    const radius =
      baseRadius * Math.max(_worldScale.x, _worldScale.y, _worldScale.z);

    data[offset + 0] = _worldPos.x;
    data[offset + 1] = _worldPos.y;
    data[offset + 2] = _worldPos.z;
    data[offset + 3] = radius;

    // ── albedo_roughness (vec4) ───────────────────────────────────────
    data[offset + 4] = mat.r;
    data[offset + 5] = mat.g;
    data[offset + 6] = mat.b;
    data[offset + 7] = mat.roughness;

    // ── mat_data (vec4) ──────────────────────────────────────────────
    data[offset + 8] = mat.matType;
    data[offset + 9] = mat.ior;
    data[offset + 10] = 0; // pad
    data[offset + 11] = 0; // pad
  }

  return data;
}

// ── Triangle Serialization ────────────────────────────────────────────────────

/** Reusable scratch to avoid per-vertex allocations. */
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * Walk the scene graph and pack every triangle-traceable mesh (boxes, cones)
 * into a flat world-space triangle buffer laid out to match the WGSL
 * `Triangle` struct.
 *
 * Each vertex is transformed by the mesh's world matrix, so any translate /
 * rotate / (non-uniform) scale applied in the editor is captured — a sheared
 * cube becomes a genuine parallelepiped, and so on. (Spheres are handled
 * analytically by {@link serializeSpheres} and are skipped here.)
 */
export function serializeTriangles(scene: THREE.Scene): { triangleData: Float32Array, bvhData: Float32Array } {
  scene.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && isTriangleTraceable(obj)) {
      meshes.push(obj);
    }
  });

  // 1. Extract all primitives
  const primitives: BVHPrimitive[] = [];
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const mat = readMaterial(mesh);
    const world = mesh.matrixWorld;

    const position = geometry.attributes.position as THREE.BufferAttribute;
    const index = geometry.index;
    const triCount = (index ? index.count : position.count) / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3 + 0) : t * 3 + 0;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      const v0 = new THREE.Vector3().fromBufferAttribute(position, i0).applyMatrix4(world);
      const v1 = new THREE.Vector3().fromBufferAttribute(position, i1).applyMatrix4(world);
      const v2 = new THREE.Vector3().fromBufferAttribute(position, i2).applyMatrix4(world);
      
      const centroid = new THREE.Vector3().add(v0).add(v1).add(v2).multiplyScalar(1 / 3);

      primitives.push({ v0, v1, v2, centroid, mat });
    }
  }

  // Handle empty scene
  if (primitives.length === 0) {
    const bvhData = new Float32Array(FLOATS_PER_BVH_NODE); // Dummy root node
    bvhData[0] = 0; bvhData[1] = 0; bvhData[2] = 0; // min
    bvhData[3] = 0; // leftFirst (stored as float here because it's 0, safe)
    bvhData[4] = 0; bvhData[5] = 0; bvhData[6] = 0; // max
    bvhData[7] = 0; // triCount
    return { triangleData: new Float32Array(0), bvhData };
  }

  // 2. Build BVH
  const nodes: BVHNode[] = [];
  let rootNodeIdx = 0;
  let nodesUsed = 1;
  
  // Pre-allocate node 0
  nodes.push({
    aabbMin: new THREE.Vector3(),
    aabbMax: new THREE.Vector3(),
    leftFirst: 0,
    triCount: 0
  });

  function updateNodeBounds(nodeIdx: number, firstTri: number, triCount: number) {
    const node = nodes[nodeIdx];
    node.aabbMin.set(Infinity, Infinity, Infinity);
    node.aabbMax.set(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < triCount; i++) {
      const p = primitives[firstTri + i];
      node.aabbMin.min(p.v0).min(p.v1).min(p.v2);
      node.aabbMax.max(p.v0).max(p.v1).max(p.v2);
    }
  }

  function subdivide(nodeIdx: number, firstTri: number, triCount: number) {
    const node = nodes[nodeIdx];
    
    // Stop if few triangles
    if (triCount <= 4) {
      node.leftFirst = firstTri;
      node.triCount = triCount;
      return;
    }

    // Find longest axis of centroids
    const centroidMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const centroidMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < triCount; i++) {
      const c = primitives[firstTri + i].centroid;
      centroidMin.min(c);
      centroidMax.max(c);
    }

    const extent = centroidMax.clone().sub(centroidMin);
    let axis = 0;
    if (extent.y > extent.x) axis = 1;
    if (extent.z > extent.toArray()[axis]) axis = 2;

    const splitPos = centroidMin.toArray()[axis] + extent.toArray()[axis] * 0.5;

    // In-place partition
    let i = firstTri;
    let j = firstTri + triCount - 1;
    while (i <= j) {
      if (primitives[i].centroid.toArray()[axis] < splitPos) {
        i++;
      } else {
        const temp = primitives[i];
        primitives[i] = primitives[j];
        primitives[j] = temp;
        j--;
      }
    }

    // If one side is empty, just make a leaf node
    const leftCount = i - firstTri;
    if (leftCount === 0 || leftCount === triCount) {
      node.leftFirst = firstTri;
      node.triCount = triCount;
      return;
    }

    // Create children
    const leftChildIdx = nodesUsed++;
    const rightChildIdx = nodesUsed++;
    
    nodes.push({ aabbMin: new THREE.Vector3(), aabbMax: new THREE.Vector3(), leftFirst: 0, triCount: 0 });
    nodes.push({ aabbMin: new THREE.Vector3(), aabbMax: new THREE.Vector3(), leftFirst: 0, triCount: 0 });

    node.leftFirst = leftChildIdx;
    node.triCount = 0; // 0 means it's an interior node

    updateNodeBounds(leftChildIdx, firstTri, leftCount);
    updateNodeBounds(rightChildIdx, i, triCount - leftCount);

    subdivide(leftChildIdx, firstTri, leftCount);
    subdivide(rightChildIdx, i, triCount - leftCount);
  }

  updateNodeBounds(rootNodeIdx, 0, primitives.length);
  subdivide(rootNodeIdx, 0, primitives.length);

  // 3. Serialize Triangles
  const triangleData = new Float32Array(primitives.length * FLOATS_PER_TRIANGLE);
  let offset = 0;
  for (const p of primitives) {
    triangleData[offset + 0] = p.v0.x;
    triangleData[offset + 1] = p.v0.y;
    triangleData[offset + 2] = p.v0.z;
    triangleData[offset + 3] = 0;

    triangleData[offset + 4] = p.v1.x;
    triangleData[offset + 5] = p.v1.y;
    triangleData[offset + 6] = p.v1.z;
    triangleData[offset + 7] = 0;

    triangleData[offset + 8] = p.v2.x;
    triangleData[offset + 9] = p.v2.y;
    triangleData[offset + 10] = p.v2.z;
    triangleData[offset + 11] = 0;

    triangleData[offset + 12] = p.mat.r;
    triangleData[offset + 13] = p.mat.g;
    triangleData[offset + 14] = p.mat.b;
    triangleData[offset + 15] = p.mat.roughness;

    triangleData[offset + 16] = p.mat.matType;
    triangleData[offset + 17] = p.mat.ior;
    triangleData[offset + 18] = 0;
    triangleData[offset + 19] = 0;
    offset += FLOATS_PER_TRIANGLE;
  }

  // 4. Serialize BVH Nodes
  const bvhData = new Float32Array(nodes.length * FLOATS_PER_BVH_NODE);
  const bvhDataU32 = new Uint32Array(bvhData.buffer);
  let bvhOffset = 0;
  for (const node of nodes) {
    bvhData[bvhOffset + 0] = node.aabbMin.x;
    bvhData[bvhOffset + 1] = node.aabbMin.y;
    bvhData[bvhOffset + 2] = node.aabbMin.z;
    bvhDataU32[bvhOffset + 3] = node.leftFirst;
    
    bvhData[bvhOffset + 4] = node.aabbMax.x;
    bvhData[bvhOffset + 5] = node.aabbMax.y;
    bvhData[bvhOffset + 6] = node.aabbMax.z;
    bvhDataU32[bvhOffset + 7] = node.triCount;
    bvhOffset += FLOATS_PER_BVH_NODE;
  }

  return { triangleData, bvhData };
}

// ── Camera Serialization ────────────────────────────────────────────────────

/** Reusable vectors for camera basis extraction. */
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();

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
  data[8] = _up.x;
  data[9] = _up.y;
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
