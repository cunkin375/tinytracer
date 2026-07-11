import { PYRAMID_CONFIGS } from "../constants";
import { Pyramid } from "./Pyramid";

/** Builds the sandbox's default pyramid set from `PYRAMID_CONFIGS`. */
export function createScenePyramids(): Pyramid[] {
  return PYRAMID_CONFIGS.map(
    (config, i) => new Pyramid({ ...config, name: `Pyramid ${i + 1}` })
  );
}
