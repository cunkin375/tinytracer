// Placeholder figures — a real reading will eventually come from the traced
// scene (panel orientation vs. sun position, irradiance, etc.).
const PLACEHOLDER_STATS = {
  efficiencyPct: 87,
  generatedKwhPerDay: 4.2,
  savedDollarsPerMonth: 18.5,
};

/**
 * Floating readout shown alongside a traced result. Surfaces the solar
 * panel's performance for the current scene/sun setup.
 */
export function EnergyStatsPanel() {
  const panelStyle = {
    background: "rgba(18, 18, 26, 0.85)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(35, 83, 56, 0.45)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  } as const;

  return (
    <div
      className="absolute right-4 top-20 z-50 w-60 rounded-2xl p-4 flex flex-col gap-3 pointer-events-auto"
      style={panelStyle}
    >
      <div className="flex items-center gap-2 text-white/90">
        <BoltIcon />
        <span className="text-xs font-semibold tracking-wide uppercase">
          Energy
        </span>
      </div>

      <Stat
        label="Energy efficiency"
        value={`${PLACEHOLDER_STATS.efficiencyPct}%`}
      />
      <Stat
        label="Energy generated"
        value={`${PLACEHOLDER_STATS.generatedKwhPerDay} kWh/day`}
      />
      <Stat
        label="Money saved"
        value={`$${PLACEHOLDER_STATS.savedDollarsPerMonth}/mo`}
      />
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

function BoltIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}
