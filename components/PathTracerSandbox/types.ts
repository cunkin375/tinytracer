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
}
