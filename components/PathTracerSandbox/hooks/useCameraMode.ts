import { useCallback, useEffect } from "react";
import type { RefObject } from "react";
import type { CameraMode, OrthoView, SceneRefs } from "../types";

/**
 * Repositions/reconfigures the perspective vs. orthographic cameras whenever
 * `cameraMode` or `orthoView` changes, and keeps `cameraModeRef` in sync so
 * the render loop (which reads the ref, not React state) picks it up.
 */
export function useCameraMode(
  sceneRef: RefObject<SceneRefs | null>,
  cameraModeRef: RefObject<CameraMode>,
  cameraMode: CameraMode,
  orthoView: OrthoView
) {
  const switchCamera = useCallback(
    (mode: CameraMode, view: OrthoView = "front") => {
      const refs = sceneRef.current;
      if (!refs) return;

      const { perspCamera, orthoCamera, orbitControls, transformControls } =
        refs;

      // Sync the mutable ref so the animation loop picks up the change
      cameraModeRef.current = mode;

      if (mode === "perspective") {
        orbitControls.object = perspCamera;
        orbitControls.enableRotate = true;
        orbitControls.target.set(0, 1, 0);
        orbitControls.update();
        transformControls.camera = perspCamera;
      } else {
        // Position ortho camera for selected view
        if (view === "front") {
          orthoCamera.position.set(0, 1, 15);
          orthoCamera.up.set(0, 1, 0);
          orbitControls.target.set(0, 1, 0);
        } else {
          // top
          orthoCamera.position.set(0, 15, 0);
          orthoCamera.up.set(0, 0, -1);
          orbitControls.target.set(0, 0, 0);
        }
        orthoCamera.lookAt(orbitControls.target);
        orthoCamera.updateProjectionMatrix();

        orbitControls.object = orthoCamera;
        orbitControls.enableRotate = false;
        orbitControls.update();
        transformControls.camera = orthoCamera;
      }
    },
    [sceneRef, cameraModeRef]
  );

  useEffect(() => {
    switchCamera(cameraMode, orthoView);
  }, [cameraMode, orthoView, switchCamera]);
}
