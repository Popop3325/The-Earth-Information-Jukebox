// 3D-глобус (three.js): куля з текстурою NASA NDVI (рівнопроміжна проекція, кадр із SVS 5544).
// Повільно обертається; setFocus(lon, lat) плавно повертає обраний регіон до глядача.
// Якщо WebGL недоступний — повертає null, і лишається 2D-текстура з CSS (.earth-texture).
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const TILT = THREE.MathUtils.degToRad(23.4);

export function createGlobe(container, textureUrl) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "globe-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 3.85);       // куля діаметром ≈ вся площа контейнера

  const tilt = new THREE.Group();
  tilt.rotation.z = TILT;                // нахил осі Землі
  scene.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);

  const tex = new THREE.TextureLoader().load(textureUrl, () => container.classList.add("model-ready"));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }),
  );
  spin.add(earth);

  // легка атмосфера: напівпрозора оболонка, що світиться по краю
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.035, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec3 n; void main(){ float i = pow(0.75 - dot(n, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(0.45,0.78,1.0,1.0) * i; }",
    }),
  );
  scene.add(atmo);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 1.5, 3);
  scene.add(sun);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let target = null;                    // цільовий кут обертання (фокус на регіоні)
  let last = performance.now();
  let alive = true;

  function resize() {
    const s = Math.max(1, Math.round(container.clientWidth));
    renderer.setSize(s, s, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  (function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (target !== null) {
      // найкоротший шлях до цілі, плавно
      let d = target - spin.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      spin.rotation.y += d * Math.min(1, dt * 2.2);
      if (Math.abs(d) < 0.002) target = null;
    } else if (!reduce) {
      spin.rotation.y += dt * 0.08;     // повільне обертання (~80 с на оберт)
    }
    // малюємо лише коли глобус видно (після вступу він прозорий — не витрачаємо GPU)
    const op = parseFloat(getComputedStyle(container).opacity || "1");
    if (op > 0.02) renderer.render(scene, camera);
    requestAnimationFrame(frame);
  })(last);

  return {
    /** Повернути довготу lon (і трохи широту lat) до глядача */
    setFocus(lon, lat = 0) {
      // у SphereGeometry довгота L має φ = 2π(L+180)/360; до камери (+z) її повертає кут π/2 − φ
      const phi = (2 * Math.PI * (lon + 180)) / 360;
      target = Math.PI / 2 - phi;
      tilt.rotation.x = THREE.MathUtils.degToRad(Math.max(-30, Math.min(30, lat)) * 0.6);
    },
    dispose() { alive = false; ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
