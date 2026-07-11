import { useEffect } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { DEFAULT_TREE_COUNT, ORTHO_FRUSTUM_SIZE } from "../constants";
import { createSkybox, preloadSkyboxTexture } from "../objects/Skybox";
import { fitSkyboxToTerrain, snapObjectToTerrain } from "../objects/terrain";
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

    // The skybox texture loads asynchronously, so this effect can't finish
    // synchronously — everything waits for the preload below. `cancelled`
    // guards against the component unmounting mid-load, and `cleanup` is
    // populated once the (still fully synchronous, once we get here) scene
    // setup runs.
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      await preloadSkyboxTexture();
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
      // No fog: the skybox is the backdrop now, and fog was fading the
      // terrain to near-black at the same dark navy as empty space, making
      // it look like it was dissolving into a void.
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x12121a);
      const skybox = createSkybox();
      scene.add(skybox);

      // ── Cameras ──────────────────────────────────────────────────────────
      // far=200 gives headroom beyond the skybox's default size so it never
      // gets clipped as the camera orbits.

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

      // Created early (rest of the orbit/transform control wiring is further
      // down, with the rest of ── Controls ──) because the terrain registry
      // below needs it immediately: clamping how far the camera can climb
      // is part of keeping the skybox from ever showing its open top/bottom.
      const orbitControls = new OrbitControls(perspCamera, renderer.domElement);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.08;
      orbitControls.minDistance = 2;
      orbitControls.maxDistance = 30;
      orbitControls.target.set(0, 1, 0);

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
      // Doubles as a backstop for the terrain case: registerTerrain (below)
      // hides the grid lines and drops this plane below the terrain's
      // lowest point, so any camera ray that misses both the terrain and
      // the (open-ended, capless) skybox still lands on *something* instead
      // of the raw scene background — that gap was the "black void"/fog
      // look, not literal fog.

      const groundGeo = new THREE.PlaneGeometry(200, 200);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.85,
        metalness: 0.1,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const grid = new THREE.GridHelper(30, 30, 0x2a2a4a, 0x1e1e38);
      grid.position.y = 0.005;
      scene.add(grid);

      // ── Terrain registry ─────────────────────────────────────────────────
      // Objects can load in any order (Tree/Car/a Terrain all via async
      // .load() calls). Whichever terrain shows up first snaps everything
      // already registered onto its surface, levels/resizes the skybox, and
      // drops the ground below it; anything registered afterward snaps
      // immediately. `resnapAll` re-settles everyone if the terrain itself
      // is later moved/rotated/scaled.

      let terrainObject: THREE.Object3D | null = null;
      const registeredObjects: THREE.Object3D[] = [];

      const registerSceneObject = (object: THREE.Object3D) => {
        registeredObjects.push(object);
        if (terrainObject) snapObjectToTerrain(object, terrainObject);
      };

      // The skybox is a full sphere (see Skybox.ts) with no open rim to see
      // past, so the camera is free to orbit almost the full polar range —
      // just kept a hair short of the exact poles, where OrbitControls'
      // spherical-coordinate math is singular and can briefly flip the
      // camera's up vector.
      orbitControls.minPolarAngle = 0.01;
      orbitControls.maxPolarAngle = Math.PI - 0.01;

      const resnapAll = () => {
        if (!terrainObject) return;
        fitSkyboxToTerrain(skybox, terrainObject);
        const bounds = new THREE.Box3().setFromObject(terrainObject);
        ground.position.y = bounds.min.y - 0.1;
        registeredObjects.forEach((object) => snapObjectToTerrain(object, terrainObject!));
      };

      const registerTerrain = (terrain: THREE.Object3D) => {
        terrainObject = terrain;
        grid.visible = false;
        resnapAll();
      };

      // ── Scene objects ────────────────────────────────────────────────────

      const selectables: THREE.Mesh[] = [];

      // ── Trees: count is set directly by the tree-count slider (React UI) ──
      // via setTreeCount, not derived from the terrain's footprint —
      // rebalanceTreeCount only adds/removes the difference between the
      // current and target count, so trees that stay are never moved. Trees
      // aren't in `selectables`: nothing in the main app is movable except a
      // dropdown-added Car (see addCar below).

      const TREE_MIN_DISTANCE = 2.0;
      const MAX_PLACEMENT_ATTEMPTS = 300;
      const FALLBACK_PLACEMENT_RADIUS = 6; // used before any terrain exists

      let treeTemplate: THREE.Object3D | null = null;
      let treeCount = DEFAULT_TREE_COUNT;
      const placedTrees: { object: THREE.Object3D; xz: THREE.Vector2 }[] = [];

      const currentPlacementRadius = () => {
        if (!terrainObject) return FALLBACK_PLACEMENT_RADIUS;
        const bounds = new THREE.Box3().setFromObject(terrainObject);
        const size = new THREE.Vector3();
        bounds.getSize(size);
        return Math.max(size.x, size.z) / 2;
      };

      const placeTree = (xz: THREE.Vector2) => {
        if (!treeTemplate) return;
        const tree = treeTemplate.clone(true);
        tree.position.set(xz.x, 0, xz.y);
        scene.add(tree);
        registerSceneObject(tree);
        placedTrees.push({ object: tree, xz });
      };

      const removeTree = (entry: { object: THREE.Object3D; xz: THREE.Vector2 }) => {
        scene.remove(entry.object);
        const registeredIdx = registeredObjects.indexOf(entry.object);
        if (registeredIdx !== -1) registeredObjects.splice(registeredIdx, 1);
        const placedIdx = placedTrees.indexOf(entry);
        if (placedIdx !== -1) placedTrees.splice(placedIdx, 1);
      };

      // Adds/removes trees to match `treeCount`. Trees that are kept are
      // never moved — only the count changes.
      const rebalanceTreeCount = () => {
        if (!treeTemplate) return;
        const target = treeCount;

        while (placedTrees.length > target) {
          removeTree(placedTrees[placedTrees.length - 1]);
        }

        const radius = currentPlacementRadius();
        let attempts = 0;
        while (placedTrees.length < target && attempts < MAX_PLACEMENT_ATTEMPTS) {
          attempts++;
          const candidate = new THREE.Vector2(
            (Math.random() * 2 - 1) * radius,
            (Math.random() * 2 - 1) * radius
          );
          if (candidate.length() > radius) continue;
          const overlaps = placedTrees.some(
            (t) => t.xz.distanceTo(candidate) < TREE_MIN_DISTANCE
          );
          if (overlaps) continue;
          placeTree(candidate);
        }
      };

      const setTreeCount = (count: number) => {
        treeCount = Math.max(0, Math.round(count));
        rebalanceTreeCount();
      };

      new OBJLoader().load("/models/Tree.obj", (object) => {
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.2,
          metalness: 0.6,
        });
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = material;
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.isTraceable = true;
          }
        });
        treeTemplate = object;
        rebalanceTreeCount();
      });

      // Car is not auto-loaded — it's only added on demand via the "Add Car"
      // dropdown (see addCar, exposed on sceneRef below), and is the only
      // object type in the main app that ends up in `selectables`: everything
      // else (terrain, trees, the solar panel) is locked down/unselectable.
      const addCar = () => {
        new OBJLoader().load("/models/Car.obj", (object) => {
          const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.2,
            metalness: 0.6,
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
              child.userData.isTraceable = true;
              selectables.push(child);
            }
          });
          registerSceneObject(object);
        });
      };

      new OBJLoader().load("/models/SolarPannel.obj", (object) => {
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.36,
          metalness: 0.78,
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
          }
        });
        // Snap onto the terrain if one's already loaded, or queue to snap
        // onto it once one arrives.
        registerSceneObject(object);
      });


      new OBJLoader().load("/models/Terrain.obj", (object) => {
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
          }
        });
        // Level the skybox with this terrain and drop every object already
        // in the scene onto its surface so nothing clips underneath it.
        registerTerrain(object);
      });


      // new OBJLoader().load("/models/Terrain.obj", (object) => {
      //   const material = new THREE.MeshStandardMaterial({
      //     vertexColors: true,
      //     roughness: 0.2,
      //     metalness: 0.6,
      //   });
      //   // Rest the model's bottom on the floor regardless of how it was
      //   // positioned in the editor.
      //   const bounds = new THREE.Box3().setFromObject(object);
      //   object.position.y -= bounds.min.y;
      //   scene.add(object);
      //   object.traverse((child) => {
      //     if (child instanceof THREE.Mesh) {
      //       child.material = material;
      //       child.castShadow = true;
      //       child.receiveShadow = true;
      //       selectables.push(child);
      //     }
      //   });
      //   // Level/resize the skybox to this terrain, drop the ground below
      //   // it, and settle every object already in the scene onto its
      //   // surface so nothing clips underneath it.
      //   registerTerrain(object);
      // });

      // ── Controls ─────────────────────────────────────────────────────────

      const transformControls = new TransformControls(
        perspCamera,
        renderer.domElement
      );
      scene.add(transformControls.getHelper());

      // Disable orbit while dragging with transform
      transformControls.addEventListener("dragging-changed", (event) => {
        orbitControls.enabled = !event.value;
      });

      // Keeps guarantee 8 (nothing floats/clips) true even after the user
      // drags the Car — the only object that's ever attached to
      // transformControls in the main app, since terrain/trees/the solar
      // panel aren't in `selectables` and so can never be picked up here.
      transformControls.addEventListener("dragging-changed", (event) => {
        if (event.value || !terrainObject) return;
        const target = transformControls.object;
        if (!target) return;
        snapObjectToTerrain(target, terrainObject);
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
        addCar,
        setTreeCount,
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

        // Dispose geometries & materials. Cloned trees share geometry across
        // instances, so the same geometry may be disposed more than once
        // here — that's a harmless no-op in Three.js (it just releases GPU
        // buffers, which get lazily recreated if reused after a remount).
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
        renderer.forceContextLoss();
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
