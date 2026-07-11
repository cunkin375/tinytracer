import type { SunSettings } from "../types";

/**
 * Floating control panel for the scene's sun (directional light). Adjusts the
 * direction (azimuth / elevation), colour, and intensity that both the WebGL
 * preview and the path tracer read. Collapsed to a single button until opened.
 */
export function SunPanel({
  sun,
  open,
  onToggle,
  onChange,
}: {
  sun: SunSettings;
  open: boolean;
  onToggle: () => void;
  onChange: (next: SunSettings) => void;
}) {
  const panelStyle = {
    background: "rgba(18, 18, 26, 0.85)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(35, 83, 56, 0.45)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  } as const;

  return (
    <div className="absolute right-4 top-20 z-10 pointer-events-auto">
      {!open ? (
        <button
          onClick={onToggle}
          title="Sun settings"
          className="flex items-center justify-center w-10 h-10 rounded-xl text-white/80 hover:text-white transition-colors"
          style={panelStyle}
        >
          <SunIcon />
        </button>
      ) : (
        <div className="w-60 rounded-2xl p-4 flex flex-col gap-3" style={panelStyle}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/90">
              <SunIcon />
              <span className="text-xs font-semibold tracking-wide uppercase">
                Sun
              </span>
            </div>
            <button
              onClick={onToggle}
              title="Close"
              className="text-white/50 hover:text-white text-sm leading-none"
            >
              ✕
            </button>
          </div>

          <Slider
            label="Azimuth"
            value={sun.azimuth}
            min={0}
            max={360}
            step={1}
            unit="°"
            onChange={(azimuth) => onChange({ ...sun, azimuth })}
          />
          <Slider
            label="Elevation"
            value={sun.elevation}
            min={0}
            max={90}
            step={1}
            unit="°"
            onChange={(elevation) => onChange({ ...sun, elevation })}
          />
          <Slider
            label="Intensity"
            value={sun.intensity}
            min={0}
            max={5}
            step={0.05}
            onChange={(intensity) => onChange({ ...sun, intensity })}
          />

          <label className="flex items-center justify-between">
            <span className="text-[11px] text-white/60 tracking-wide">Color</span>
            <input
              type="color"
              value={sun.color}
              onChange={(e) => onChange({ ...sun, color: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer bg-transparent border border-white/15"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/60 tracking-wide">{label}</span>
        <span className="text-[11px] text-white/80 tabular-nums">
          {step < 1 ? value.toFixed(2) : Math.round(value)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#74c311]"
      />
    </label>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
