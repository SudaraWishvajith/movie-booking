// 3D theater viewer: loads the Blender-exported GLB, colors seats by status,
// and flies the camera into any seat's point of view.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const OVERVIEW = {
  pos: new THREE.Vector3(0, 9.6, 9.0),
  look: new THREE.Vector3(0, 2.2, -5.5),
  fov: 55,
};
const POV_FOV = 60;
const ROOM = { x: 9.5, yMax: 10.4, zMin: -12.0, zMax: 9.2 };

const SEAT_COLORS = {
  free: { color: 0x8a1620, emissive: 0x000000 },
  premium: { color: 0x4f1a5c, emissive: 0x000000 },
  selected: { color: 0xe4b04a, emissive: 0x3a2400 },
  taken: { color: 0x2a282e, emissive: 0x000000 },
  hover: { color: 0xff5a5a, emissive: 0x401010 },
};

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Theater3D {
  constructor(canvas, { onSeatClick, onSeatHover } = {}) {
    this.canvas = canvas;
    this.onSeatClick = onSeatClick || (() => {});
    this.onSeatHover = onSeatHover || (() => {});
    this.seats = new Map(); // node name -> { data, group, fabricMeshes, state }
    this.meshToSeat = new Map();
    this.pickables = [];
    this.mode = "overview";
    this.anim = null;
    this.hovered = null;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040305);

    this.camera = new THREE.PerspectiveCamera(OVERVIEW.fov, 1, 0.03, 120);
    this.camera.position.copy(OVERVIEW.pos);

    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.target.copy(OVERVIEW.look);
    this.controls = controls;
    this._setOverviewLimits();

    this._setupLights();

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._bindPointer();

    this._resize = this._resize.bind(this);
    new ResizeObserver(this._resize).observe(canvas.parentElement);
    this._resize();

    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this._tick());
  }

  _setupLights() {
    RectAreaLightUniformsLib.init();
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffe2c8, 0x140a0c, 0.55));

    // light spilling off the movie screen
    const screenLight = new THREE.RectAreaLight(0xffc9a0, 3.2, 16, 6.7);
    screenLight.position.set(0, 5.55, -12.6);
    screenLight.lookAt(0, 5.55, 0);
    s.add(screenLight);
    this.screenLight = screenLight;

    // warm wall sconces (mirrors the Blender layout)
    for (const by of [10.0, 6.5, 2.9, -0.6, -4.1, -7.6]) {
      const z = -by;
      const y = by > 0 ? 4.6 : 4.6 + (0.6 * -by) / 3;
      for (const x of [-9.4, 9.4]) {
        const p = new THREE.PointLight(0xffb070, 6, 9, 1.6);
        p.position.set(x, y, z);
        s.add(p);
      }
    }
    // dim house lights from the ceiling
    const dir = new THREE.DirectionalLight(0xffe0c0, 0.35);
    dir.position.set(2, 12, 4);
    s.add(dir);
  }

  async load(glbUrl, seatsUrl, onProgress) {
    const [gltf, seatInfo] = await Promise.all([
      new GLTFLoader().loadAsync(glbUrl, (e) => {
        if (onProgress && e.total) onProgress(e.loaded / e.total);
      }),
      fetch(seatsUrl).then((r) => r.json()),
    ]);
    this.info = seatInfo;
    const root = gltf.scene;
    this.scene.add(root);

    // one shared material per seat status
    let fabricTemplate = null;
    root.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === "SeatFabric") fabricTemplate = o.material;
    });
    this.seatMats = {};
    for (const [k, v] of Object.entries(SEAT_COLORS)) {
      const m = fabricTemplate ? fabricTemplate.clone() : new THREE.MeshStandardMaterial({ roughness: 0.85 });
      m.color.setHex(v.color);
      m.emissive.setHex(v.emissive);
      m.emissiveIntensity = 1;
      this.seatMats[k] = m;
    }

    for (const sd of seatInfo.seats) {
      const group = root.getObjectByName(sd.node);
      if (!group) continue;
      const fabricMeshes = [];
      group.traverse((o) => {
        if (!o.isMesh) return;
        this.meshToSeat.set(o, sd.node);
        this.pickables.push(o);
        if (o.material && o.material.name === "SeatFabric") fabricMeshes.push(o);
      });
      this.seats.set(sd.node, { data: sd, group, fabricMeshes, state: "free" });
    }

    // the screen gets its own unlit material so we can swap the "movie"
    this.screenMesh = root.getObjectByName("Screen");
    if (this.screenMesh) {
      this.screenMesh.traverse((o) => {
        if (o.isMesh) {
          this.screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          o.material = this.screenMat;
        }
      });
    }
    // seat-view markers are only helpers, never rendered
    root.traverse((o) => {
      if (o.name && o.name.startsWith("POV_")) o.visible = false;
    });
    return seatInfo;
  }

  setScreenImage(canvasOrImage) {
    if (!this.screenMat) return;
    const tex = new THREE.CanvasTexture(canvasOrImage);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.flipY = false; // glTF UV convention
    if (this.screenMat.map) this.screenMat.map.dispose();
    this.screenMat.map = tex;
    this.screenMat.color.setScalar(1.25);
    this.screenMat.needsUpdate = true;
  }

  setSeatState(node, state) {
    const s = this.seats.get(node);
    if (!s) return;
    s.state = state;
    if (this.hovered !== node) this._applyMat(s, state);
  }

  _applyMat(s, key) {
    const m = this.seatMats[key] || this.seatMats.free;
    for (const mesh of s.fabricMeshes) mesh.material = m;
  }

  setHover(node) {
    if (this.hovered === node) return;
    if (this.hovered) {
      const prev = this.seats.get(this.hovered);
      if (prev) this._applyMat(prev, prev.state);
    }
    this.hovered = node;
    if (node) {
      const s = this.seats.get(node);
      if (s && s.state !== "taken") this._applyMat(s, "hover");
    }
  }

  // ---------- camera ----------
  seatPose(node) {
    const s = this.seats.get(node);
    if (!s) return null;
    const eye = new THREE.Vector3(...s.data.eye);
    const look = new THREE.Vector3(...s.data.lookAt);
    return { pos: eye, look, fov: POV_FOV };
  }

  flyToSeat(node) {
    const pose = this.seatPose(node);
    if (!pose) return;
    this.currentSeat = node;
    this._flyTo(pose, "pov");
  }

  flyToOverview() {
    this.currentSeat = null;
    this._flyTo({ pos: OVERVIEW.pos.clone(), look: OVERVIEW.look.clone(), fov: OVERVIEW.fov }, "overview");
  }

  _flyTo(to, mode) {
    const cam = this.camera;
    const fromLook = new THREE.Vector3();
    cam.getWorldDirection(fromLook);
    // start "look" point: where the camera currently points, at a sensible distance
    fromLook.multiplyScalar(Math.max(4, cam.position.distanceTo(to.look) * 0.8)).add(cam.position);
    const from = { pos: cam.position.clone(), look: fromLook, fov: cam.fov };
    const dist = from.pos.distanceTo(to.pos);
    // arc over the seats so the camera never clips through rows
    const mid = from.pos.clone().lerp(to.pos, 0.5);
    mid.y = Math.max(from.pos.y, to.pos.y) + Math.min(3, dist * 0.22);
    const duration = THREE.MathUtils.clamp(0.9 + dist * 0.07, 1.1, 2.2);
    this.controls.enabled = false;
    this.anim = { from, to, mid, t: 0, duration, mode };
  }

  _finishFly() {
    const { to, mode } = this.anim;
    this.anim = null;
    this.mode = mode;
    const c = this.controls;
    if (mode === "pov") {
      const dir = to.look.clone().sub(to.pos).normalize();
      c.target.copy(to.pos).addScaledVector(dir, 0.05);
      this.camera.position.copy(to.pos);
      c.enableZoom = false;
      c.rotateSpeed = -0.35; // drag = turn your head
      c.minDistance = 0; c.maxDistance = Infinity;
      const off = this.camera.position.clone().sub(c.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      c.minAzimuthAngle = sph.theta - 1.15;
      c.maxAzimuthAngle = sph.theta + 1.15;
      c.minPolarAngle = Math.max(0.05, sph.phi - 0.65);
      c.maxPolarAngle = Math.min(Math.PI - 0.05, sph.phi + 0.55);
    } else {
      c.target.copy(to.look);
      this._setOverviewLimits();
    }
    c.enabled = true;
    c.update();
  }

  _setOverviewLimits() {
    const c = this.controls;
    c.enableZoom = true;
    c.rotateSpeed = 0.6;
    c.minDistance = 5;
    c.maxDistance = 19;
    c.minAzimuthAngle = -1.0;
    c.maxAzimuthAngle = 1.0;
    c.minPolarAngle = 0.35;
    c.maxPolarAngle = 1.48;
  }

  _clampOverview() {
    const p = this.camera.position;
    p.x = THREE.MathUtils.clamp(p.x, -ROOM.x, ROOM.x);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.zMin, ROOM.zMax);
    // stadium floor rises toward the back: keep the camera above it
    const rowIdx = THREE.MathUtils.clamp((p.z + 6.6) / 1.15, 0, 11);
    const floor = rowIdx * 0.4;
    p.y = THREE.MathUtils.clamp(p.y, floor + 1.3, ROOM.yMax);
  }

  // ---------- picking ----------
  _bindPointer() {
    const el = this.canvas;
    let down = null;
    el.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || this.anim) return;
      const node = this._pick(e);
      if (node) this.onSeatClick(node);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.anim) return;
      const node = this._pick(e);
      this.setHover(node);
      el.style.cursor = node ? "pointer" : "";
      this.onSeatHover(node);
    });
    el.addEventListener("pointerleave", () => { this.setHover(null); this.onSeatHover(null); });
  }

  _pick(e) {
    if (!this.pickables.length) return null;
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit) return null;
    const node = this.meshToSeat.get(hit.object);
    // ignore the seat you're sitting in
    if (node === this.currentSeat && this.mode === "pov") return null;
    return node || null;
  }

  // ---------- stats for the UI ----------
  seatStats(node) {
    const s = this.seats.get(node);
    if (!s || !this.info) return null;
    const eye = new THREE.Vector3(...s.data.eye);
    const sc = this.info.screen;
    const c = new THREE.Vector3(...sc.center);
    const halfW = sc.widthM / 2;
    const left = new THREE.Vector3(c.x - halfW, c.y, c.z);
    const right = new THREE.Vector3(c.x + halfW, c.y, c.z);
    const toL = left.clone().sub(eye), toR = right.clone().sub(eye);
    const horizAngle = THREE.MathUtils.radToDeg(toL.angleTo(toR));
    const flat = c.clone().sub(eye); flat.y = 0;
    const offCenter = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(flat.x), Math.abs(flat.z)));
    const top = new THREE.Vector3(c.x, c.y + sc.heightM / 2, c.z).sub(eye);
    const lookUp = THREE.MathUtils.radToDeg(Math.atan2(top.y, Math.hypot(top.x, top.z)));
    return { distance: eye.distanceTo(c), horizAngle, offCenter, lookUp };
  }

  // ---------- loop ----------
  _resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep the screen in frame on narrow (portrait) viewers
    this.portraitBoost = w / h < 1 ? 1.25 : 1;
    this.camera.updateProjectionMatrix();
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const cam = this.camera;
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.duration);
      const k = easeInOutCubic(a.t);
      // quadratic bezier for position
      const p0 = a.from.pos, p1 = a.mid, p2 = a.to.pos;
      const u = 1 - k;
      cam.position.set(
        u * u * p0.x + 2 * u * k * p1.x + k * k * p2.x,
        u * u * p0.y + 2 * u * k * p1.y + k * k * p2.y,
        u * u * p0.z + 2 * u * k * p1.z + k * k * p2.z,
      );
      const look = a.from.look.clone().lerp(a.to.look, k);
      cam.lookAt(look);
      cam.fov = THREE.MathUtils.lerp(a.from.fov, a.to.fov * (this.portraitBoost || 1), k);
      cam.updateProjectionMatrix();
      if (a.t >= 1) this._finishFly();
    } else {
      this.controls.update();
      if (this.mode === "overview") this._clampOverview();
    }
    this.composer.render();
  }
}
