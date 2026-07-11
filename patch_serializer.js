const fs = require('fs');

const path = './lib/webgpu/serializer.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace FLOATS_PER_TRIANGLE and add BVH constant
content = content.replace(
  'export const FLOATS_PER_TRIANGLE = 20;',
  `export const FLOATS_PER_TRIANGLE = 20;

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
}`
);

// Replace serializeTriangles
const oldSerializeTriangles = content.match(/export function serializeTriangles[\s\S]*?return data;\n}/)[0];

const newSerializeTriangles = `export function serializeTriangles(scene: THREE.Scene): { triangleData: Float32Array, bvhData: Float32Array } {
  scene.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && isTriangleTraceable(obj.geometry)) {
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
}`;

content = content.replace(oldSerializeTriangles, newSerializeTriangles);

fs.writeFileSync(path, content);
console.log("Patched serializer");
