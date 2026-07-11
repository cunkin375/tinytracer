import { useEffect } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { DEFAULT_TREE_COUNT, ORTHO_FRUSTUM_SIZE } from "../constants";
import { createSkybox, preloadSkyboxTexture } from "../objects/Skybox";
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
      perspCamera.position.set(22, 16, 28);
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
      orthoCamera.position.set(0, 0, 45); // default: front view
      orthoCamera.lookAt(0, 0, 0);

      // Created early (rest of the orbit/transform control wiring is further
      // down, with the rest of ── Controls ──) because the polar-angle clamp
      // below needs it immediately. minDistance keeps the camera outside the
      // Earth sphere (radius 15); maxDistance keeps it inside the skybox.
      const orbitControls = new OrbitControls(perspCamera, renderer.domElement);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.08;
      orbitControls.minDistance = 18;
      orbitControls.maxDistance = 70;
      orbitControls.target.set(0, 0, 0);

      // ── Lighting ─────────────────────────────────────────────────────────

      const ambientLight = new THREE.AmbientLight(0xc8c0e8, 0.6);
      scene.add(ambientLight);

      // This directional light is the "sun": it lights the WebGL preview and
      // is serialized into the path tracer (see serializeSun). Its target is
      // added to the scene so its world transform — and thus the sun
      // direction the tracer reads — stays well-defined as it's moved.
      const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.8);
      dirLight.position.set(5, 8, 4);
      dirLight.userData.isSun = true;
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
      scene.add(dirLight.target);

      // Visible sun proxy: a glowing disc that marks where the directional
      // light sits so the user can see the sun they're steering with the Sun
      // panel. Parented to the light so it tracks its position for free, and
      // left untagged (no isSphere / isTraceable) so it never leaks into the
      // path-traced image. MeshBasicMaterial is unlit, so it reads as a
      // self-luminous sun rather than a shaded ball.
      const sunCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xfff4e6 })
      );
      sunCore.userData.isSunProxy = true;
      const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 24, 16),
        new THREE.MeshBasicMaterial({
          color: 0xfff4e6,
          transparent: true,
          opacity: 0.22,
          side: THREE.BackSide,
          depthWrite: false,
        })
      );
      sunCore.add(sunGlow);
      dirLight.add(sunCore);

      const fillLight = new THREE.DirectionalLight(0xa5b4fc, 0.4);
      fillLight.position.set(-4, 3, -2);
      scene.add(fillLight);

      // ── Earth ────────────────────────────────────────────────────────────
      // A single central sphere at the origin that everything else sits on.
      // It is deliberately kept out of `selectables`, so it can never be
      // picked up by the transform controls — it stays locked in place.

      const EARTH_RADIUS = 15;
      const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
      const earthMat = new THREE.MeshStandardMaterial({
        color: 0x2EDB6D,
        roughness: 0.85,
        metalness: 0.1,
      });
      const earth = new THREE.Mesh(earthGeo, earthMat);
      earth.receiveShadow = true;
      earth.castShadow = true;
      // Consumed by the path-tracer serializer (see lib/webgpu/serializer.ts).
      // Tagging it as an analytic sphere gets it traced exactly — and cheaply —
      // as a (center, radius) primitive, rather than tessellating the 64×64
      // sphere geometry into thousands of triangles. `isSphere`/`radius` are
      // what serializeSpheres keys off of; without them the Earth is skipped
      // entirely and never reaches the GPU.
      earth.userData.isSphere = true;
      earth.userData.radius = EARTH_RADIUS;
      earth.userData.materialType = 0; // Lambertian
      earth.userData.roughness = earthMat.roughness;
      scene.add(earth);

      // The skybox is a full sphere (see Skybox.ts) with no open rim to see
      // past, so the camera is free to orbit almost the full polar range —
      // just kept a hair short of the exact poles, where OrbitControls'
      // spherical-coordinate math is singular and can briefly flip the
      // camera's up vector.
      orbitControls.minPolarAngle = 0.01;
      orbitControls.maxPolarAngle = Math.PI - 0.01;

      // ── Scene objects ────────────────────────────────────────────────────

      const selectables: THREE.Mesh[] = [];

      // ── Trees: count is set directly by the tree-count slider (React UI) ──
      // via setTreeCount. Trees are scattered evenly over the Earth sphere's
      // surface with a Fibonacci-sphere distribution and locked in place —
      // they aren't in `selectables`, so nothing in the main app is movable
      // except the solar panel (surface-locked, below) and a dropdown-added
      // Car (see addCar below).

      const TREE_UP = new THREE.Vector3(0, 1, 0);

      let treeTemplate: THREE.Object3D | null = null;
      let treeCount = DEFAULT_TREE_COUNT;
      const placedTrees: THREE.Object3D[] = [];

      // The i-th of `count` evenly spread points on the unit sphere, scaled to
      // the Earth's radius. The golden-angle spiral keeps neighbours roughly
      // equidistant no matter how many points there are.
      const fibonacciSpherePoint = (i: number, count: number) => {
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        // y walks evenly from just below the north pole to just above the
        // south pole; the (i + 0.5)/count offset keeps points off the exact
        // poles where the spiral degenerates.
        const y = 1 - (2 * (i + 0.5)) / count;
        const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = goldenAngle * i;
        return new THREE.Vector3(
          Math.cos(theta) * ringRadius,
          y,
          Math.sin(theta) * ringRadius
        ).multiplyScalar(EARTH_RADIUS);
      };

      // Places a tree at its Fibonacci-sphere slot, rooted on the surface and
      // rotated so its local +Y (trunk-up) points straight out from the
      // Earth's centre.
      const placeTree = (tree: THREE.Object3D, i: number, count: number) => {
        const position = fibonacciSpherePoint(i, count);
        tree.position.copy(position);
        tree.quaternion.setFromUnitVectors(TREE_UP, position.clone().normalize());
      };

      // Adds/removes trees to match `treeCount`, then re-spreads all of them
      // across the sphere for the new total (an even distribution depends on
      // the count, so surviving trees may shift slots).
      const rebalanceTreeCount = () => {
        if (!treeTemplate) return;
        const target = treeCount;

        while (placedTrees.length > target) {
          const tree = placedTrees.pop();
          if (tree) scene.remove(tree);
        }
        while (placedTrees.length < target) {
          const tree = treeTemplate.clone(true);
          scene.add(tree);
          placedTrees.push(tree);
        }

        placedTrees.forEach((tree, i) => placeTree(tree, i, placedTrees.length));
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
      // dropdown (see addCar, exposed on sceneRef below). Along with the
      // solar panel it's one of the only objects in the main app that ends up
      // in `selectables`: the Earth and trees are locked down/unselectable.
      const addCar = () => {
        new OBJLoader().load("/models/Car.obj", (object) => {
          const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.2,
            metalness: 0.6,
          });
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
        });
      };

      // The solar panel is the one object the user is meant to reposition. Its
      // meshes go into `selectables` and are tagged so the transform-controls
      // "change" handler (below) can recognise them and keep them clamped to
      // the Earth's surface. It starts resting on the north pole.
      new OBJLoader().load("/models/SolarPannel.obj", (object) => {
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.36,
          metalness: 0.78,
        });
        // Keep the loaded group at the origin with an identity transform so
        // that the selectable child mesh's local position is also its world
        // position — the "change" handler below clamps that position directly.
        scene.add(object);
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = material;
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.isSolarPanel = true;
            child.userData.isTraceable = true;
            child.position.set(0, EARTH_RADIUS, 0);
            selectables.push(child);
          }
        });
      });

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

      // Surface-lock for the solar panel. TransformControls fires "change" on
      // every drag step; whenever the attached object is the solar panel, we
      // re-project it onto the Earth's surface (radius EARTH_RADIUS) and
      // re-orient it so its local +Y keeps pointing straight out from the
      // centre. The Car, the only other selectable, is left free to move.
      const SOLAR_UP = new THREE.Vector3(0, 1, 0);
      transformControls.addEventListener("change", () => {
        const target = transformControls.object;
        if (!target || !target.userData.isSolarPanel) return;
        if (target.position.lengthSq() === 0) return; // avoid NaN at the centre
        target.position.normalize().multiplyScalar(EARTH_RADIUS);
        target.quaternion.setFromUnitVectors(
          SOLAR_UP,
          target.position.clone().normalize()
        );
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
        sunLight: dirLight,
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
