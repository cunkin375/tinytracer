import { MAX_TREE_COUNT } from "../constants";
import type { SunSettings } from "../types";

/**
 * Left sidebar — the scene controls the main app exposes: the sun (direction,
 * colour, intensity) that both the WebGL preview and the path tracer read,
 * plus tree density (see useThreeScene.ts).
 */
export function SceneControls({
  sun,
  onChange,
  treeCount,
  onTreeCountChange,
  disabled = false,
}: {
  sun: SunSettings;
  onChange: (next: SunSettings) => void;
  treeCount: number;
  onTreeCountChange: (count: number) => void;
  /** Locks every control — the scene is frozen while a trace is showing. */
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-6 transition-opacity ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      <div>
        <h2 className="text-[10px] font-semibold tracking-wide uppercase text-white/40 mb-3">
          Sun
        </h2>
        <div className="flex flex-col gap-3">
          <Slider
            label="Azimuth"
            value={sun.azimuth}
            min={0}
            max={360}
            step={1}
            unit="°"
            disabled={disabled}
            onChange={(azimuth) => onChange({ ...sun, azimuth })}
          />
          <Slider
            label="Elevation"
            value={sun.elevation}
            min={0}
            max={90}
            step={1}
            unit="°"
            disabled={disabled}
            onChange={(elevation) => onChange({ ...sun, elevation })}
          />
          <Slider
            label="Intensity"
            value={sun.intensity}
            min={0}
            max={5}
            step={0.05}
            disabled={disabled}
            onChange={(intensity) => onChange({ ...sun, intensity })}
          />

          <label className="flex items-center justify-between">
            <span className="text-[11px] text-white/60 tracking-wide">Color</span>
            <input
              type="color"
              value={sun.color}
              disabled={disabled}
              onChange={(e) => onChange({ ...sun, color: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer bg-transparent border border-white/15"
            />
          </label>
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <h2 className="text-[10px] font-semibold tracking-wide uppercase text-white/40 mb-3">
          Trees
        </h2>
        <Slider
          label="Count"
          value={treeCount}
          min={0}
          max={MAX_TREE_COUNT}
          step={1}
          disabled={disabled}
          onChange={onTreeCountChange}
        />
      </div>
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
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
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
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#74c311]"
      />
    </label>
  );
}
