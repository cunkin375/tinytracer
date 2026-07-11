import { useEffect } from "react";
import type { RefObject } from "react";
import type { SceneRefs, TransformMode } from "../types";

/**
 * Wires G/R/S transform-mode shortcuts and Escape-to-deselect while the
 * tracer is idle (shortcuts are suppressed during a trace run).
 */
export function useKeyboardShortcuts(
  isTracing: boolean,
  sceneRef: RefObject<SceneRefs | null>,
  setTransformMode: (mode: TransformMode) => void,
  setSelectedName: (name: string | null) => void
) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTracing) return;
      switch (e.key.toLowerCase()) {
        case "g":
          setTransformMode("translate");
          break;
        case "r":
          setTransformMode("rotate");
          break;
        case "s":
          setTransformMode("scale");
          break;
        case "escape":
          sceneRef.current?.transformControls.detach();
          setSelectedName(null);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTracing, setTransformMode, sceneRef, setSelectedName]);
}
