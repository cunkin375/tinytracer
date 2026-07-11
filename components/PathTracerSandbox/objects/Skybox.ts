import * as THREE from "three";

const SKYBOX_TEXTURE_URL = "/skybox-texture.png";
const SKYBOX_RADIUS = 90;
const SKYBOX_HORIZONTAL_REPEAT = 5;

let cachedTexture: THREE.Texture | null = null;
const loader = new THREE.TextureLoader();

/** Must resolve before createSkybox() is called (see useThreeScene.ts). */
export async function preloadSkyboxTexture(): Promise<THREE.Texture> {
  if (cachedTexture) return cachedTexture;

  const texture = await loader.loadAsync(SKYBOX_TEXTURE_URL);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The source image is a single landscape painting, not a full 360°
  // panorama, so it's tiled horizontally around the sphere instead.
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = SKYBOX_HORIZONTAL_REPEAT;
  cachedTexture = texture;
  return texture;
}

/**
 * A large inward-facing sphere painted with the skybox texture, repeated
 * SKYBOX_HORIZONTAL_REPEAT times around the equator. Excluded from
 * `selectables` (it's a backdrop, not an interactive object).
 *
 * A full sphere has no open rim like the old cylinder did, but its UVs still
 * pinch at the poles — `fitSkyboxToTerrain` (see terrain.ts) keeps it
 * vertically centered on the terrain rather than resting a pole at the
 * ground, so the camera stays near the clean equatorial band.
 */
export function createSkybox(): THREE.Mesh {
  const texture = cachedTexture;
  if (!texture) {
    throw new Error(
      "Skybox texture not preloaded — call preloadSkyboxTexture() first."
    );
  }

  const geometry = new THREE.SphereGeometry(SKYBOX_RADIUS, 60, 40);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Skybox";
  return mesh;
}
