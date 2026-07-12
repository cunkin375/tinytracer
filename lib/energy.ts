import type { PanelStats } from "./webgpu/renderer";

// ============================================================================
// TinyTracer – Solar Panel Energy Model
//
// Converts the path tracer's raw ray-hit statistics for the panel's top face
// (see PanelStats / compute.wgsl's panel_stats buffer) into the "Energy"
// readout shown in RightPanel. The scene itself has no real-world scale (an
// "Earth" of radius 15 units, a sun intensity slider from 0-5, etc.), so
// these constants calibrate the readout to plausible household-solar figures
// rather than being derived from the scene's arbitrary units.
// ============================================================================

/** Must match COS_SCALE in compute.wgsl — the fixed-point scale the shader
 *  uses to sum cos_theta values atomically. */
const COS_SCALE = 10;

/** Standard test-condition irradiance (AM1.5, full unobstructed sun), W/m². */
const STC_IRRADIANCE_WM2 = 1000;

/** Area of a typical residential solar panel, m². */
const PANEL_AREA_M2 = 1.7;

/** Panel conversion efficiency (fraction of incident light turned into
 *  electricity) for a typical monocrystalline panel at STC. */
const PANEL_CONVERSION_EFFICIENCY = 0.2;

/** Average U.S. residential electricity price, $/kWh. */
const ELECTRICITY_PRICE_PER_KWH = 0.15;

/** Peak-sun-hours-per-day model: a single traced frame captures one sun
 *  position/intensity, so the daily estimate scales that instant's
 *  irradiance by the industry-standard "peak sun hours" simplification
 *  (average full-equivalent-sun hours per day used by most solar
 *  calculators) rather than integrating a full day/night cycle. */
const PEAK_SUN_HOURS_PER_DAY = 5;

const DAYS_PER_MONTH = 30;

export interface EnergyStats {
  /** How much of the panel's potential irradiance it's actually capturing right now, 0-100. */
  efficiencyPct: number;
  generatedKwhPerDay: number;
  savedDollarsPerMonth: number;
}

const ZERO_ENERGY_STATS: EnergyStats = {
  efficiencyPct: 0,
  generatedKwhPerDay: 0,
  savedDollarsPerMonth: 0,
};

/**
 * Turn the path tracer's panel ray-hit counts into an energy readout.
 *
 * `sunlitFraction` (litHits / totalHits) captures how much of the panel is
 * unshadowed and facing the sun at all; `avgCosTheta` (the average incidence
 * angle among the lit hits) captures how directly the sunlit portion faces
 * it. Their product is the panel's current irradiance-capture efficiency —
 * 1.0 only when the whole panel is unoccluded and pointed straight at the
 * sun, exactly as `PLACEHOLDER_STATS` was standing in for before.
 */
export function computeEnergyStats(
  stats: PanelStats,
  sunIntensity: number
): EnergyStats {
  if (stats.totalHits === 0 || sunIntensity <= 0) {
    return ZERO_ENERGY_STATS;
  }

  const sunlitFraction = stats.litHits / stats.totalHits;
  const avgCosTheta =
    stats.litHits > 0
      ? stats.cosThetaSumScaled / COS_SCALE / stats.litHits
      : 0;
  const efficiency = sunlitFraction * avgCosTheta;

  const irradianceWm2 = STC_IRRADIANCE_WM2 * sunIntensity;
  const powerOutputWatts =
    irradianceWm2 * PANEL_AREA_M2 * PANEL_CONVERSION_EFFICIENCY * efficiency;

  const generatedKwhPerDay =
    (powerOutputWatts / 1000) * PEAK_SUN_HOURS_PER_DAY;
  const savedDollarsPerMonth =
    generatedKwhPerDay * DAYS_PER_MONTH * ELECTRICITY_PRICE_PER_KWH;

  return {
    efficiencyPct: Math.round(efficiency * 100),
    generatedKwhPerDay: Math.round(generatedKwhPerDay * 10) / 10,
    savedDollarsPerMonth: Math.round(savedDollarsPerMonth * 100) / 100,
  };
}
