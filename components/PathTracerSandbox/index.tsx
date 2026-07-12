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
import { SceneControls } from "./components/SceneControls";
import { RightPanel } from "./components/RightPanel";
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
  // Off-canvas drawer state for the left/right panels below the `sm`
  // breakpoint — both panels are always visible at `sm` and up (see the
  // `sm:static sm:translate-x-0` overrides in the JSX below).
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
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
    energyStats,
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

    // On mobile, both panels are off-canvas drawers — close them so the
    // result is actually visible instead of hidden behind an open drawer.
    setLeftPanelOpen(false);
    setRightPanelOpen(false);

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
    <div className="w-full h-full flex-1 flex flex-col">
      <TopBar
        onToggleLeft={() => setLeftPanelOpen((o) => !o)}
        onToggleRight={() => setRightPanelOpen((o) => !o)}
      />

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Backdrop — closes whichever drawer is open on mobile. */}
        {(leftPanelOpen || rightPanelOpen) && (
          <div
            className="sm:hidden absolute inset-0 z-[60] bg-black/50"
            onClick={() => {
              setLeftPanelOpen(false);
              setRightPanelOpen(false);
            }}
          />
        )}

        {/* Left — scene controls. Off-canvas drawer below `sm`, static
            sidebar at `sm` and up. */}
        <aside
          className={`absolute sm:static inset-y-0 left-0 z-[70] w-64 sm:w-[260px] shrink-0
            overflow-y-auto p-4 border-r border-white/10
            transition-transform duration-200 sm:translate-x-0
            ${leftPanelOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ background: "rgba(18, 18, 26, 0.95)" }}
        >
          <SceneControls
            sun={sun}
            onChange={setSun}
            treeCount={treeCount}
            onTreeCountChange={handleTreeCountChange}
            disabled={isTracing}
          />
        </aside>

        {/* Center — 3D viewport */}
        <div className="relative flex-1 min-w-0">
          <div ref={containerRef} className="absolute inset-0" />
          <PathTracerOutput
            canvasRef={outputCanvasRef}
            isTracing={isTracing}
            isInitializing={isInitializing}
            error={error}
          />
        </div>

        {/* Right — render control + energy readout. Off-canvas drawer below
            `sm`, static sidebar at `sm` and up. */}
        <aside
          className={`absolute sm:static inset-y-0 right-0 z-[70] w-64 sm:w-[280px] shrink-0
            overflow-y-auto p-4 border-l border-white/10
            transition-transform duration-200 sm:translate-x-0
            ${rightPanelOpen ? "translate-x-0" : "translate-x-full"}`}
          style={{ background: "rgba(18, 18, 26, 0.95)" }}
        >
          <RightPanel
            isTracing={isTracing}
            isInitializing={isInitializing}
            error={error}
            energyStats={energyStats}
            onRunTracer={handleRunTracer}
            onStop={handleStopTracer}
          />
        </aside>
      </div>
    </div>
  );
}
