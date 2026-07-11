const fs = require('fs');
const path = './lib/webgpu/renderer.ts';
let content = fs.readFileSync(path, 'utf8');

// Add BVH_BYTE_STRIDE
content = content.replace(
  'const SPHERE_BYTE_STRIDE = 48;',
  `const SPHERE_BYTE_STRIDE = 48;

/** Each BVH Node is 8 floats × 4 bytes = 32 bytes. */
const BVH_BYTE_STRIDE = 32;`
);

// Add bvhBuffer and capacity
content = content.replace(
  'private sphereBuffer: GPUBuffer | null = null;',
  `private sphereBuffer: GPUBuffer | null = null;
  private bvhBuffer: GPUBuffer | null = null;`
);

content = content.replace(
  'private currentSphereCapacity = 0;',
  `private currentSphereCapacity = 0;
  private currentBvhCapacity = 0;`
);

// Update BindGroupLayout
content = content.replace(
  `        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
      ],
    });`,
  `        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
      ],
    });`
);

// Update BindGroup
content = content.replace(
  `        { binding: 4, resource: { buffer: this.sphereBuffer! } },
      ],
    });`,
  `        { binding: 4, resource: { buffer: this.sphereBuffer! } },
        { binding: 5, resource: { buffer: this.bvhBuffer! } },
      ],
    });`
);

// Update updateScene signature and implementation
content = content.replace(
  `  updateScene(
    triangleData: Float32Array,
    triangleCount: number,
    sphereData: Float32Array,
    sphereCount: number
  ): void {`,
  `  updateScene(
    triangleData: Float32Array,
    triangleCount: number,
    sphereData: Float32Array,
    sphereCount: number,
    bvhData: Float32Array,
    bvhNodeCount: number
  ): void {`
);

content = content.replace(
  `    this.sphereBuffer = this.uploadStorage(
      this.sphereBuffer,
      sphereData,
      sphereCount,
      this.currentSphereCapacity,
      SPHERE_BYTE_STRIDE,
      "Sphere Storage Buffer",
      (cap) => (this.currentSphereCapacity = cap)
    );
  }`,
  `    this.sphereBuffer = this.uploadStorage(
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
  }`
);

// Update destroy
content = content.replace(
  `    this.sphereBuffer?.destroy();`,
  `    this.sphereBuffer?.destroy();
    this.bvhBuffer?.destroy();`
);

fs.writeFileSync(path, content);
console.log("Patched renderer.ts");
