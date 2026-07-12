// ============================================================================
// TinyTracer – WebGPU Path Tracer Renderer
//
// Manages the full WebGPU lifecycle: adapter/device initialization, shader
// compilation, buffer management, bind groups, and compute dispatch.
//
// Usage:
//   const tracer = await WebGPUPathTracer.create(canvas);
//   tracer.updateScene(triangleData, triangleCount, sphereData, sphereCount);
//   tracer.dispatchCompute(cameraData, frameCount, triangleCount, sphereCount);
//   // ... in a loop or on demand
//   tracer.destroy();
// ============================================================================

import shaderCode from "./compute.wgsl";

// ── Constants ───────────────────────────────────────────────────────────────

/** Camera uniform: 16 floats × 4 bytes = 64 bytes. */
const CAMERA_BUFFER_SIZE = 64;

/**
 * RenderState uniform: 5 × u32 of data, but the WGSL struct rounds up to a
 * 16-byte alignment boundary → 32 bytes allocated.
 */
const STATE_BUFFER_SIZE = 32;

/** Each Triangle is 20 floats × 4 bytes = 80 bytes. */
const TRIANGLE_BYTE_STRIDE = 80;

/** Each Sphere is 12 floats × 4 bytes = 48 bytes. */
const SPHERE_BYTE_STRIDE = 48;

/** Each BVH Node is 8 floats × 4 bytes = 32 bytes. */
const BVH_BYTE_STRIDE = 32;

/**
 * Sun uniform: 8 floats × 4 bytes = 32 bytes. Layout (std140) is
 * vec3 direction + pad, then vec3 color + intensity — see `serializeSun`
 * and the WGSL `SunLight` struct.
 */
const SUN_BUFFER_SIZE = 32;

/**
 * Solar-panel ray-hit statistics: 3 × u32 = 12 bytes, matching the WGSL
 * `panel_stats: array<atomic<u32>, 3>` storage binding. See {@link PanelStats}.
 */
const PANEL_STATS_COUNT = 3;
const PANEL_STATS_BUFFER_SIZE = PANEL_STATS_COUNT * 4;

/**
 * Raw solar-panel hit counters read back from the GPU after a dispatch.
 * `cosThetaSumScaled` is a fixed-point sum (see `COS_SCALE` in compute.wgsl)
 * — divide by that same scale to recover the average cosine of incidence.
 */
export interface PanelStats {
  /** Rays (across all bounces) whose closest hit was the panel's top face. */
  totalHits: number;
  /** Subset of `totalHits` where the sun was above the horizon and unoccluded. */
  litHits: number;
  /** Fixed-point sum of `cos_theta * COS_SCALE` over the `litHits` hits. */
  cosThetaSumScaled: number;
}

const EMPTY_PANEL_STATS: PanelStats = { totalHits: 0, litHits: 0, cosThetaSumScaled: 0 };

/** Workgroup dimensions — must match @workgroup_size in the shader. */
const WORKGROUP_X = 16;
const WORKGROUP_Y = 16;

/** Preferred canvas format. */
const CANVAS_FORMAT: GPUTextureFormat = "rgba8unorm";

// ── WebGPU Path Tracer ──────────────────────────────────────────────────────

export class WebGPUPathTracer {
  // GPU handles
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPUComputePipeline;
  private bindGroupLayout: GPUBindGroupLayout;

  // Buffers
  private cameraBuffer: GPUBuffer;
  private stateBuffer: GPUBuffer;
  private sunBuffer: GPUBuffer;
  private triangleBuffer: GPUBuffer | null = null;
  private sphereBuffer: GPUBuffer | null = null;
  private bvhBuffer: GPUBuffer | null = null;
  private skyboxTexture: GPUTexture;
  private skyboxSampler: GPUSampler;

  // Solar-panel stats: `panelStatsBuffer` is the atomic counter the shader
  // writes into; `panelStatsReadBuffer` is a persistent MAP_READ-able buffer
  // it's copied into after each dispatch so the CPU can read it back. Both
  // are allocated once and reused for every run — never recreated per frame
  // — so repeated Run/Stop cycles can't leak GPU buffers.
  private panelStatsBuffer: GPUBuffer;
  private panelStatsReadBuffer: GPUBuffer;
  // Serializes access to `panelStatsReadBuffer`'s map/unmap cycle so two
  // overlapping readPanelStats() calls (e.g. Run clicked again before the
  // previous readback resolved) can never both have it mapped at once.
  private statsReadLock: Promise<void> = Promise.resolve();

  // Tracking
  private currentTriangleCapacity = 0;
  private currentSphereCapacity = 0;
  private currentBvhCapacity = 0;
  private width: number;
  private height: number;
  private bindGroup: GPUBindGroup | null = null;

  // ── Private constructor (use static `create`) ───────────────────────────

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPUComputePipeline,
    bindGroupLayout: GPUBindGroupLayout,
    cameraBuffer: GPUBuffer,
    stateBuffer: GPUBuffer,
    sunBuffer: GPUBuffer,
    panelStatsBuffer: GPUBuffer,
    panelStatsReadBuffer: GPUBuffer,
    skyboxTexture: GPUTexture,
    skyboxSampler: GPUSampler,
    width: number,
    height: number
  ) {
    this.device = device;
    this.context = context;
    this.pipeline = pipeline;
    this.bindGroupLayout = bindGroupLayout;
    this.cameraBuffer = cameraBuffer;
    this.stateBuffer = stateBuffer;
    this.sunBuffer = sunBuffer;
    this.panelStatsBuffer = panelStatsBuffer;
    this.panelStatsReadBuffer = panelStatsReadBuffer;
    this.skyboxTexture = skyboxTexture;
    this.skyboxSampler = skyboxSampler;
    this.width = width;
    this.height = height;
  }

  // ── Factory ─────────────────────────────────────────────────────────────

  /**
   * Initialize WebGPU, compile the shader, and create the compute pipeline.
   *
   * @throws If WebGPU is not supported or the adapter/device cannot be obtained.
   */
  static async create(canvas: HTMLCanvasElement, skyboxImage: HTMLImageElement | ImageBitmap): Promise<WebGPUPathTracer> {
    // ── 1. Request adapter & device ─────────────────────────────────────
    if (!navigator.gpu) {
      throw new Error(
        "WebGPU is not supported in this browser. " +
        "Try Chrome 113+ or Edge 113+ with WebGPU enabled."
      );
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) {
      throw new Error("Failed to obtain a WebGPU adapter.");
    }

    const device = await adapter.requestDevice();

    // Report uncaptured errors
    device.addEventListener("uncapturederror", (event) => {
      console.error("WebGPU uncaptured error:", event);
    });

    // ── 2. Configure canvas context ─────────────────────────────────────
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Failed to obtain a WebGPU canvas context.");
    }

    context.configure({
      device,
      format: CANVAS_FORMAT,
      usage:
        GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const width = canvas.width;
    const height = canvas.height;

    // ── 3. Compile shader module ────────────────────────────────────────
    const shaderModule = device.createShaderModule({
      label: "TinyTracer Compute Shader",
      code: shaderCode,
    });

    // ── 4. Create bind group layout ─────────────────────────────────────
    const bindGroupLayout = device.createBindGroupLayout({
      label: "TinyTracer Bind Group Layout",
      entries: [
        {
          // @binding(0): output texture
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only",
            format: CANVAS_FORMAT,
            viewDimension: "2d",
          },
        },
        {
          // @binding(1): Camera uniform
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          // @binding(2): Triangle storage (read-only)
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          // @binding(3): RenderState uniform
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          // @binding(4): Sphere storage (read-only)
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          // @binding(5): BVH storage (read-only)
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          // @binding(6): Skybox texture
          binding: 6,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          // @binding(7): Skybox sampler
          binding: 7,
          visibility: GPUShaderStage.COMPUTE,
          sampler: { type: "filtering" },
        },
        {
          // @binding(8): Sun (directional light) uniform
          binding: 8,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          // @binding(9): Solar-panel hit-count stats (read_write, atomics)
          binding: 9,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });

    // ── 5. Create compute pipeline ──────────────────────────────────────
    const pipelineLayout = device.createPipelineLayout({
      label: "TinyTracer Pipeline Layout",
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = device.createComputePipeline({
      label: "TinyTracer Compute Pipeline",
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    // ── 6. Create static uniform buffers ────────────────────────────────
    const cameraBuffer = device.createBuffer({
      label: "Camera Uniform Buffer",
      size: CAMERA_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const stateBuffer = device.createBuffer({
      label: "RenderState Uniform Buffer",
      size: STATE_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sunBuffer = device.createBuffer({
      label: "Sun Uniform Buffer",
      size: SUN_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Panel stats: the atomic counter buffer the shader writes into, plus a
    // persistent MAP_READ-able buffer it's copied into for readback. Both
    // live for the tracer's whole lifetime (see `destroy()`) — never
    // recreated per dispatch — so repeated runs can't leak GPU memory.
    const panelStatsBuffer = device.createBuffer({
      label: "Panel Stats Storage Buffer",
      size: PANEL_STATS_BUFFER_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const panelStatsReadBuffer = device.createBuffer({
      label: "Panel Stats Readback Buffer",
      size: PANEL_STATS_BUFFER_SIZE,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // ── 7. Upload Skybox Texture ────────────────────────────────────────
    const skyboxTexture = device.createTexture({
      label: "Skybox Texture",
      size: [skyboxImage.width, skyboxImage.height, 1],
      format: "rgba8unorm-srgb", // Use sRGB format to get linear reads in shader
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: skyboxImage, flipY: false },
      { texture: skyboxTexture },
      [skyboxImage.width, skyboxImage.height]
    );

    const skyboxSampler = device.createSampler({
      label: "Skybox Sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
    });

    return new WebGPUPathTracer(
      device,
      context,
      pipeline,
      bindGroupLayout,
      cameraBuffer,
      stateBuffer,
      sunBuffer,
      panelStatsBuffer,
      panelStatsReadBuffer,
      skyboxTexture,
      skyboxSampler,
      width,
      height
    );
  }

  // ── Scene Updates ───────────────────────────────────────────────────────

  /**
   * Upload the scene's primitives to the GPU. Both storage buffers are
   * re-created if the corresponding primitive count has grown beyond the
   * current capacity.
   *
   * @param triangleData  Packed Float32Array from `serializeTriangles`.
   * @param triangleCount Number of triangles in the array.
   * @param sphereData    Packed Float32Array from `serializeSpheres`.
   * @param sphereCount   Number of spheres in the array.
   * @param sunData       Packed Float32Array from `serializeSun` (8 floats).
   */
  updateScene(
    triangleData: Float32Array,
    triangleCount: number,
    sphereData: Float32Array,
    sphereCount: number,
    bvhData: Float32Array,
    bvhNodeCount: number,
    sunData: Float32Array
  ): void {
    // Sun is a small fixed-size uniform — just overwrite it each update.
    this.device.queue.writeBuffer(
      this.sunBuffer, 0,
      sunData.buffer, sunData.byteOffset, sunData.byteLength
    );

    this.triangleBuffer = this.uploadStorage(
      this.triangleBuffer,
      triangleData,
      triangleCount,
      this.currentTriangleCapacity,
      TRIANGLE_BYTE_STRIDE,
      "Triangle Storage Buffer",
      (cap) => (this.currentTriangleCapacity = cap)
    );

    this.sphereBuffer = this.uploadStorage(
      this.sphereBuffer,
      sphereData,
      sphereCount,
      this.currentSphereCapacity,
      SPHERE_BYTE_STRIDE,
      "Sphere Storage Buffer",
      (cap) => (this.currentSphereCapacity = cap)
    );

    this.bvhBuffer = this.uploadStorage(
      this.bvhBuffer,
      bvhData,
      bvhNodeCount,
      this.currentBvhCapacity,
      BVH_BYTE_STRIDE,
      "BVH Storage Buffer",
      (cap) => (this.currentBvhCapacity = cap)
    );
  }

  /**
   * Ensure a read-only storage buffer is large enough for `count` primitives
   * and upload `data` into it. Grows (never shrinks) the buffer, invalidating
   * the bind group whenever a new buffer is allocated.
   */
  private uploadStorage(
    buffer: GPUBuffer | null,
    data: Float32Array,
    count: number,
    capacity: number,
    byteStride: number,
    label: string,
    setCapacity: (cap: number) => void
  ): GPUBuffer {
    // Always keep at least one stride so the buffer is a valid binding even
    // when the scene has no primitives of this kind.
    const requiredBytes = Math.max(data.byteLength, byteStride);

    if (!buffer || count > capacity) {
      buffer?.destroy();
      buffer = this.device.createBuffer({
        label,
        size: requiredBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      setCapacity(count);
      // Invalidate bind group — it references the old buffer.
      this.bindGroup = null;
    }

    if (data.byteLength > 0) {
      this.device.queue.writeBuffer(
        buffer, 0,
        data.buffer, data.byteOffset, data.byteLength
      );
    }

    return buffer;
  }

  // ── Compute Dispatch ────────────────────────────────────────────────────

  /**
   * Run one compute pass: update uniforms, bind resources, dispatch
   * workgroups to cover the full canvas, and read back the solar-panel hit
   * counters the shader accumulated during the pass.
   *
   * @param cameraData  Packed Float32Array from `serializeCamera`.
   * @param frameCount  Current frame number (1-indexed). Used by the shader
   *                    for RNG seeding and progressive accumulation.
   */
  async dispatchCompute(
    cameraData: Float32Array,
    frameCount: number,
    triangleCount: number,
    sphereCount: number
  ): Promise<PanelStats> {
    // ── Update camera uniform ─────────────────────────────────────────
    this.device.queue.writeBuffer(
      this.cameraBuffer, 0,
      cameraData.buffer, cameraData.byteOffset, cameraData.byteLength
    );

    // ── Update render state uniform ───────────────────────────────────
    // Order must match the WGSL RenderState struct.
    const stateData = new Uint32Array([
      frameCount,
      triangleCount,
      sphereCount,
      this.width,
      this.height,
    ]);
    this.device.queue.writeBuffer(
      this.stateBuffer, 0,
      stateData.buffer, stateData.byteOffset, stateData.byteLength
    );

    // ── Reset the panel-stats counters ────────────────────────────────
    // Every dispatch starts a fresh accumulation — otherwise counts would
    // keep growing across runs instead of reflecting this render alone.
    this.device.queue.writeBuffer(
      this.panelStatsBuffer, 0,
      new Uint32Array(PANEL_STATS_COUNT)
    );

    // ── Obtain current canvas texture ─────────────────────────────────
    const texture = this.context.getCurrentTexture();
    const textureView = texture.createView();

    // ── Build / rebuild bind group ────────────────────────────────────
    // We must recreate the bind group every frame because the canvas
    // texture view changes each frame.
    if (!this.triangleBuffer || !this.sphereBuffer) {
      // No scene uploaded yet — nothing to render.
      return EMPTY_PANEL_STATS;
    }

    this.bindGroup = this.device.createBindGroup({
      label: "TinyTracer Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: { buffer: this.cameraBuffer } },
        { binding: 2, resource: { buffer: this.triangleBuffer } },
        { binding: 3, resource: { buffer: this.stateBuffer } },
        { binding: 4, resource: { buffer: this.sphereBuffer } },
        { binding: 5, resource: { buffer: this.bvhBuffer! } },
        { binding: 6, resource: this.skyboxTexture.createView() },
        { binding: 7, resource: this.skyboxSampler },
        { binding: 8, resource: { buffer: this.sunBuffer } },
        { binding: 9, resource: { buffer: this.panelStatsBuffer } },
      ],
    });

    // ── Encode and dispatch ───────────────────────────────────────────
    const commandEncoder = this.device.createCommandEncoder({
      label: "TinyTracer Command Encoder",
    });

    const pass = commandEncoder.beginComputePass({
      label: "TinyTracer Compute Pass",
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);

    const workgroupsX = Math.ceil(this.width / WORKGROUP_X);
    const workgroupsY = Math.ceil(this.height / WORKGROUP_Y);
    pass.dispatchWorkgroups(workgroupsX, workgroupsY);
    pass.end();

    // Copy the panel stats into the persistent MAP_READ-able buffer within
    // the same command buffer — WebGPU guarantees this runs after the
    // compute pass's atomic writes complete.
    commandEncoder.copyBufferToBuffer(
      this.panelStatsBuffer, 0,
      this.panelStatsReadBuffer, 0,
      PANEL_STATS_BUFFER_SIZE
    );

    this.device.queue.submit([commandEncoder.finish()]);

    return this.readPanelStats();
  }

  /**
   * Map, read, and unmap `panelStatsReadBuffer`. Chained through
   * `statsReadLock` so overlapping calls (e.g. Run clicked again before a
   * previous readback finished) never try to map the same buffer twice —
   * mapAsync throws if the buffer is already mapped, and an unpaired mapAsync
   * without a matching unmap() would permanently pin that GPU memory.
   */
  private readPanelStats(): Promise<PanelStats> {
    const result = this.statsReadLock.then(async () => {
      await this.panelStatsReadBuffer.mapAsync(GPUMapMode.READ);
      try {
        const data = new Uint32Array(this.panelStatsReadBuffer.getMappedRange().slice(0));
        return {
          totalHits: data[0],
          litHits: data[1],
          cosThetaSumScaled: data[2],
        };
      } finally {
        this.panelStatsReadBuffer.unmap();
      }
    });
    // Keep the lock chain alive regardless of success/failure, but don't let
    // a rejection here propagate into unrelated later reads.
    this.statsReadLock = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  // ── Resize ──────────────────────────────────────────────────────────────

  /**
   * Update internal dimensions after the canvas has been resized.
   * The caller should also update `canvas.width` / `canvas.height` and
   * reconfigure the context if needed.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    // Invalidate bind group since the texture dimensions changed
    this.bindGroup = null;
  }

  // ── Accessors ───────────────────────────────────────────────────────────

  /** Current render width in pixels. */
  get renderWidth(): number {
    return this.width;
  }

  /** Current render height in pixels. */
  get renderHeight(): number {
    return this.height;
  }

  /** The underlying GPUDevice, exposed for advanced use. */
  get gpuDevice(): GPUDevice {
    return this.device;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  /**
   * Release all GPU resources. The instance should not be used after this.
   */
  destroy(): void {
    this.cameraBuffer.destroy();
    this.stateBuffer.destroy();
    this.sunBuffer.destroy();
    this.panelStatsBuffer.destroy();
    this.panelStatsReadBuffer.destroy();
    this.triangleBuffer?.destroy();
    this.sphereBuffer?.destroy();
    this.bvhBuffer?.destroy();
    this.skyboxTexture.destroy();
    this.device.destroy();
  }
}
