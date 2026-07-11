import type { CameraMode, OrthoView, TransformMode } from "../types";
import { ToolButton } from "./ToolButton";

export function LeftPanel({
  cameraMode,
  orthoView,
  onToggleCamera,
  onToggleOrthoView,
  onSetTransformMode,
}: {
  cameraMode: CameraMode;
  orthoView: OrthoView;
  onToggleCamera: () => void;
  onToggleOrthoView: () => void;
  onSetTransformMode: (mode: TransformMode) => void;
}) {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-auto">
      <div
        className="flex flex-col gap-1 rounded-2xl p-2"
        style={{
          background: "rgba(18, 18, 26, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(35, 83, 56, 0.45)",
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
          onClick={onToggleCamera}
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
            onClick={onToggleOrthoView}
          >
            <span className="text-[10px] font-bold tracking-wider">
              {orthoView === "front" ? "F" : "T"}
            </span>
          </ToolButton>
        )}

        {/* Separator */}
        <div className="w-6 mx-auto my-1 border-t border-[#235338]/40" />

        {/* Transform mode buttons */}
        <ToolButton
          id="btn-translate"
          tooltip="Move (G)"
          active={false}
          onClick={() => onSetTransformMode("translate")}
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
          onClick={() => onSetTransformMode("rotate")}
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
          onClick={() => onSetTransformMode("scale")}
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
  );
}
