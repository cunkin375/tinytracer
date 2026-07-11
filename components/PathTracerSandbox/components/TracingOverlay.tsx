export function TracingOverlay() {
  return (
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
        Computing light transport across the scene. This may take a moment…
      </p>

      <div className="mt-6 flex items-center gap-2">
        <div
          className="w-32 h-1 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)",
              animation: "indeterminate 1.5s ease-in-out infinite",
              width: "40%",
            }}
          />
        </div>
      </div>
    </div>
  );
}
