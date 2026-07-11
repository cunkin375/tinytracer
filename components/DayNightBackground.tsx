import "./DayNightBackground.css";

/**
 * Looping day/night cycle: the sun arcs from the left horizon to the right,
 * the sky crossfades night -> sunrise -> day -> sunset -> night, and a
 * ground-mounted solar panel brightens and glows in step with the sun's
 * height. Pure CSS keyframes (no JS/canvas) so every layer stays phase-locked
 * for free — they all share one animation duration and start together.
 */
export function DayNightBackground() {
  return (
    <div className="dnb absolute inset-0 overflow-hidden">
      <div className="dnb-sky dnb-sky-night" />
      <div className="dnb-sky dnb-sky-day" />
      <div className="dnb-sky dnb-sky-horizon" />
      <div className="dnb-stars" />
      <div className="dnb-sun" />
      <div className="dnb-ground" />
      <div className="dnb-panel">
        <div className="dnb-panel-glow" />
        <div className="dnb-panel-pole" />
        <div className="dnb-panel-face" />
      </div>
    </div>
  );
}
