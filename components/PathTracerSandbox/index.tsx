"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CameraMode,
  OrthoView,
  SceneRefs,
  SunSettings,
  TransformMode,
} from "./types";
import { useThreeScene } from "./hooks/useThreeScene";
import { useCameraMode } from "./hooks/useCameraMode";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePathTracer } from "./hooks/usePathTracer";
import { TopBar } from "./components/TopBar";
import { SunPanel } from "./components/SunPanel";
import { EnergyStatsPanel } from "./components/EnergyStatsPanel";
import { PathTracerOutput } from "./components/PathTracerOutput";
import { DEFAULT_TREE_COUNT } from "./constants";
import { applySunSettings, DEFAULT_SUN } from "./sun";
import "./PathTracerSandbox.css";

export default function PathTracerSandbox() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const cameraModeRef = useRef<CameraMode>("perspective");

  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective");
  // Ortho toggling had no UI trigger once LeftPanel was removed — the
  // camera stays perspective, but useCameraMode still wants an OrthoView.
  const orthoView: OrthoView = "front";
  // Nothing displays the selected object's name anymore (BottomStatusBar was
  // removed), but the setter still drives selection bookkeeping elsewhere.
  const [, setSelectedName] = useState<string | null>(null);
  const [treeCount, setTreeCount] = useState(DEFAULT_TREE_COUNT);
  const [sun, setSun] = useState<SunSettings>(DEFAULT_SUN);
  const [sunPanelOpen, setSunPanelOpen] = useState(true);
  // Sphere/Cube/Pyramid geometry now loads from .obj files asynchronously,
  // so the scene isn't ready the instant these hooks are called — see
  // useThreeScene's onReady callback and useCameraMode's sceneReady param.
  const [sceneReady, setSceneReady] = useState(false);

  useThreeScene(containerRef, sceneRef, cameraModeRef, setSelectedName, () =>
    setSceneReady(true)
  );
  useCameraMode(sceneRef, cameraModeRef, cameraMode, orthoView, sceneReady);

  // Push the sun settings onto the Three.js light. Runs whenever the settings
  // change and once the scene is ready (so the initial state is applied). The
  // WebGL preview reflects it live via its own render loop; the path tracer
  // reads the same light when Run is pressed (see serializeSun).
  useEffect(() => {
    const light = sceneRef.current?.sunLight;
    if (!sceneReady || !light) return;
    applySunSettings(light, sun);
  }, [sun, sceneReady]);

  const {
    outputCanvasRef,
    isTracing,
    isInitializing,
    error,
    runTracer,
    stopTracer,
  } = usePathTracer(containerRef);

  const handleRunTracer = useCallback(async () => {
    const refs = sceneRef.current;
    if (!refs) return;

    // The path tracer only ever renders the perspective camera. If the user is
    // in orthographic mode, flip the sandbox to perspective so the view behind
    // the overlay matches the traced result.
    if (cameraMode === "orthographic") setCameraMode("perspective");

    // Freeze all scene interaction while the result is displayed.
    refs.orbitControls.enabled = false;
    refs.transformControls.enabled = false;
    refs.transformControls.detach();
    if (refs.selectedObject) refs.selectedObject = null;
    setSelectedName(null);

    await runTracer(refs.scene, refs.perspCamera);
  }, [cameraMode, runTracer]);

  const handleStopTracer = useCallback(() => {
    stopTracer();
    const refs = sceneRef.current;
    if (refs) {
      refs.orbitControls.enabled = true;
      refs.transformControls.enabled = true;
    }
  }, [stopTracer]);

  const setTransformMode = useCallback((mode: TransformMode) => {
    sceneRef.current?.transformControls.setMode(mode);
  }, []);

  const handleTreeCountChange = useCallback((count: number) => {
    setTreeCount(count);
    sceneRef.current?.setTreeCount(count);
  }, []);

  useKeyboardShortcuts(isTracing, sceneRef, setTransformMode, setSelectedName);

  return (
    <div className="relative w-full h-full flex-1">
      {/* Three.js Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0" />

      <TopBar isTracing={isTracing} onRunTracer={handleRunTracer} />

      {!isTracing && (
        <SunPanel
          sun={sun}
          open={sunPanelOpen}
          onToggle={() => setSunPanelOpen((o) => !o)}
          onChange={setSun}
          treeCount={treeCount}
          onTreeCountChange={handleTreeCountChange}
        />
      )}

      {isTracing && !isInitializing && !error && <EnergyStatsPanel />}

      <PathTracerOutput
        canvasRef={outputCanvasRef}
        isTracing={isTracing}
        isInitializing={isInitializing}
        error={error}
        onStop={handleStopTracer}
      />
    </div>
  );
}
