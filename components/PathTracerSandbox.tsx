"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

type CameraMode = "perspective" | "orthographic";
type OrthoView = "front" | "top";

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  perspCamera: THREE.PerspectiveCamera;
  orthoCamera: THREE.OrthographicCamera;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  animFrameId: number;
  selectables: THREE.Mesh[];
  selectedObject: THREE.Mesh | null;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SPHERE_CONFIGS = [
  { position: [-2, 0.7, 0] as const, radius: 0.7, color: 0x6366f1 },
  { position: [0, 1, 1.5] as const, radius: 1, color: 0xf472b6 },
  { position: [2.5, 0.5, -1] as const, radius: 0.5, color: 0x34d399 },
];

const ORTHO_FRUSTUM_SIZE = 8;

// ─── Component ─────────────────────────────────────────────────────────────────

export default function PathTracerSandbox() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const cameraModeRef = useRef<CameraMode>("perspective");

  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective");
  const [orthoView, setOrthoView] = useState<OrthoView>("front");
  const [isTracing, setIsTracing] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // ── Scene Initialization ───────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12121a);
    scene.fog = new THREE.Fog(0x12121a, 20, 50);

    // ── Cameras ────────────────────────────────────────────────────────────

    const perspCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    perspCamera.position.set(6, 5, 8);
    perspCamera.lookAt(0, 0, 0);

    const orthoHalfH = ORTHO_FRUSTUM_SIZE / 2;
    const orthoHalfW = orthoHalfH * aspect;
    const orthoCamera = new THREE.OrthographicCamera(
      -orthoHalfW,
      orthoHalfW,
      orthoHalfH,
      -orthoHalfH,
      0.1,
      100
    );
    orthoCamera.position.set(0, 0, 15); // default: front view
    orthoCamera.lookAt(0, 0, 0);

    // ── Lighting ───────────────────────────────────────────────────────────

    const ambientLight = new THREE.AmbientLight(0xc8c0e8, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.8);
    dirLight.position.set(5, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xa5b4fc, 0.4);
    fillLight.position.set(-4, 3, -2);
    scene.add(fillLight);

    // ── Ground Plane ───────────────────────────────────────────────────────

    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.85,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(30, 30, 0x2a2a4a, 0x1e1e38);
    grid.position.y = 0.005;
    scene.add(grid);

    // ── Spheres ────────────────────────────────────────────────────────────

    const selectables: THREE.Mesh[] = [];

    SPHERE_CONFIGS.forEach(({ position, radius, color }, i) => {
      const geo = new THREE.SphereGeometry(radius, 64, 64);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `Sphere ${i + 1}`;
      scene.add(mesh);
      selectables.push(mesh);
    });

    // ── Controls ───────────────────────────────────────────────────────────

    const orbitControls = new OrbitControls(
      perspCamera,
      renderer.domElement
    );
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.minDistance = 2;
    orbitControls.maxDistance = 30;
    orbitControls.target.set(0, 1, 0);

    const transformControls = new TransformControls(
      perspCamera,
      renderer.domElement
    );
    scene.add(transformControls.getHelper());

    // Disable orbit while dragging with transform
    transformControls.addEventListener("dragging-changed", (event) => {
      orbitControls.enabled = !event.value;
    });

    // ── Raycaster for selection ────────────────────────────────────────────

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerDown = (event: PointerEvent) => {
      // Don't select if transform is active-dragging
      if (transformControls.dragging) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Use the ref to avoid stale closure over cameraMode
      const cam =
        cameraModeRef.current === "perspective" ? perspCamera : orthoCamera;
      raycaster.setFromCamera(pointer, cam);

      const hits = raycaster.intersectObjects(selectables, false);
      if (hits.length > 0) {
        const hit = hits[0].object as THREE.Mesh;
        transformControls.attach(hit);
        if (sceneRef.current) sceneRef.current.selectedObject = hit;
        setSelectedName(hit.name);
      } else {
        transformControls.detach();
        if (sceneRef.current) sceneRef.current.selectedObject = null;
        setSelectedName(null);
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // ── Animation Loop ─────────────────────────────────────────────────────

    let animFrameId = 0;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);

      orbitControls.update();
      const cam =
        cameraModeRef.current === "perspective"
          ? perspCamera
          : orthoCamera;
      renderer.render(scene, cam);
    };

    // ── Resize Handler ─────────────────────────────────────────────────────

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const a = w / h;

      renderer.setSize(w, h);

      perspCamera.aspect = a;
      perspCamera.updateProjectionMatrix();

      const halfH = ORTHO_FRUSTUM_SIZE / 2;
      const halfW = halfH * a;
      orthoCamera.left = -halfW;
      orthoCamera.right = halfW;
      orthoCamera.top = halfH;
      orthoCamera.bottom = -halfH;
      orthoCamera.updateProjectionMatrix();
    };

    window.addEventListener("resize", onResize);

    // ── Store refs ──────────────────────────────────────────────────────────

    sceneRef.current = {
      renderer,
      scene,
      perspCamera,
      orthoCamera,
      orbitControls,
      transformControls,
      animFrameId,
      selectables,
      selectedObject: null,
      raycaster,
      pointer,
    };

    animate();

    // ── Cleanup ────────────────────────────────────────────────────────────

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);

      transformControls.detach();
      transformControls.dispose();
      orbitControls.dispose();

      // Dispose geometries & materials
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Camera Mode Switching ──────────────────────────────────────────────────

  const switchCamera = useCallback(
    (mode: CameraMode, view: OrthoView = "front") => {
      const refs = sceneRef.current;
      if (!refs) return;

      const {
        perspCamera,
        orthoCamera,
        orbitControls,
        transformControls,
      } = refs;

      // Sync the mutable ref so the animation loop picks up the change
      cameraModeRef.current = mode;

      if (mode === "perspective") {
        orbitControls.object = perspCamera;
        orbitControls.enableRotate = true;
        orbitControls.target.set(0, 1, 0);
        orbitControls.update();
        transformControls.camera = perspCamera;
      } else {
        // Position ortho camera for selected view
        if (view === "front") {
          orthoCamera.position.set(0, 1, 15);
          orthoCamera.up.set(0, 1, 0);
          orbitControls.target.set(0, 1, 0);
        } else {
          // top
          orthoCamera.position.set(0, 15, 0);
          orthoCamera.up.set(0, 0, -1);
          orbitControls.target.set(0, 0, 0);
        }
        orthoCamera.lookAt(orbitControls.target);
        orthoCamera.updateProjectionMatrix();

        orbitControls.object = orthoCamera;
        orbitControls.enableRotate = false;
        orbitControls.update();
        transformControls.camera = orthoCamera;
      }
    },
    []
  );

  // Sync camera mode changes
  useEffect(() => {
    switchCamera(cameraMode, orthoView);
  }, [cameraMode, orthoView, switchCamera]);

  // ── Run Path Tracer (simulated) ────────────────────────────────────────────

  const handleRunTracer = useCallback(() => {
    setIsTracing(true);
    setTimeout(() => {
      setIsTracing(false);
    }, 3000);
  }, []);

  // ── Toggle camera mode handler ─────────────────────────────────────────────

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

  // ── Transform mode shortcuts ───────────────────────────────────────────────

  const setTransformMode = useCallback(
    (mode: "translate" | "rotate" | "scale") => {
      if (sceneRef.current?.transformControls) {
        sceneRef.current.transformControls.setMode(mode);
      }
    },
    []
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTracing) return;
      switch (e.key.toLowerCase()) {
        case "g":
          setTransformMode("translate");
          break;
        case "r":
          setTransformMode("rotate");
          break;
        case "s":
          setTransformMode("scale");
          break;
        case "escape":
          sceneRef.current?.transformControls.detach();
          setSelectedName(null);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTracing, setTransformMode]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full flex-1">
      {/* Three.js Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* ── UI Overlay ─────────────────────────────────────────────────── */}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between px-5 py-4">
          {/* Logo / Title */}
          <div className="pointer-events-auto flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <circle cx="8" cy="8" r="2.5" fill="white" opacity="0.9" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-white/90">
                TinyTracer
              </h1>
              <p className="text-[10px] text-white/40 tracking-wide uppercase">
                Scene Configurator
              </p>
            </div>
          </div>

          {/* Run button */}
          <button
            id="btn-run-tracer"
            onClick={handleRunTracer}
            disabled={isTracing}
            className="pointer-events-auto px-5 py-2.5 rounded-xl text-sm font-medium
              transition-all duration-300 cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isTracing
                ? "rgba(99, 102, 241, 0.3)"
                : "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              color: "white",
              boxShadow: isTracing
                ? "none"
                : "0 0 20px rgba(99, 102, 241, 0.3), 0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            {isTracing ? "Tracing…" : "▶ Run Path Tracer"}
          </button>
        </div>
      </div>

      {/* Left panel — Camera & Transform Controls */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-auto">
        <div
          className="flex flex-col gap-1 rounded-2xl p-2"
          style={{
            background: "rgba(18, 18, 26, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {/* Camera toggle */}
          <ToolButton
            id="btn-camera-toggle"
            tooltip={
              cameraMode === "perspective"
                ? "Switch to Orthographic"
                : "Switch to Perspective"
            }
            active={cameraMode === "orthographic"}
            onClick={handleToggleCamera}
          >
            {cameraMode === "perspective" ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2 12L12 2l10 10-10 10z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            )}
          </ToolButton>

          {/* Ortho view toggle (only in ortho mode) */}
          {cameraMode === "orthographic" && (
            <ToolButton
              id="btn-ortho-view"
              tooltip={orthoView === "front" ? "Top View" : "Front View"}
              active={false}
              onClick={handleOrthoViewToggle}
            >
              <span className="text-[10px] font-bold tracking-wider">
                {orthoView === "front" ? "F" : "T"}
              </span>
            </ToolButton>
          )}

          {/* Separator */}
          <div className="w-6 mx-auto my-1 border-t border-white/10" />

          {/* Transform mode buttons */}
          <ToolButton
            id="btn-translate"
            tooltip="Move (G)"
            active={false}
            onClick={() => setTransformMode("translate")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" />
            </svg>
          </ToolButton>

          <ToolButton
            id="btn-rotate"
            tooltip="Rotate (R)"
            active={false}
            onClick={() => setTransformMode("rotate")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 12a9 9 0 11-3.14-6.86" />
              <path d="M21 3v5h-5" />
            </svg>
          </ToolButton>

          <ToolButton
            id="btn-scale"
            tooltip="Scale (S)"
            active={false}
            onClick={() => setTransformMode("scale")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="4" y="4" width="6" height="6" />
              <rect x="14" y="14" width="6" height="6" />
              <path d="M10 7h4l3 3v4" />
            </svg>
          </ToolButton>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3 text-[11px] text-white/40">
            <span className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    cameraMode === "perspective" ? "#22c55e" : "#6366f1",
                }}
              />
              {cameraMode === "perspective"
                ? "Perspective"
                : `Ortho · ${orthoView === "front" ? "Front" : "Top"}`}
            </span>
            {selectedName && (
              <span className="text-white/60">
                ✦ {selectedName}
              </span>
            )}
          </div>
          <div className="text-[11px] text-white/30">
            G Move · R Rotate · S Scale · Esc Deselect
          </div>
        </div>
      </div>

      {/* ── Tracing Overlay ──────────────────────────────────────────── */}
      {isTracing && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center"
          style={{
            background: "rgba(10, 10, 15, 0.8)",
            backdropFilter: "blur(8px)",
            pointerEvents: "all",
            animation: "fade-in 0.3s ease-out",
          }}
        >
          {/* Spinner */}
          <div className="relative mb-8">
            <div
              className="w-16 h-16 rounded-full"
              style={{
                border: "2px solid rgba(99, 102, 241, 0.2)",
                borderTopColor: "#6366f1",
                animation: "spin-slow 1s linear infinite",
              }}
            />
            <div
              className="absolute inset-0 w-16 h-16 rounded-full"
              style={{
                border: "2px solid rgba(99, 102, 241, 0.15)",
                animation: "pulse-ring 1.5s ease-out infinite",
              }}
            />
          </div>

          <h2 className="text-lg font-semibold text-white/90 tracking-tight mb-2">
            Path Tracing in Progress
          </h2>
          <p className="text-sm text-white/40 max-w-xs text-center">
            Computing light transport across the scene. This may take a
            moment…
          </p>

          <div className="mt-6 flex items-center gap-2">
            <div
              className="w-32 h-1 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)",
                  animation: "indeterminate 1.5s ease-in-out infinite",
                  width: "40%",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Indeterminate progress bar animation injected via style tag */}
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

// ─── ToolButton Sub-component ──────────────────────────────────────────────────

function ToolButton({
  id,
  tooltip,
  active,
  onClick,
  children,
}: {
  id: string;
  tooltip: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      title={tooltip}
      onClick={onClick}
      className="relative w-10 h-10 rounded-xl flex items-center justify-center
        transition-all duration-200 cursor-pointer group"
      style={{
        background: active
          ? "rgba(99, 102, 241, 0.25)"
          : "transparent",
        color: active ? "#a5b4fc" : "rgba(255,255,255,0.5)",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.color = "rgba(255,255,255,0.8)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.5)";
        }
      }}
    >
      {children}
    </button>
  );
}
