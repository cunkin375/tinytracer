import type { EnergyStats } from "@/lib/energy";

/**
 * Right sidebar — the path tracer's render control and, once a trace is
 * showing, the energy readout computed from it.
 */
export function RightPanel({
  isTracing,
  isInitializing,
  error,
  energyStats,
  onRunTracer,
  onStop,
}: {
  isTracing: boolean;
  isInitializing: boolean;
  error: string | null;
  energyStats: EnergyStats | null;
  onRunTracer: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {!isTracing ? (
        <button
          id="btn-run-tracer"
          onClick={onRunTracer}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #74c311 0%, #235338 100%)",
            color: "white",
            boxShadow: "0 0 20px rgba(116, 195, 17, 0.35), 0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          ▶ Run Path Tracer
        </button>
      ) : (
        <button
          id="btn-stop-tracer"
          onClick={onStop}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(220, 80, 80, 0.5)",
            color: "white",
          }}
        >
          ■ Stop
        </button>
      )}

      {!isTracing ? (
        <div>
          <h2 className="text-[10px] font-semibold tracking-wide uppercase text-white/40 mb-3">
            Instructions
          </h2>
          <ol className="list-decimal list-inside text-[12px] text-white/50 leading-relaxed space-y-2">
            <li>
              <span className="text-white/70 font-medium">Look around</span> —
              drag with the mouse to orbit the scene.
            </li>
            <li>
              <span className="text-white/70 font-medium">Place the panel</span>{" "}
              — select the solar panel and move it to a spot you like.
            </li>
            <li>
              <span className="text-white/70 font-medium">Set the conditions</span>{" "}
              — adjust the world stats to match what you want to test.
            </li>
            <li>
              <span className="text-white/70 font-medium">Run the simulation</span>{" "}
              — hit "Run Path Tracer" above to render the scene.
            </li>
            <li>
              <span className="text-white/70 font-medium">Check the results</span>{" "}
              — your panel's energy stats will appear here once the render
              finishes.
            </li>
          </ol>
        </div>
      ) : (
        <div>
          <h2 className="text-[10px] font-semibold tracking-wide uppercase text-white/40 mb-3">
            Energy
          </h2>

          {!isInitializing && !error && energyStats ? (
            <div className="flex flex-col gap-3">
              <Stat
                label="Energy efficiency"
                value={`${energyStats.efficiencyPct}%`}
              />
              <Stat
                label="Energy generated"
                value={`${energyStats.generatedKwhPerDay} kWh/day`}
              />
              <Stat
                label="Money saved"
                value={`$${energyStats.savedDollarsPerMonth}/mo`}
              />
            </div>
          ) : (
            <p className="text-[12px] text-white/30 leading-relaxed">
              {error ? "Rendering failed." : "Rendering…"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-white/60 tracking-wide">{label}</span>
      <span className="text-[13px] text-white/90 font-medium tabular-nums">
        {value}
      </span>
    </div>
  );
}
