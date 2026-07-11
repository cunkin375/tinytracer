const fs = require('fs');
const path = './lib/webgpu/compute.wgsl';
let content = fs.readFileSync(path, 'utf8');

// Add BVHNode struct
content = content.replace(
  'struct Triangle {',
  `struct BVHNode {
    aabb_min: vec3<f32>,
    left_first: u32,
    aabb_max: vec3<f32>,
    tri_count: u32,
}

struct Triangle {`
);

// Add binding for BVH nodes
content = content.replace(
  '@group(0) @binding(4) var<storage, read> spheres: array<Sphere>;',
  `@group(0) @binding(4) var<storage, read> spheres: array<Sphere>;
@group(0) @binding(5) var<storage, read> bvh_nodes: array<BVHNode>;`
);

// Add AABB intersection function
const aabbHit = `
fn hit_aabb(r: Ray, t_min: f32, t_max: f32, aabb_min: vec3<f32>, aabb_max: vec3<f32>) -> bool {
    var invD = 1.0 / r.direction;
    var t0s = (aabb_min - r.origin) * invD;
    var t1s = (aabb_max - r.origin) * invD;
    
    var tsmaller = min(t0s, t1s);
    var tbigger  = max(t0s, t1s);
    
    var tmin_calc = max(t_min, max(tsmaller.x, max(tsmaller.y, tsmaller.z)));
    var tmax_calc = min(t_max, min(tbigger.x, min(tbigger.y, tbigger.z)));
    
    return tmin_calc <= tmax_calc;
}
`;

content = content.replace(
  '// Analytic ray/sphere intersection with a smooth (per-point) normal.',
  aabbHit + '\n// Analytic ray/sphere intersection with a smooth (per-point) normal.'
);

// Replace Triangle Soup in hit_world with BVH traversal
const oldTriangleSoup = `    // Triangle soup (boxes, cones, …)
    for (var i = 0u; i < state.tri_count; i++) {
        var temp_rec: HitRecord;
        if hit_triangle(r, triangles[i], t_min, closest, &temp_rec) {
            hit_anything = true;
            closest = temp_rec.t;
            *rec = temp_rec;
        }
    }`;

const newBvhTraversal = `    // BVH Traversal for Triangles
    if (state.tri_count > 0u) {
        var stack: array<u32, 64>;
        var stack_ptr: u32 = 0u;
        stack[stack_ptr] = 0u; // Push root
        stack_ptr += 1u;
        
        while (stack_ptr > 0u) {
            stack_ptr -= 1u;
            let node_idx = stack[stack_ptr];
            let node = bvh_nodes[node_idx];
            
            if hit_aabb(r, t_min, closest, node.aabb_min, node.aabb_max) {
                if (node.tri_count > 0u) {
                    // Leaf node
                    for (var i = 0u; i < node.tri_count; i++) {
                        var temp_rec: HitRecord;
                        if hit_triangle(r, triangles[node.left_first + i], t_min, closest, &temp_rec) {
                            hit_anything = true;
                            closest = temp_rec.t;
                            *rec = temp_rec;
                        }
                    }
                } else {
                    // Interior node - push children
                    // Order doesn't strictly matter for correctness, but pushing both works
                    stack[stack_ptr] = node.left_first;
                    stack_ptr += 1u;
                    stack[stack_ptr] = node.left_first + 1u;
                    stack_ptr += 1u;
                }
            }
        }
    }`;

content = content.replace(oldTriangleSoup, newBvhTraversal);

fs.writeFileSync(path, content);
console.log("Patched compute.wgsl");
