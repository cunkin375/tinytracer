import type { RefObject } from "react";

/**
 * Full-screen WebGPU output overlay. The <canvas> is always mounted (so it has
 * a layout size available when WebGPU initializes on the first Run) but stays
 * transparent and click-through until a trace is active.
 */
export function PathTracerOutput({
  canvasRef,
  isTracing,
  isInitializing,
  error,
  onStop,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isTracing: boolean;
  isInitializing: boolean;
  error: string | null;
  onStop: () => void;
}) {
  return (
    <>
      {/* Output canvas — the compute shader writes directly into this. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full transition-opacity duration-300"
        style={{
          zIndex: 40,
          opacity: isTracing ? 1 : 0,
          pointerEvents: isTracing ? "auto" : "none",
        }}
      />

      {/* Initialization spinner (first Run only). */}
      {isTracing && isInitializing && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            zIndex: 50,
            background: "rgba(10, 10, 15, 0.8)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="w-16 h-16 rounded-full mb-6"
            style={{
              border: "2px solid rgba(116, 195, 17, 0.2)",
              borderTopColor: "#74c311",
              animation: "spin-slow 1s linear infinite",
            }}
          />
          <h2 className="text-lg font-semibold text-white/90 tracking-tight mb-2">
            Initializing WebGPU
          </h2>
          <p className="text-sm text-white/40 max-w-xs text-center">
            Compiling the path-tracing pipeline…
          </p>
        </div>
      )}

      {/* Error surface. */}
      {isTracing && error && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-6"
          style={{ zIndex: 50, background: "rgba(10, 10, 15, 0.85)" }}
        >
          <h2 className="text-lg font-semibold text-red-300 tracking-tight mb-2">
            Path Tracer Error
          </h2>
          <p className="text-sm text-white/50 max-w-md text-center">{error}</p>
        </div>
      )}

      {/* Stop / Cancel — returns to the sandbox. */}
      {isTracing && (
        <button
          id="btn-stop-tracer"
          onClick={onStop}
          className="absolute top-4 right-5 px-5 py-2.5 rounded-xl text-sm font-medium
            transition-all duration-200 cursor-pointer"
          style={{
            zIndex: 60,
            background: "rgba(18, 18, 26, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(220, 80, 80, 0.5)",
            color: "white",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          ■ Stop
        </button>
      )}
    </>
  );
}
