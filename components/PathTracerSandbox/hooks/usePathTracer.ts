import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { WebGPUPathTracer } from "@/lib/webgpu/renderer";
import {
  FLOATS_PER_SPHERE,
  FLOATS_PER_TRIANGLE,
  FLOATS_PER_BVH_NODE,
  serializeCamera,
  serializeSpheres,
  serializeSun,
  serializeTriangles,
} from "@/lib/webgpu/serializer";
import { computeEnergyStats, type EnergyStats } from "@/lib/energy";
import { preloadSkyboxTexture } from "../objects/Skybox";

/** Cap the device-pixel-ratio so the compute pass stays affordable. */
const MAX_PIXEL_RATIO = 1.5;

export interface PathTracerControls {
  /** Attach to the full-screen output <canvas> that WebGPU renders into. */
  outputCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** True while the traced result is being shown (overlay visible). */
  isTracing: boolean;
  /** True during the one-time WebGPU device/pipeline initialization. */
  isInitializing: boolean;
  /** Non-null when initialization or dispatch failed. */
  error: string | null;
  /** Energy readout derived from the panel's ray-hit stats; null until a trace completes. */
  energyStats: EnergyStats | null;
  /** Serialize the scene + perspective camera and run one compute dispatch. */
  runTracer: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => Promise<void>;
  /** Hide the overlay and return to the sandbox. */
  stopTracer: () => void;
}

/**
 * Owns the {@link WebGPUPathTracer} instance and its initialization lifecycle.
 *
 * WebGPU is initialized lazily on the first Run (once the output canvas is
 * mounted and sized), then reused for subsequent runs. A single compute
 * dispatch is issued per Run — progressive multi-frame accumulation is a
 * backend follow-up (the shader currently writes one sample per pixel).
 */
export function usePathTracer(
  containerRef: RefObject<HTMLDivElement | null>
): PathTracerControls {
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tracerRef = useRef<WebGPUPathTracer | null>(null);

  const [isTracing, setIsTracing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [energyStats, setEnergyStats] = useState<EnergyStats | null>(null);

  const runTracer = useCallback(
    async (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
      const canvas = outputCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      setError(null);

      // ── Size the canvas backing store to the container ──────────────────
      const pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
      const width = Math.max(1, Math.floor(container.clientWidth * pixelRatio));
      const height = Math.max(1, Math.floor(container.clientHeight * pixelRatio));

      try {
        // ── Lazy init / resize ────────────────────────────────────────────
        if (!tracerRef.current) {
          canvas.width = width;
          canvas.height = height;
          setIsInitializing(true);
          const skyboxTexture = await preloadSkyboxTexture();
          tracerRef.current = await WebGPUPathTracer.create(
            canvas,
            skyboxTexture.image as HTMLImageElement | ImageBitmap
          );
          setIsInitializing(false);
        } else if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          tracerRef.current.resize(width, height);
        }

        const tracer = tracerRef.current;

        // ── Serialize → upload → dispatch ─────────────────────────────────
        const { triangleData, bvhData } = serializeTriangles(scene);
        const triangleCount = triangleData.length / FLOATS_PER_TRIANGLE;
        const bvhNodeCount = bvhData.length / FLOATS_PER_BVH_NODE;
        const sphereData = serializeSpheres(scene);
        const sphereCount = sphereData.length / FLOATS_PER_SPHERE;
        const sunData = serializeSun(scene);
        tracer.updateScene(triangleData, triangleCount, sphereData, sphereCount, bvhData, bvhNodeCount, sunData);

        const cameraData = serializeCamera(camera);
        const panelStats = await tracer.dispatchCompute(cameraData, 1, triangleCount, sphereCount);
        // sunData[7] is the SunLight uniform's intensity float (see serializeSun).
        setEnergyStats(computeEnergyStats(panelStats, sunData[7]));

        setIsTracing(true);
      } catch (err) {
        setIsInitializing(false);
        setError(err instanceof Error ? err.message : String(err));
        setIsTracing(true); // surface the error in the overlay
      }
    },
    [containerRef]
  );

  const stopTracer = useCallback(() => {
    setIsTracing(false);
    setEnergyStats(null);
    setError(null);
  }, []);

  // ── Release GPU resources on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      tracerRef.current?.destroy();
      tracerRef.current = null;
    };
  }, []);

  return {
    outputCanvasRef,
    isTracing,
    isInitializing,
    error,
    energyStats,
    runTracer,
    stopTracer,
  };
}
