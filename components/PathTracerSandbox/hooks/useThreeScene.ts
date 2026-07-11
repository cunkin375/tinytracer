import { useEffect } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { ORTHO_FRUSTUM_SIZE } from "../constants";
import { Cube } from "../objects/Cube";
import { Pyramid } from "../objects/Pyramid";
import { createSkybox, preloadSkyboxTexture } from "../objects/Skybox";
import { Sphere } from "../objects/Sphere";
import { createSceneCubes } from "../objects/sceneCubes";
import { createScenePyramids } from "../objects/scenePyramids";
import { createSceneSpheres } from "../objects/sceneSpheres";
import type { CameraMode, SceneRefs } from "../types";

/**
 * Builds the Three.js scene (renderer, cameras, lighting, spheres, controls,
 * selection raycasting) inside `containerRef` and drives the render loop.
 * Runs once on mount; all outputs are written into the shared `sceneRef`.
 */
export function useThreeScene(
  containerRef: RefObject<HTMLDivElement | null>,
  sceneRef: RefObject<SceneRefs | null>,
  cameraModeRef: RefObject<CameraMode>,
  onSelect: (name: string | null) => void,
  onReady: () => void
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Sphere/Cube/Pyramid geometry loads from static .obj files (see
    // objects/geometryLoader.ts) instead of being built procedurally, so
    // this effect can't finish synchronously — everything that constructs a
    // shape has to wait for the preload below. `cancelled` guards against
    // the component unmounting mid-load, and `cleanup` is populated once
    // the (still fully synchronous, once we get here) scene setup runs.
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      await Promise.all([
        Sphere.preload(),
        Cube.preload(),
        Pyramid.preload(),
        preloadSkyboxTexture(),
      ]);
      if (cancelled) return;

      const width = container.clientWidth;
      const height = container.clientHeight;
      const aspect = width / height;

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x12121a);
      scene.fog = new THREE.Fog(0x12121a, 20, 50);
      scene.add(createSkybox());

      // ── Cameras ──────────────────────────────────────────────────────────
      // far=200 gives headroom beyond the skybox sphere (radius 90) so it
      // never gets clipped as the camera orbits.

      const perspCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
      perspCamera.position.set(6, 5, 8);
      perspCamera.lookAt(0, 0, 0);

      const orthoHalfH = ORTHO_FRUSTUM_SIZE / 2;
      const orthoHalfW = orthoHalfH * aspect;
      const orthoCamera = new THREE.OrthographicCamera(
        -orthoHalfW,
        orthoHalfW,
        orthoHalfH,
        -orthoHalfH,
        0.1,
        200
      );
      orthoCamera.position.set(0, 0, 15); // default: front view
      orthoCamera.lookAt(0, 0, 0);

      // ── Lighting ─────────────────────────────────────────────────────────

      const ambientLight = new THREE.AmbientLight(0xc8c0e8, 0.6);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.8);
      dirLight.position.set(5, 8, 4);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 30;
      dirLight.shadow.camera.left = -10;
      dirLight.shadow.camera.right = 10;
      dirLight.shadow.camera.top = 10;
      dirLight.shadow.camera.bottom = -10;
      dirLight.shadow.bias = -0.001;
      scene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0xa5b4fc, 0.4);
      fillLight.position.set(-4, 3, -2);
      scene.add(fillLight);

      // ── Ground Plane ─────────────────────────────────────────────────────

      const groundGeo = new THREE.PlaneGeometry(30, 30);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.85,
        metalness: 0.1,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      // Grid
      const grid = new THREE.GridHelper(30, 30, 0x2a2a4a, 0x1e1e38);
      grid.position.y = 0.005;
      scene.add(grid);

      // ── Spheres ──────────────────────────────────────────────────────────

      const selectables: THREE.Mesh[] = [];

      createSceneSpheres().forEach((sphere) => {
        scene.add(sphere);
        selectables.push(sphere);
      });

      // ── Cubes ────────────────────────────────────────────────────────────

      createSceneCubes().forEach((cube) => {
        scene.add(cube);
        selectables.push(cube);
      });

      // ── Pyramids ─────────────────────────────────────────────────────────

      createScenePyramids().forEach((pyramid) => {
        scene.add(pyramid);
        selectables.push(pyramid);
      });




      new OBJLoader().load("/models/Tree.obj", (object) => {
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.20,
          metalness: 0.60,
        });
        scene.add(object);
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = material;
            child.castShadow = true;
            child.receiveShadow = true;
            selectables.push(child);
          }
        });
      });


      new OBJLoader().load("/models/Car.obj", (object) => {
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.20,
        metalness: 0.60,
      });
      // Rest the model's bottom on the floor regardless of how it was
      // positioned in the editor.
      const bounds = new THREE.Box3().setFromObject(object);
      object.position.y -= bounds.min.y;
      scene.add(object);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = material;
          child.castShadow = true;
          child.receiveShadow = true;
          selectables.push(child);
        }
      });
    });

      

      // ── Controls ─────────────────────────────────────────────────────────

      const orbitControls = new OrbitControls(perspCamera, renderer.domElement);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.08;
      orbitControls.minDistance = 2;
      orbitControls.maxDistance = 30;
      orbitControls.target.set(0, 1, 0);

      const transformControls = new TransformControls(
        perspCamera,
        renderer.domElement
      );
      scene.add(transformControls.getHelper());

      // Disable orbit while dragging with transform
      transformControls.addEventListener("dragging-changed", (event) => {
        orbitControls.enabled = !event.value;
      });

      // ── Raycaster for selection ─────────────────────────────────────────

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();

      const onPointerDown = (event: PointerEvent) => {
        // Don't select if transform is active-dragging
        if (transformControls.dragging) return;

        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Use the ref to avoid stale closure over cameraMode
        const cam =
          cameraModeRef.current === "perspective" ? perspCamera : orthoCamera;
        raycaster.setFromCamera(pointer, cam);

        const hits = raycaster.intersectObjects(selectables, false);
        if (hits.length > 0) {
          const hit = hits[0].object as THREE.Mesh;
          transformControls.attach(hit);
          if (sceneRef.current) sceneRef.current.selectedObject = hit;
          onSelect(hit.name);
        } else {
          transformControls.detach();
          if (sceneRef.current) sceneRef.current.selectedObject = null;
          onSelect(null);
        }
      };

      renderer.domElement.addEventListener("pointerdown", onPointerDown);

      // ── Animation Loop ───────────────────────────────────────────────────

      let animFrameId = 0;

      const animate = () => {
        animFrameId = requestAnimationFrame(animate);

        orbitControls.update();
        const cam =
          cameraModeRef.current === "perspective" ? perspCamera : orthoCamera;
        renderer.render(scene, cam);
      };

      // ── Resize Handler ───────────────────────────────────────────────────

      const onResize = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const a = w / h;

        renderer.setSize(w, h);

        perspCamera.aspect = a;
        perspCamera.updateProjectionMatrix();

        const halfH = ORTHO_FRUSTUM_SIZE / 2;
        const halfW = halfH * a;
        orthoCamera.left = -halfW;
        orthoCamera.right = halfW;
        orthoCamera.top = halfH;
        orthoCamera.bottom = -halfH;
        orthoCamera.updateProjectionMatrix();
      };

      window.addEventListener("resize", onResize);

      // ── Store refs ───────────────────────────────────────────────────────

      sceneRef.current = {
        renderer,
        scene,
        perspCamera,
        orthoCamera,
        orbitControls,
        transformControls,
        animFrameId,
        selectables,
        selectedObject: null,
        raycaster,
        pointer,
      };

      animate();
      onReady();

      // ── Cleanup ──────────────────────────────────────────────────────────

      cleanup = () => {
        cancelAnimationFrame(animFrameId);
        window.removeEventListener("resize", onResize);
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);

        transformControls.detach();
        transformControls.dispose();
        orbitControls.dispose();

        // Dispose geometries & materials. Sphere/Cube/Pyramid share a single
        // cached geometry per shape type, so the same geometry may be
        // disposed more than once here — that's a harmless no-op in
        // Three.js (it just releases GPU buffers, which get lazily
        // recreated if the cached geometry is reused after a remount).
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });

        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }

        sceneRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
