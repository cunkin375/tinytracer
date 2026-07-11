import { CUBE_CONFIGS } from "../constants";
import { Cube } from "./Cube";

/** Builds the sandbox's default cube set from `CUBE_CONFIGS`. */
export function createSceneCubes(): Cube[] {
  return CUBE_CONFIGS.map(
    (config, i) => new Cube({ ...config, name: `Cube ${i + 1}` })
  );
}
