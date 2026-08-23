import * as THREE from 'three';
import { B, BLOCK_DEF } from './data/blocks.js';
import { buildTextures } from './TextureGen.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{lite?: boolean}} opts lite mode: pixel ratio forced to 1,
   *        shadows off, fog pulled in — for weak hardware (?lite=1 or the
   *        deviceMemory heuristic). Normal mode caps the ratio at 1.5.
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.lite = !!opts.lite;
    this._init();
    this._applyRenderMode();   // applies the ?lite cap (or the normal 1.5 cap)
    this._textures = buildTextures();
    this._buildBlockMaterials();
    this._instanceMeshes = new Map();
  }

  /** Apply lite (or full) render mode after construction. Idempotent. */
  setLite(lite) {
    this.lite = !!lite;
    this._applyRenderMode();
  }

  _applyRenderMode() {
    const dpr = window.devicePixelRatio ?? 1;
    // Full mode still caps at 1.5 — a 3x panel buys nothing here and costs 4× pixels.
    const ratio = this.lite ? 1 : Math.max(1, Math.min(dpr, 1.5));
    this.renderer.setPixelRatio(ratio);
    if (this.scene?.fog) {
      // Lite pulls the fog in: fewer far chunks drawn, weaker GPUs breathe.
      this.scene.fog.near = this.lite ? 14 : 20;
      this.scene.fog.far  = this.lite ? 60 : 90;
    }
    if (this.renderer.shadowMap) {
      this.renderer.shadowMap.enabled = !this.lite;
      this.sunLight && (this.sunLight.castShadow = !this.lite);
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _init() {
    const w = window.innerWidth, h = window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8aabbb);
    this.scene.fog = new THREE.Fog(0x8aabbb, 20, 90);

    this.camera = new THREE.PerspectiveCamera(70, w / h, 0.05, 200);
    this.camera.position.set(8, 3, 8);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Ambient — controlled by DayNight
    this.ambientLight = new THREE.AmbientLight(0xffeedd, 0.6);
    this.scene.add(this.ambientLight);

    // Sun — controlled by DayNight
    this.sunLight = new THREE.DirectionalLight(0xfff8e0, 1.2);
    this.sunLight.position.set(30, 50, 20);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.scene.add(this.sunLight);

    // Persistent fire/forge atmosphere light
    this._fireLight = new THREE.PointLight(0xff5500, 1.5, 14);
    this._fireLight.position.set(14, 3, 8);
    this.scene.add(this._fireLight);

    // Pre-allocated pool for placed Floodlight blocks (max 6 active at once)
    this._floodPool = Array.from({ length: 6 }, () => {
      const l = new THREE.PointLight(0xfff5cc, 2.2, 18);
      l.visible = false;
      this.scene.add(l);
      return l;
    });

    // Headlamp SpotLight — attached to camera, toggled by Game.js
    this._headlamp = new THREE.SpotLight(0xfff0cc, 0, 28, Math.PI / 7, 0.35, 1.8);
    this._headlamp.visible = false;
    this.camera.add(this._headlamp);
    this.camera.add(this._headlamp.target);
    this._headlamp.target.position.set(0, 0, -10);
    this.scene.add(this.camera);

    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 6;

    // Block selection outline
    const selGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005));
    const selMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 });
    this._selBox = new THREE.LineSegments(selGeo, selMat);
    this._selBox.visible = false;
    this.scene.add(this._selBox);
    // Mining crack overlay (slightly dark transparent cube that grows darker)
    const crackGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
    this._crackBox = new THREE.Mesh(crackGeo, crackMat);
    this._crackBox.visible = false;
    this.scene.add(this._crackBox);
  }

  _buildBlockMaterials() {
    this._matCache = new Map();
    for (const [idStr, def] of Object.entries(BLOCK_DEF)) {
      const id = Number(idStr);
      const tex = this._textures.get(id);
      const mat = new THREE.MeshLambertMaterial(tex ? { map: tex } : { color: def.color });
      if (def.emissive) {
        mat.emissive = new THREE.Color(def.emissive);
        mat.emissiveIntensity = def.emissiveIntensity ?? 0.3;
      }
      this._matCache.set(id, mat);
    }
  }

  /** Full rebuild from world voxel data */
  rebuildMeshes(world) {
    for (const entry of this._instanceMeshes.values()) {
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
    }
    this._instanceMeshes.clear();

    const W = world.width, D = world.depth, H = world.height;
    const counts = new Map();
    for (let i = 0; i < world.blocks.length; i++) {
      const id = world.blocks[i];
      if (id === B.AIR) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const dummy = new THREE.Object3D();

    for (const [id, count] of counts) {
      const mat = this._matCache.get(id);
      if (!mat) continue;
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._instanceMeshes.set(id, { mesh, cursor: 0, maxCount: count });
      this.scene.add(mesh);
    }

    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          const id = world.getBlock(x, y, z);
          if (id === B.AIR) continue;
          const entry = this._instanceMeshes.get(id);
          if (!entry) continue;
          dummy.position.set(x, y, z);
          dummy.updateMatrix();
          entry.mesh.setMatrixAt(entry.cursor, dummy.matrix);
          entry.cursor++;
        }
      }
    }

    for (const entry of this._instanceMeshes.values()) {
      entry.mesh.count = entry.cursor;
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Toggle / set the player's headlamp (SpotLight on camera). */
  setHeadlamp(on, intensity = 2.8) {
    this._headlamp.visible = on;
    this._headlamp.intensity = on ? intensity : 0;
  }

  /** Position Floodlight point lights around the player (called each update). */
  updateFloodlights(placedBlocks, playerPos, floodBlockId) {
    const floods = placedBlocks.filter(b => b.id === floodBlockId);
    // Sort by distance to player, take closest pool.length
    const sorted = floods.map(b => ({ ...b, d2: (b.x - playerPos.x) ** 2 + (b.z - playerPos.z) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, this._floodPool.length);

    for (let i = 0; i < this._floodPool.length; i++) {
      const l = this._floodPool[i];
      if (i < sorted.length) {
        l.position.set(sorted[i].x, sorted[i].y + 0.5, sorted[i].z);
        l.visible = true;
      } else {
        l.visible = false;
      }
    }
  }

  /** Returns {x,y,z,face} for the block under the crosshair, or null */
  getTargetBlock(world) {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const meshes = [...this._instanceMeshes.values()].map(e => e.mesh);
    const hits = this.raycaster.intersectObjects(meshes);
    if (!hits.length) return null;
    const hit = hits[0];
    const p = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(-0.5));
    return {
      x: Math.round(p.x),
      y: Math.round(p.y),
      z: Math.round(p.z),
      face: hit.face.normal.clone(),
      point: hit.point,
    };
  }

  /** Show/hide the block selection outline + mining crack */
  setTargetBlock(x, y, z, mineProgress = 0) {
    if (x == null) {
      this._selBox.visible = false;
      this._crackBox.visible = false;
    } else {
      this._selBox.position.set(x, y, z);
      this._selBox.visible = true;
      if (mineProgress > 0) {
        this._crackBox.position.set(x, y, z);
        this._crackBox.visible = true;
        this._crackBox.material.opacity = mineProgress * 0.45;
      } else {
        this._crackBox.visible = false;
      }
    }
  }

  tick(dt) {
    const now = Date.now();
    this._fireLight.intensity = 1.2 + Math.sin(now * 0.008) * 0.4 + Math.random() * 0.2;

    // Crystal ore pulse — gently breathe the emissive intensity
    const crystalMat = this._matCache.get(B.CRYSTAL_ORE ?? 19);
    if (crystalMat) {
      crystalMat.emissiveIntensity = 0.35 + 0.25 * Math.sin(now * 0.0025);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
