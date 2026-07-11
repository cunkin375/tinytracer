"use client";

import { useCallback, useRef, useState } from "react";
import type { CameraMode, OrthoView, SceneRefs, TransformMode } from "./types";
import { useThreeScene } from "./hooks/useThreeScene";
import { useCameraMode } from "./hooks/useCameraMode";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePathTracer } from "./hooks/usePathTracer";
import { TopBar } from "./components/TopBar";
import { LeftPanel } from "./components/LeftPanel";
import { BottomStatusBar } from "./components/BottomStatusBar";
import { PathTracerOutput } from "./components/PathTracerOutput";
import "./PathTracerSandbox.css";

export default function PathTracerSandbox() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const cameraModeRef = useRef<CameraMode>("perspective");

  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective");
  const [orthoView, setOrthoView] = useState<OrthoView>("front");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useThreeScene(containerRef, sceneRef, cameraModeRef, setSelectedName);
  useCameraMode(sceneRef, cameraModeRef, cameraMode, orthoView);

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

  const handleToggleCamera = useCallback(() => {
    if (cameraMode === "perspective") {
      setCameraMode("orthographic");
      setOrthoView("front");
    } else {
      setCameraMode("perspective");
    }
  }, [cameraMode]);

  const handleOrthoViewToggle = useCallback(() => {
    setOrthoView((v) => (v === "front" ? "top" : "front"));
  }, []);

  const setTransformMode = useCallback((mode: TransformMode) => {
    sceneRef.current?.transformControls.setMode(mode);
  }, []);

  useKeyboardShortcuts(isTracing, sceneRef, setTransformMode, setSelectedName);

  return (
    <div className="relative w-full h-full flex-1">
      {/* Three.js Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0" />

      <TopBar isTracing={isTracing} onRunTracer={handleRunTracer} />

      <LeftPanel
        cameraMode={cameraMode}
        orthoView={orthoView}
        onToggleCamera={handleToggleCamera}
        onToggleOrthoView={handleOrthoViewToggle}
        onSetTransformMode={setTransformMode}
      />

      <BottomStatusBar
        cameraMode={cameraMode}
        orthoView={orthoView}
        selectedName={selectedName}
      />

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
