// ============================================================================
// TinyTracer – WebGPU Path Tracer Renderer
//
// Manages the full WebGPU lifecycle: adapter/device initialization, shader
// compilation, buffer management, bind groups, and compute dispatch.
//
// Usage:
//   const tracer = await WebGPUPathTracer.create(canvas);
//   tracer.updateScene(sphereData, sphereCount);
//   tracer.dispatchCompute(cameraData, frameCount);
//   // ... in a loop or on demand
//   tracer.destroy();
// ============================================================================

import shaderCode from "./compute.wgsl";

// ── Constants ───────────────────────────────────────────────────────────────

/** Camera uniform: 16 floats × 4 bytes = 64 bytes. */
const CAMERA_BUFFER_SIZE = 64;

/** RenderState uniform: 4 × u32 = 16 bytes. */
const STATE_BUFFER_SIZE = 16;

/** Each Sphere is 12 floats × 4 bytes = 48 bytes. */
const SPHERE_BYTE_STRIDE = 48;

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
  private sphereBuffer: GPUBuffer | null = null;

  // Tracking
  private currentSphereCapacity = 0;
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
    width: number,
    height: number
  ) {
    this.device = device;
    this.context = context;
    this.pipeline = pipeline;
    this.bindGroupLayout = bindGroupLayout;
    this.cameraBuffer = cameraBuffer;
    this.stateBuffer = stateBuffer;
    this.width = width;
    this.height = height;
  }

  // ── Factory ─────────────────────────────────────────────────────────────

  /**
   * Initialize WebGPU, compile the shader, and create the compute pipeline.
   *
   * @throws If WebGPU is not supported or the adapter/device cannot be obtained.
   */
  static async create(canvas: HTMLCanvasElement): Promise<WebGPUPathTracer> {
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
          // @binding(2): Sphere storage (read-only)
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

    return new WebGPUPathTracer(
      device,
      context,
      pipeline,
      bindGroupLayout,
      cameraBuffer,
      stateBuffer,
      width,
      height
    );
  }

  // ── Scene Updates ───────────────────────────────────────────────────────

  /**
   * Upload sphere data to the GPU. Re-creates the storage buffer if the
   * number of spheres has changed.
   *
   * @param sphereData  Packed Float32Array from `serializeSpheres`.
   * @param sphereCount Number of spheres in the array.
   */
  updateScene(sphereData: Float32Array, sphereCount: number): void {
    const requiredBytes = Math.max(sphereCount * SPHERE_BYTE_STRIDE, SPHERE_BYTE_STRIDE);

    // Re-create the buffer if capacity is insufficient
    if (!this.sphereBuffer || sphereCount > this.currentSphereCapacity) {
      this.sphereBuffer?.destroy();
      this.sphereBuffer = this.device.createBuffer({
        label: "Sphere Storage Buffer",
        size: requiredBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.currentSphereCapacity = sphereCount;
      // Invalidate bind group — it references the old buffer
      this.bindGroup = null;
    }

    if (sphereData.byteLength > 0) {
      this.device.queue.writeBuffer(
        this.sphereBuffer, 0,
        sphereData.buffer, sphereData.byteOffset, sphereData.byteLength
      );
    }
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
    sphereCount: number
  ): void {
    // ── Update camera uniform ─────────────────────────────────────────
    this.device.queue.writeBuffer(
      this.cameraBuffer, 0,
      cameraData.buffer, cameraData.byteOffset, cameraData.byteLength
    );

    // ── Update render state uniform ───────────────────────────────────
    const stateData = new Uint32Array([
      frameCount,
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
    if (!this.sphereBuffer) {
      // No scene uploaded yet — nothing to render.
      return;
    }

    this.bindGroup = this.device.createBindGroup({
      label: "TinyTracer Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: { buffer: this.cameraBuffer } },
        { binding: 2, resource: { buffer: this.sphereBuffer } },
        { binding: 3, resource: { buffer: this.stateBuffer } },
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
    this.sphereBuffer?.destroy();
    this.device.destroy();
  }
}
