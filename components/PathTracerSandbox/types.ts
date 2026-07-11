import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TransformControls } from "three/addons/controls/TransformControls.js";

export type CameraMode = "perspective" | "orthographic";
export type OrthoView = "front" | "top";
export type TransformMode = "translate" | "rotate" | "scale";

export interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  perspCamera: THREE.PerspectiveCamera;
  orthoCamera: THREE.OrthographicCamera;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  animFrameId: number;
  selectables: THREE.Mesh[];
  selectedObject: THREE.Mesh | null;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  /** Loads and places a new Car instance; the only object type addable/movable from the main app's UI. */
  addCar: () => void;
  /** Adds/removes trees to match `count`, driven by the tree-count slider. */
  setTreeCount: (count: number) => void;
  /** The directional light the path tracer treats as the sun. */
  sunLight: THREE.DirectionalLight;
}

/** User-adjustable sun parameters, surfaced in the sun control panel. */
export interface SunSettings {
  /** Compass angle in degrees (rotation around the vertical axis). */
  azimuth: number;
  /** Height above the horizon in degrees (0 = horizon, 90 = straight up). */
  elevation: number;
  /** Light intensity (irradiance). */
  intensity: number;
  /** Hex colour string, e.g. "#fff4e6". */
  color: string;
}
