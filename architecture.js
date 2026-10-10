/* =========================================================
   THE ARCHITECTURE — SECTION 03
   Three.js foundation

   This file owns the scene/camera/renderer/lighting/resize/
   render-loop for the architecture section only. It never
   touches the Hero or Arrival sections or script.js.

   TEMPORARY PLACEHOLDER:
   buildPlaceholderVilla() below builds a minimal modern-villa
   shape out of plain Three.js geometry so the render pipeline
   can be verified end to end before the real asset exists.

   TO SWAP IN THE REAL MODEL LATER:
   Replace the body of buildPlaceholderVilla() with a
   GLTFLoader load of assets/models/aaroh-residence.glb and
   resolve the returned promise with the loaded scene graph —
   everything downstream (scene.add, shadows, the idle-rotation
   hook, the resize/render loop) already expects a single
   THREE.Object3D and does not need to change.

   import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
========================================================= */

import * as THREE from "three";

const section = document.querySelector(".architecture");
const canvas = document.getElementById("architecture-canvas");

if (section && canvas) {

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;


  /* =======================================================
     RENDERER
  ======================================================= */

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap was removed from this Three.js release; VSMShadowMap
  // is the current soft-shadow option.
  renderer.shadowMap.type = THREE.VSMShadowMap;


  /* =======================================================
     SCENE
  ======================================================= */

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05050a);
  scene.fog = new THREE.Fog(0x05050a, 14, 32);


  /* =======================================================
     CAMERA

     A static, slightly elevated architectural viewing angle.
     No movement yet — that is explicitly a later step.
  ======================================================= */

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(8.6, 4.6, 10.4);
  camera.lookAt(0.6, 0.95, 0.9);


  /* =======================================================
     LIGHTING

     Soft ambient fill + a warm key light standing in for the
     sun, plus a cool hemisphere light for a believable
     sky/ground tint. Nothing bright enough to read as neon.
  ======================================================= */

  const ambient = new THREE.AmbientLight(0x3c3c46, 0.55);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x8a97b5, 0x12121a, 0.45);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff0dc, 1.7);
  keyLight.position.set(6, 9.5, 4.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -12;
  keyLight.shadow.bias = -0.0015;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x4a6a8a, 0.35);
  rimLight.position.set(-8, 5, -6);
  scene.add(rimLight);


  /* =======================================================
     MATERIALS
  ======================================================= */

  const materials = {

    concrete: new THREE.MeshStandardMaterial({
      color: 0xcfcbc2,
      roughness: 0.82,
      metalness: 0.04
    }),

    concreteDark: new THREE.MeshStandardMaterial({
      color: 0x232226,
      roughness: 0.78,
      metalness: 0.06
    }),

    terrace: new THREE.MeshStandardMaterial({
      color: 0xb7b2a6,
      roughness: 0.75,
      metalness: 0.02
    }),

    glass: new THREE.MeshStandardMaterial({
      color: 0x9fc0d6,
      transparent: true,
      opacity: 0.32,
      roughness: 0.12,
      metalness: 0.15,
      emissive: 0x1a2a33,
      emissiveIntensity: 0.4
    }),

    water: new THREE.MeshStandardMaterial({
      color: 0x0c2a33,
      roughness: 0.12,
      metalness: 0.25,
      emissive: 0x08323d,
      emissiveIntensity: 0.3
    }),

    ground: new THREE.MeshStandardMaterial({
      color: 0x0f0f13,
      roughness: 0.95,
      metalness: 0.02
    })

  };


  /* =======================================================
     PLACEHOLDER VILLA

     Simple massing only: ground-floor volume, an offset
     second-floor volume, a flat roof cap, a glass facade
     strip on each volume, a terrace with a frameless-glass
     parapet, and a recessed pool. Proportions are loose —
     this exists to prove the pipeline renders correctly, not
     to be the final design.
  ======================================================= */

  function buildPlaceholderVilla() {

    const villa = new THREE.Group();

    // Ground floor
    const groundFloor = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1.4, 4),
      materials.concrete
    );
    groundFloor.position.set(0, 0.7, 0);
    groundFloor.castShadow = true;
    groundFloor.receiveShadow = true;
    villa.add(groundFloor);

    // Ground-floor glass facade (front face)
    const groundGlass = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 1.05, 0.05),
      materials.glass
    );
    groundGlass.position.set(0, 0.72, 2.03);
    villa.add(groundGlass);

    // Second-floor volume — offset for an asymmetric, cantilevered read
    const secondFloor = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.2, 3),
      materials.concrete
    );
    secondFloor.position.set(-0.9, 2.0, -0.3);
    secondFloor.castShadow = true;
    secondFloor.receiveShadow = true;
    villa.add(secondFloor);

    // Second-floor glass facade
    const secondGlass = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.9, 0.05),
      materials.glass
    );
    secondGlass.position.set(-0.9, 2.0, 1.22);
    villa.add(secondGlass);

    // Flat roof cap
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.12, 3.2),
      materials.concreteDark
    );
    roof.position.set(-0.9, 2.66, -0.3);
    roof.castShadow = true;
    roof.receiveShadow = true;
    villa.add(roof);

    // Terrace slab — fills the footprint the second floor overhangs
    const terrace = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.14, 3.6),
      materials.terrace
    );
    terrace.position.set(2.25, 1.47, 0);
    terrace.castShadow = true;
    terrace.receiveShadow = true;
    villa.add(terrace);

    // Frameless glass parapet along the terrace's outer edge
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.3, 0.04),
      materials.glass
    );
    parapet.position.set(2.25, 1.69, 1.78);
    villa.add(parapet);

    // Pool coping (the lighter rim) + recessed water surface — ground
    // level, on the open side of the villa, toward the camera so it
    // reads clearly from the default static view.
    const poolCoping = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.08, 2.0),
      materials.terrace
    );
    poolCoping.position.set(2.1, -0.04, 3.35);
    poolCoping.castShadow = true;
    poolCoping.receiveShadow = true;
    villa.add(poolCoping);

    // Sits visibly above the coping's top face (rather than flush or
    // recessed) so the two surfaces never z-fight and the darker water
    // material always reads clearly against the lighter stone rim.
    const poolWater = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.06, 1.7),
      materials.water
    );
    poolWater.position.set(2.1, 0.01, 3.35);
    villa.add(poolWater);

    return villa;

  }

  const villaGroup = buildPlaceholderVilla();
  scene.add(villaGroup);

  // Ground plane sits outside the villa group so it never rotates with it.
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    materials.ground
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -0.08;
  groundPlane.receiveShadow = true;
  scene.add(groundPlane);


  /* =======================================================
     RESPONSIVE RESIZE

     Checked every frame against the canvas's own rendered
     size rather than bound to a window "resize" listener —
     this follows the canvas's actual CSS size directly, so
     it responds correctly to layout changes with no extra
     wiring and nothing to desync.
  ======================================================= */

  function syncRendererSize() {

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (width === 0 || height === 0) return false;

    const needsResize =
      canvas.width !== Math.round(width * renderer.getPixelRatio()) ||
      canvas.height !== Math.round(height * renderer.getPixelRatio());

    if (needsResize) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    return needsResize;

  }

  syncRendererSize();


  /* =======================================================
     RENDER LOOP

     Paused via IntersectionObserver while the section is off
     screen — a continuously-rendering 3D scene is far more
     expensive than a paused video, so there's no reason to
     keep driving it when nothing is visible.
  ======================================================= */

  let rafId = null;
  let lastTime = performance.now();

  function renderFrame(time) {

    syncRendererSize();

    const delta = (time - lastTime) / 1000;
    lastTime = time;

    if (!prefersReducedMotion) {
      // Slow idle turntable on the model only — the camera stays put.
      villaGroup.rotation.y += delta * 0.12;
    }

    renderer.render(scene, camera);

    rafId = requestAnimationFrame(renderFrame);

  }

  function startLoop() {

    if (rafId !== null) return;

    lastTime = performance.now();
    rafId = requestAnimationFrame(renderFrame);

  }

  function stopLoop() {

    if (rafId === null) return;

    cancelAnimationFrame(rafId);
    rafId = null;

  }

  if ("IntersectionObserver" in window) {

    const visibilityObserver = new IntersectionObserver(
      (entries) => {

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startLoop();
          } else {
            stopLoop();
          }
        });

      },
      {
        rootMargin: "20% 0px"
      }
    );

    visibilityObserver.observe(section);

  } else {

    startLoop();

  }

  // Render one frame immediately so the section never shows a blank
  // canvas on first paint if it happens to already be in view.
  renderer.render(scene, camera);

}
