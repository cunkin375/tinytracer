import { BrandButton } from "@/components/BrandButton";

export function TopBar({
  isTracing,
  onRunTracer,
}: {
  isTracing: boolean;
  onRunTracer: () => void;
}) {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      <div className="flex items-center justify-between px-5 py-4">
        {/* Logo / Title — back to the landing page */}
        <BrandButton label="forest" />

        {/* Run button */}
        <button
          id="btn-run-tracer"
          onClick={onRunTracer}
          disabled={isTracing}
          className="pointer-events-auto px-5 py-2.5 rounded-xl text-sm font-medium
            transition-all duration-300 cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: isTracing
              ? "rgba(116, 195, 17, 0.25)"
              : "linear-gradient(135deg, #74c311 0%, #235338 100%)",
            color: "white",
            boxShadow: isTracing
              ? "none"
              : "0 0 20px rgba(116, 195, 17, 0.35), 0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {isTracing ? "Tracing…" : "▶ Run Path Tracer"}
        </button>
      </div>
    </div>
  );
}
