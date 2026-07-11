import type { CameraMode, OrthoView } from "../types";

export function BottomStatusBar({
  cameraMode,
  orthoView,
  selectedName,
}: {
  cameraMode: CameraMode;
  orthoView: OrthoView;
  selectedName: string | null;
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3 text-[11px] text-white/40">
          <span className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  cameraMode === "perspective" ? "#74c311" : "#8cb4d9",
              }}
            />
            {cameraMode === "perspective"
              ? "Perspective"
              : `Ortho · ${orthoView === "front" ? "Front" : "Top"}`}
          </span>
          {selectedName && (
            <span className="text-white/60">✦ {selectedName}</span>
          )}
        </div>
        <div className="text-[11px] text-white/30">
          G Move · R Rotate · S Scale · Esc Deselect
        </div>
      </div>
    </div>
  );
}
