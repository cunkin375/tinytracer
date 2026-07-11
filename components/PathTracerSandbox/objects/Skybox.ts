import * as THREE from "three";

const SKYBOX_TEXTURE_URL = "/skybox-texture.png";
const SKYBOX_RADIUS = 90;
const SKYBOX_HEIGHT = 90;
const SKYBOX_HORIZONTAL_REPEAT = 4;

let cachedTexture: THREE.Texture | null = null;
const loader = new THREE.TextureLoader();

/** Must resolve before createSkybox() is called (see useThreeScene.ts). */
export async function preloadSkyboxTexture(): Promise<THREE.Texture> {
  if (cachedTexture) return cachedTexture;

  const texture = await loader.loadAsync(SKYBOX_TEXTURE_URL);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The source image is a single landscape painting, not a full 360°
  // panorama, so it's tiled horizontally around the cylinder instead.
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = SKYBOX_HORIZONTAL_REPEAT;
  cachedTexture = texture;
  return texture;
}

/**
 * A large inward-facing cylinder painted with the skybox texture. Excluded
 * from fog (it represents background/infinity, not scene geometry) and
 * from `selectables` (it's a backdrop, not an interactive object).
 *
 * Open-ended (no top/bottom caps) — there's no real zenith/nadir to show for
 * this texture anyway, and it avoids cap UV distortion. `alignSkyboxToTerrain`
 * (see terrain.ts) repositions it vertically once a terrain is loaded.
 */
export function createSkybox(): THREE.Mesh {
  const texture = cachedTexture;
  if (!texture) {
    throw new Error(
      "Skybox texture not preloaded — call preloadSkyboxTexture() first."
    );
  }

  const geometry = new THREE.CylinderGeometry(
    SKYBOX_RADIUS,
    SKYBOX_RADIUS,
    SKYBOX_HEIGHT,
    60,
    1,
    true
  );
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Skybox";
  return mesh;
}
