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
  private triangleBuffer: GPUBuffer | null = null;
  private sphereBuffer: GPUBuffer | null = null;
  private bvhBuffer: GPUBuffer | null = null;
  private skyboxTexture: GPUTexture;
  private skyboxSampler: GPUSampler;

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
   */
  updateScene(
    triangleData: Float32Array,
    triangleCount: number,
    sphereData: Float32Array,
    sphereCount: number,
    bvhData: Float32Array,
    bvhNodeCount: number
  ): void {
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
   * Run one compute pass: update uniforms, bind resources, and dispatch
   * workgroups to cover the full canvas.
   *
   * @param cameraData  Packed Float32Array from `serializeCamera`.
   * @param frameCount  Current frame number (1-indexed). Used by the shader
   *                    for RNG seeding and progressive accumulation.
   */
  dispatchCompute(
    cameraData: Float32Array,
    frameCount: number,
    triangleCount: number,
    sphereCount: number
  ): void {
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

    // ── Obtain current canvas texture ─────────────────────────────────
    const texture = this.context.getCurrentTexture();
    const textureView = texture.createView();

    // ── Build / rebuild bind group ────────────────────────────────────
    // We must recreate the bind group every frame because the canvas
    // texture view changes each frame.
    if (!this.triangleBuffer || !this.sphereBuffer) {
      // No scene uploaded yet — nothing to render.
      return;
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

    this.device.queue.submit([commandEncoder.finish()]);
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
    this.triangleBuffer?.destroy();
    this.sphereBuffer?.destroy();
    this.bvhBuffer?.destroy();
    this.skyboxTexture.destroy();
    this.device.destroy();
  }
}
