# TinyTracer

## Requirements

- **Node.js** 20+ and npm
- **WebGPU-capable browser** (see below) - this project has no WebGL/CPU fallback for its path-tracer.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts:

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Browser support

The path tracer dispatches a WebGPU compute shader ([`lib/webgpu/compute.wgsl`](lib/webgpu/compute.wgsl)) and requires an engine with a working `navigator.gpu`.

Known-good:
- **Chrome / Edge 113+** on Windows, macOS, ChromeOS, and Android — the primary supported target.
- Chromium-based browsers with WebGPU explicitly enabled.

Partial-support:
- **Safari** — WebGPU shipped by default starting with Safari 18 (macOS Sequoia / iOS 18).
- **Firefox** — WebGPU support has been rolling out per-platform in recent nightly releases.

Only the path-acer needs WebGPU support. The rest of the project runs by using Three.js's WebGL renderer.

## Codebase structure

```
app/
  page.tsx              Landing page (links to the sandbox and the shape editor)
  sandbox/page.tsx       Route that lazy-loads the sandbox (SSR disabled — Three.js needs the DOM)
  layout.tsx, globals.css

components/
  BrandButton.tsx, DayNightBackground.tsx   Landing page UI
  PathTracerSandbox/                        The scene editor + path tracer UI
    index.tsx                Top-level layout: left/right panels, viewport, wiring
    components/               TopBar, SceneControls, RightPanel, PathTracerOutput
    hooks/
      useThreeScene.ts         Builds the Three.js scene, camera, lights, loads models
      useCameraMode.ts         Perspective/orthographic camera switching
      useKeyboardShortcuts.ts  Hotkeys for transform modes, etc.
      usePathTracer.ts         Serializes the scene and drives the WebGPU renderer
    objects/                   Scene primitives (Cube, Sphere, Pyramid, Skybox, terrain, geometry loading)
    sun.ts, constants.ts, types.ts

lib/
  energy.ts                 Solar-panel hit-rate / energy statistics helpers
  webgpu/
    renderer.ts              WebGPU device/pipeline/buffer lifecycle (WebGPUPathTracer)
    serializer.ts             Converts the Three.js scene graph into GPU buffer layouts (triangles, BVH, spheres)
    compute.wgsl              The path tracing compute shader

public/
  models/                   .obj meshes used by the sandbox (Car, Tree, SolarPannel, cube, pyramid, sphere)
  shape-editor.html          Standalone "Create Your Own" shape editor, linked from the landing page
  skybox-texture.png
```

## Dependencies

- **[Next.js](https://nextjs.org) 16** (Turbopack by default)
- **React 19 / React DOM 19**
- **[three](https://threejs.org)** - scene graph, WebGL preview, camera/orbit/transform controls, `.obj` loading
- **`@webgpu/types`** - TypeScript types for the WebGPU API (dev dependency)
- **`raw-loader`** - imports `.wgsl` shader source as a raw string; wired up in [`next.config.ts`](next.config.ts) for both Turbopack and the webpack fallback build
- **Tailwind CSS 4** - styling
