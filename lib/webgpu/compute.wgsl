// ============================================================================
// TinyTracer – WebGPU Path Tracing Compute Shader
//
// Implements "Ray Tracing in a Weekend" on the GPU:
//   • PCG-hash RNG for per-pixel statistical independence
//   • Thin-lens camera with jittered sub-pixel sampling
//   • Analytic ray–sphere intersection (smooth spheres)
//   • Möller–Trumbore ray–triangle intersection (world-space triangle soup)
//   • Lambertian, Metal, and Dielectric materials
//   • Iterative path tracing with progressive accumulation
// ============================================================================

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_BOUNCES: u32 = 10u;
const PI: f32 = 3.14159265358979323846;
const EPSILON: f32 = 0.001;
const MAX_FLOAT: f32 = 3.402823466e+38;

// Material type IDs
const MAT_LAMBERTIAN: u32 = 0u;
const MAT_METAL:      u32 = 1u;
const MAT_DIELECTRIC:  u32 = 2u;
const MAT_EMISSIVE:    u32 = 3u;

// ── Data Structures ─────────────────────────────────────────────────────────

struct Camera {
    camera_pos:   vec3<f32>,
    pad1:         f32,
    camera_dir:   vec3<f32>,
    pad2:         f32,
    camera_up:    vec3<f32>,
    pad3:         f32,
    camera_right: vec3<f32>,
    fov:          f32,
}

struct Sphere {
    // xyz = center, w = radius
    center_radius:   vec4<f32>,
    // xyz = albedo,  w = roughness
    albedo_roughness: vec4<f32>,
    // x = material type, y = IOR, z/w = padding
    mat_data:        vec4<f32>,
}

struct BVHNode {
    aabb_min: vec3<f32>,
    left_first: u32,
    aabb_max: vec3<f32>,
    tri_count: u32,
}

struct Triangle {
    // World-space vertices (w components are padding).
    v0:              vec3<f32>,
    _p0:             f32,
    v1:              vec3<f32>,
    _p1:             f32,
    v2:              vec3<f32>,
    _p2:             f32,
    // xyz = albedo,  w = roughness
    albedo_roughness: vec4<f32>,
    // x = material type, y = IOR, z/w = padding
    mat_data:        vec4<f32>,
}

struct RenderState {
    frame_count:  u32,
    tri_count:    u32,
    sphere_count: u32,
    width:        u32,
    height:       u32,
}

struct SunLight {
    // Direction pointing *toward* the sun (the shadow-ray direction), normalized.
    direction: vec3<f32>,
    _pad:      f32,
    // Linear RGB colour of the sun.
    color:     vec3<f32>,
    // Irradiance scale (Three.js DirectionalLight.intensity).
    intensity: f32,
}

struct Ray {
    origin:    vec3<f32>,
    direction: vec3<f32>,
}

struct HitRecord {
    p:          vec3<f32>,
    normal:     vec3<f32>,
    t:          f32,
    front_face: bool,
    // Material data copied from the hit triangle
    albedo:     vec3<f32>,
    roughness:  f32,
    mat_type:   u32,
    ior:        f32,
}

// ── Bindings ────────────────────────────────────────────────────────────────

@group(0) @binding(0) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(0) @binding(2) var<storage, read> triangles: array<Triangle>;
@group(0) @binding(3) var<uniform> state: RenderState;
@group(0) @binding(4) var<storage, read> spheres: array<Sphere>;
@group(0) @binding(5) var<storage, read> bvh_nodes: array<BVHNode>;
@group(0) @binding(6) var skybox_texture: texture_2d<f32>;
@group(0) @binding(7) var skybox_sampler: sampler;
@group(0) @binding(8) var<uniform> sun: SunLight;

// ── RNG: PCG Hash ───────────────────────────────────────────────────────────

// PCG hash – fast, high-quality, statistically independent per pixel.
// Seed is derived from (pixel_id ^ frame_count) to decorrelate across frames.

var<private> rng_state: u32;

fn pcg_hash(input: u32) -> u32 {
    var s = input * 747796405u + 2891336453u;
    let word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (word >> 22u) ^ word;
}

fn init_rng(pixel: vec2<u32>, frame: u32) {
    let seed = pixel.x + pixel.y * state.width;
    rng_state = pcg_hash(seed ^ frame);
}

/// Returns a uniform random float in [0, 1).
fn rand() -> f32 {
    rng_state = pcg_hash(rng_state);
    return f32(rng_state) / 4294967296.0;
}

/// Random float in [min, max).
fn rand_range(min_val: f32, max_val: f32) -> f32 {
    return min_val + (max_val - min_val) * rand();
}

/// Random point inside the unit sphere (rejection sampling).
fn random_in_unit_sphere() -> vec3<f32> {
    // Rejection method: sample a cube, reject points outside the unit sphere
    for (var i = 0u; i < 32u; i++) {
        let p = vec3<f32>(
            rand_range(-1.0, 1.0),
            rand_range(-1.0, 1.0),
            rand_range(-1.0, 1.0),
        );
        if dot(p, p) < 1.0 {
            return p;
        }
    }
    // Fallback – extremely unlikely to reach here
    return vec3<f32>(0.0, 1.0, 0.0);
}

/// Random unit vector (used for Lambertian scatter).
fn random_unit_vector() -> vec3<f32> {
    return normalize(random_in_unit_sphere());
}

// ── Ray Helpers ─────────────────────────────────────────────────────────────

fn ray_at(r: Ray, t: f32) -> vec3<f32> {
    return r.origin + t * r.direction;
}

// ── Camera Ray Generation ───────────────────────────────────────────────────

fn get_ray(u: f32, v: f32) -> Ray {
    // Half-height of the viewport at unit distance from the camera
    let half_height = tan(camera.fov * 0.5);
    let aspect = f32(state.width) / f32(state.height);
    let half_width = aspect * half_height;

    // Map (u, v) from [0,1]×[0,1] to viewport coordinates
    let horizontal = camera.camera_right * (2.0 * half_width);
    let vertical   = camera.camera_up    * (2.0 * half_height);

    // Lower-left corner of the viewport (at unit distance)
    let lower_left = camera.camera_pos
        + camera.camera_dir          // forward at unit distance
        - horizontal * 0.5
        - vertical   * 0.5;

    let direction = normalize(
        lower_left + u * horizontal + v * vertical - camera.camera_pos
    );

    return Ray(camera.camera_pos, direction);
}

// ── Intersection ────────────────────────────────────────────────────────────

fn set_face_normal(r: Ray, outward_normal: vec3<f32>, rec: ptr<function, HitRecord>) {
    (*rec).front_face = dot(r.direction, outward_normal) < 0.0;
    if (*rec).front_face {
        (*rec).normal = outward_normal;
    } else {
        (*rec).normal = -outward_normal;
    }
}


fn hit_aabb(r: Ray, t_min: f32, t_max: f32, aabb_min: vec3<f32>, aabb_max: vec3<f32>) -> bool {
    var invD = vec3<f32>(1.0) / r.direction;
    var t0s = (aabb_min - r.origin) * invD;
    var t1s = (aabb_max - r.origin) * invD;
    
    var tsmaller = min(t0s, t1s);
    var tbigger  = max(t0s, t1s);
    
    var tmin_calc = max(t_min, max(tsmaller.x, max(tsmaller.y, tsmaller.z)));
    var tmax_calc = min(t_max, min(tbigger.x, min(tbigger.y, tbigger.z)));
    
    return tmin_calc <= tmax_calc;
}

// Analytic ray/sphere intersection with a smooth (per-point) normal.
fn hit_sphere(r: Ray, sphere: Sphere, t_min: f32, t_max: f32, rec: ptr<function, HitRecord>) -> bool {
    let center = sphere.center_radius.xyz;
    let radius = sphere.center_radius.w;

    let oc = center - r.origin;
    let a  = dot(r.direction, r.direction);
    let h  = dot(r.direction, oc);
    let c  = dot(oc, oc) - radius * radius;
    let discriminant = h * h - a * c;

    if discriminant < 0.0 {
        return false;
    }

    let sqrtd = sqrt(discriminant);

    // Find the nearest root in [t_min, t_max]
    var root = (h - sqrtd) / a;
    if root <= t_min || t_max <= root {
        root = (h + sqrtd) / a;
        if root <= t_min || t_max <= root {
            return false;
        }
    }

    (*rec).t = root;
    (*rec).p = ray_at(r, root);
    let outward_normal = ((*rec).p - center) / radius;
    set_face_normal(r, outward_normal, rec);

    // Copy material data from the sphere
    (*rec).albedo    = sphere.albedo_roughness.xyz;
    (*rec).roughness = sphere.albedo_roughness.w;
    (*rec).mat_type  = u32(sphere.mat_data.x);
    (*rec).ior       = sphere.mat_data.y;

    return true;
}

// Möller–Trumbore ray/triangle intersection with a flat (per-face) normal.
fn hit_triangle(r: Ray, tri: Triangle, t_min: f32, t_max: f32, rec: ptr<function, HitRecord>) -> bool {
    let e1 = tri.v1 - tri.v0;
    let e2 = tri.v2 - tri.v0;

    let pvec = cross(r.direction, e2);
    let det  = dot(e1, pvec);

    // Parallel ray (also skips degenerate triangles). Double-sided: no cull.
    // Uses a tiny determinant threshold so grazing hits aren't wrongly culled.
    if abs(det) < 1e-8 {
        return false;
    }
    let inv_det = 1.0 / det;

    let tvec = r.origin - tri.v0;
    let u = dot(tvec, pvec) * inv_det;
    if u < 0.0 || u > 1.0 {
        return false;
    }

    let qvec = cross(tvec, e1);
    let v = dot(r.direction, qvec) * inv_det;
    if v < 0.0 || u + v > 1.0 {
        return false;
    }

    let t = dot(e2, qvec) * inv_det;
    if t <= t_min || t_max <= t {
        return false;
    }

    (*rec).t = t;
    (*rec).p = ray_at(r, t);
    let outward_normal = normalize(cross(e1, e2));
    set_face_normal(r, outward_normal, rec);

    // Copy material data from the triangle
    (*rec).albedo    = tri.albedo_roughness.xyz;
    (*rec).roughness = tri.albedo_roughness.w;
    (*rec).mat_type  = u32(tri.mat_data.x);
    (*rec).ior       = tri.mat_data.y;

    return true;
}

/// Test every primitive (spheres + triangles), return the closest hit.
fn hit_world(r: Ray, t_min: f32, t_max: f32, rec: ptr<function, HitRecord>) -> bool {
    var hit_anything = false;
    var closest = t_max;

    // Analytic spheres
    for (var i = 0u; i < state.sphere_count; i++) {
        var temp_rec: HitRecord;
        if hit_sphere(r, spheres[i], t_min, closest, &temp_rec) {
            hit_anything = true;
            closest = temp_rec.t;
            *rec = temp_rec;
        }
    }

    // BVH Traversal for Triangles
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
    }

    return hit_anything;
}

/// Shadow query: return true as soon as *any* primitive is hit inside
/// (t_min, t_max). Cheaper than {@link hit_world} because it stops at the
/// first occluder instead of searching for the closest one. Used by the sun's
/// next event estimation — a directional light is infinitely far away, so any
/// intersection along the shadow ray blocks it.
fn is_occluded(r: Ray, t_min: f32, t_max: f32) -> bool {
    // Analytic spheres
    for (var i = 0u; i < state.sphere_count; i++) {
        var temp_rec: HitRecord;
        if hit_sphere(r, spheres[i], t_min, t_max, &temp_rec) {
            return true;
        }
    }

    // BVH traversal for triangles
    if (state.tri_count > 0u) {
        var stack: array<u32, 64>;
        var stack_ptr: u32 = 0u;
        stack[stack_ptr] = 0u; // Push root
        stack_ptr += 1u;

        while (stack_ptr > 0u) {
            stack_ptr -= 1u;
            let node_idx = stack[stack_ptr];
            let node = bvh_nodes[node_idx];

            if hit_aabb(r, t_min, t_max, node.aabb_min, node.aabb_max) {
                if (node.tri_count > 0u) {
                    // Leaf node
                    for (var i = 0u; i < node.tri_count; i++) {
                        var temp_rec: HitRecord;
                        if hit_triangle(r, triangles[node.left_first + i], t_min, t_max, &temp_rec) {
                            return true;
                        }
                    }
                } else {
                    // Interior node - push children
                    stack[stack_ptr] = node.left_first;
                    stack_ptr += 1u;
                    stack[stack_ptr] = node.left_first + 1u;
                    stack_ptr += 1u;
                }
            }
        }
    }

    return false;
}

// ── Material Scattering ─────────────────────────────────────────────────────

fn reflect(v: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
    return v - 2.0 * dot(v, n) * n;
}

fn refract(uv: vec3<f32>, n: vec3<f32>, etai_over_etat: f32) -> vec3<f32> {
    let cos_theta = min(dot(-uv, n), 1.0);
    let r_out_perp = etai_over_etat * (uv + cos_theta * n);
    let r_out_parallel = -sqrt(abs(1.0 - dot(r_out_perp, r_out_perp))) * n;
    return r_out_perp + r_out_parallel;
}

/// Schlick's approximation for reflectance.
fn reflectance(cosine: f32, ref_idx: f32) -> f32 {
    var r0 = (1.0 - ref_idx) / (1.0 + ref_idx);
    r0 = r0 * r0;
    return r0 + (1.0 - r0) * pow(1.0 - cosine, 5.0);
}

/// Returns true if the vector is near zero in all dimensions.
fn near_zero(v: vec3<f32>) -> bool {
    let s = 1e-8;
    return abs(v.x) < s && abs(v.y) < s && abs(v.z) < s;
}

struct ScatterResult {
    scattered:   Ray,
    attenuation: vec3<f32>,
    did_scatter: bool,
}

fn scatter(r: Ray, rec: HitRecord) -> ScatterResult {
    var result: ScatterResult;
    result.did_scatter = false;

    switch rec.mat_type {
        // ── Lambertian ──────────────────────────────────────────────────
        case 0u: {
            var scatter_dir = rec.normal + random_unit_vector();
            if near_zero(scatter_dir) {
                scatter_dir = rec.normal;
            }
            result.scattered   = Ray(rec.p, normalize(scatter_dir));
            result.attenuation = rec.albedo;
            result.did_scatter = true;
        }

        // ── Metal ───────────────────────────────────────────────────────
        case 1u: {
            let reflected = reflect(normalize(r.direction), rec.normal);
            let fuzzed = reflected + rec.roughness * random_in_unit_sphere();
            result.scattered   = Ray(rec.p, normalize(fuzzed));
            result.attenuation = rec.albedo;
            result.did_scatter = dot(result.scattered.direction, rec.normal) > 0.0;
        }

        // ── Dielectric ──────────────────────────────────────────────────
        case 2u: {
            result.attenuation = vec3<f32>(1.0, 1.0, 1.0);
            var ri: f32;
            if rec.front_face {
                ri = 1.0 / rec.ior;
            } else {
                ri = rec.ior;
            }

            let unit_dir = normalize(r.direction);
            let cos_theta = min(dot(-unit_dir, rec.normal), 1.0);
            let sin_theta = sqrt(1.0 - cos_theta * cos_theta);

            let cannot_refract = ri * sin_theta > 1.0;
            var direction: vec3<f32>;
            if cannot_refract || reflectance(cos_theta, ri) > rand() {
                direction = reflect(unit_dir, rec.normal);
            } else {
                direction = refract(unit_dir, rec.normal, ri);
            }

            result.scattered   = Ray(rec.p, normalize(direction));
            result.did_scatter = true;
        }

        default: {
            // Unknown material – absorb the ray
            result.did_scatter = false;
        }
    }

    return result;
}

// ── Sky Color ───────────────────────────────────────────────────────────────

fn sky_color(r: Ray) -> vec3<f32> {
    let d = normalize(r.direction);
    
    // Map direction to spherical coordinates (u, v)
    // U: Azimuthal angle. Matches Three.js SphereGeometry u mapping.
    let u = 0.5 + atan2(d.z, d.x) / (2.0 * PI);
    // Repeat horizontally 3 times as configured in Three.js
    let u_repeated = fract(u * 3.0);
    
    // V: Elevation angle. WebGPU textures have v=0 at the top, v=1 at the bottom.
    // Three.js v=1 is at the top (zenith). So WebGPU v = 1.0 - threejs_v
    let v = 0.5 - asin(d.y) / PI;
    
    return textureSampleLevel(skybox_texture, skybox_sampler, vec2<f32>(u_repeated, v), 0.0).rgb;
}

// ── Direct Lighting (Sun / Next Event Estimation) ─────────────────────────────

/// Direct contribution of the sun at a diffuse hit point, evaluated by casting
/// a single shadow ray toward the (infinitely distant) directional light.
/// Returns the outgoing radiance to add to the path, or zero if the sun is
/// off, below the surface's horizon, or occluded.
///
/// This is next event estimation: because the sun is a delta light it can't be
/// found by the randomly scattered bounce ray, so we sample it explicitly here.
/// Only the Lambertian BRDF (albedo / π) is handled — specular/dielectric
/// materials have a delta BRDF that a directional light almost never satisfies.
fn sun_direct_light(rec: HitRecord) -> vec3<f32> {
    if sun.intensity <= 0.0 {
        return vec3<f32>(0.0);
    }

    let to_sun = normalize(sun.direction);
    let cos_theta = dot(rec.normal, to_sun);
    if cos_theta <= 0.0 {
        // Sun is below the surface's horizon — no direct light.
        return vec3<f32>(0.0);
    }

    // Offset the origin along the normal to avoid shadow acne (self-shadowing
    // caused by the point sitting fractionally inside the surface).
    let shadow_origin = rec.p + rec.normal * EPSILON;
    let shadow_ray = Ray(shadow_origin, to_sun);
    if is_occluded(shadow_ray, EPSILON, MAX_FLOAT) {
        return vec3<f32>(0.0);
    }

    // Lambertian BRDF = albedo / π; sun.intensity is treated as irradiance.
    let brdf = rec.albedo / PI;
    return brdf * sun.color * sun.intensity * cos_theta;
}

// ── Path Tracing ────────────────────────────────────────────────────────────

fn trace(initial_ray: Ray) -> vec3<f32> {
    var radiance    = vec3<f32>(0.0, 0.0, 0.0); // accumulated light
    var throughput  = vec3<f32>(1.0, 1.0, 1.0); // path attenuation so far
    var current_ray = initial_ray;

    for (var bounce = 0u; bounce < MAX_BOUNCES; bounce++) {
        var rec: HitRecord;

        if hit_world(current_ray, EPSILON, MAX_FLOAT, &rec) {
            // Next event estimation: add the sun's direct contribution at
            // diffuse surfaces before continuing the random walk.
            if rec.mat_type == MAT_LAMBERTIAN {
                radiance += throughput * sun_direct_light(rec);
            } else if rec.mat_type == MAT_EMISSIVE {
                radiance += throughput * rec.albedo * sun.intensity;
            }

            let s = scatter(current_ray, rec);
            if s.did_scatter {
                throughput  *= s.attenuation;
                current_ray  = s.scattered;
            } else {
                // Absorbed – stop; keep whatever direct light we gathered.
                return radiance;
            }
        } else {
            // Ray escaped – add the sky as an environment light and stop.
            return radiance + throughput * sky_color(current_ray);
        }
    }

    // Exceeded max bounces – return the light gathered so far.
    return radiance;
}

// ── Compute Entry Point ─────────────────────────────────────────────────────

/// Anti-aliasing sample budget: rays cast per pixel, each jittered within the
/// pixel and averaged. Higher = smoother edges & less noise, but linearly
/// slower. Tunable — bump for quality, lower if a dispatch stalls.
const SAMPLES_PER_PIXEL: u32 = 8u;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pixel = global_id.xy;

    // Guard: skip threads outside the image
    if pixel.x >= state.width || pixel.y >= state.height {
        return;
    }

    init_rng(pixel, state.frame_count);

    // ── Multi-sample anti-aliasing ──────────────────────────────────────
    // Average many jittered sub-pixel samples. The per-sample jitter comes
    // from the RNG, so each of the SAMPLES_PER_PIXEL rays lands at a slightly
    // different point inside the pixel, smoothing geometry edges.
    var accum = vec3<f32>(0.0);
    for (var s = 0u; s < SAMPLES_PER_PIXEL; s++) {
        let u = (f32(pixel.x) + rand()) / f32(state.width);
        let v = 1.0 - (f32(pixel.y) + rand()) / f32(state.height);
        accum += trace(get_ray(u, v));
    }

    var color = accum / f32(SAMPLES_PER_PIXEL);

    // Gamma correction (linear → sRGB, γ≈2.0) for perceptually correct output.
    color = sqrt(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)));

    textureStore(output_texture, pixel, vec4<f32>(color, 1.0));
}
