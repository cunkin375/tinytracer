import * as THREE from "three";
import type { SunSettings } from "./types";

/** Distance the sun is placed from the origin when positioned from angles. */
export const SUN_DISTANCE = 12;

/** Initial sun angles/colour, matching the light's default position (5, 8, 4). */
export const DEFAULT_SUN: SunSettings = {
  azimuth: 51,
  elevation: 51,
  intensity: 1.8,
  color: "#fff4e6",
};

/**
 * Imperatively push {@link SunSettings} onto a Three.js directional light:
 * position from azimuth/elevation on a fixed-radius sphere, plus colour and
 * intensity. Kept out of the React hook body so the mutation isn't flagged by
 * the `react-hooks/immutability` rule (the light is reachable from a ref).
 */
export function applySunSettings(
  light: THREE.DirectionalLight,
  sun: SunSettings
): void {
  const el = (sun.elevation * Math.PI) / 180;
  const az = (sun.azimuth * Math.PI) / 180;

  light.position.set(
    SUN_DISTANCE * Math.cos(el) * Math.sin(az),
    SUN_DISTANCE * Math.sin(el),
    SUN_DISTANCE * Math.cos(el) * Math.cos(az)
  );
  light.target.position.set(0, 0, 0);
  light.color.set(sun.color);
  light.intensity = sun.intensity;
}
