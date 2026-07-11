import { SPHERE_CONFIGS } from "../constants";
import { Sphere } from "./Sphere";

/** Builds the sandbox's default sphere set from `SPHERE_CONFIGS`. */
export function createSceneSpheres(): Sphere[] {
  return SPHERE_CONFIGS.map(
    (config, i) => new Sphere({ ...config, name: `Sphere ${i + 1}` })
  );
}
