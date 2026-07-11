"use client";

import { useCallback, useRef, useState } from "react";
import type { CameraMode, OrthoView, SceneRefs, TransformMode } from "./types";
import { useThreeScene } from "./hooks/useThreeScene";
import { useCameraMode } from "./hooks/useCameraMode";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { TopBar } from "./components/TopBar";
import { LeftPanel } from "./components/LeftPanel";
import { BottomStatusBar } from "./components/BottomStatusBar";
import { TracingOverlay } from "./components/TracingOverlay";
import "./PathTracerSandbox.css";

export default function PathTracerSandbox() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const cameraModeRef = useRef<CameraMode>("perspective");

  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective");
  const [orthoView, setOrthoView] = useState<OrthoView>("front");
  const [isTracing, setIsTracing] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useThreeScene(containerRef, sceneRef, cameraModeRef, setSelectedName);
  useCameraMode(sceneRef, cameraModeRef, cameraMode, orthoView);

  const handleRunTracer = useCallback(() => {
    setIsTracing(true);
    setTimeout(() => {
      setIsTracing(false);
    }, 3000);
  }, []);

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

      {isTracing && <TracingOverlay />}
    </div>
  );
}
