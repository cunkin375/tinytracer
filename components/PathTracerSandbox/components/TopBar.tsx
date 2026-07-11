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
        {/* Logo / Title */}
        <div className="pointer-events-auto flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
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
          onClick={onRunTracer}
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
  );
}
