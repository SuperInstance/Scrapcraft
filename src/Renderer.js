import * as THREE from 'three';
import { B, BLOCK_DEF } from './data/blocks.js';
import { buildTextures } from './TextureGen.js';
import { InstanceLedger } from './InstanceLedger.js';

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
    this._ledger = new InstanceLedger();
    this._meshList = [];  // cached array of meshes, rebuilt only in rebuildMeshes
    this._needsFullRebuild = false;
    this._matrixDummy = new THREE.Object3D();  // reused dummy for matrix ops
    this._centerVec = new THREE.Vector2(0, 0);  // reused for raycast center
    this._target = { face: new THREE.Vector3(), point: new THREE.Vector3(), x: 0, y: 0, z: 0 };  // reused result
    this._swapMatrix = new THREE.Matrix4();   // reused for swap-remove copies
    this._calcVec = new THREE.Vector3();      // scratch for target rounding
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
    this._meshList = [];
    this._needsFullRebuild = false;

    const W = world.width, D = world.depth, H = world.height;
    const counts = new Map();
    for (let i = 0; i < world.blocks.length; i++) {
      const id = world.blocks[i];
      if (id === B.AIR) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    // Seed the ledger: plan capacities from counts, positions are added
    // during the fill pass below (add() is what populates entries + lookup map).
    const countsObj = Object.fromEntries(Array.from(counts.entries()).map(([id, count]) => [String(id), count]));
    this._ledger.plan(countsObj);

    const geo = new THREE.BoxGeometry(1, 1, 1);

    for (const [id, count] of counts) {
      const mat = this._matCache.get(id);
      if (!mat) continue;
      // Allocate with ~12.5% slack (ceil to 8-multiple)
      const slack = Math.max(8, count >> 3);
      const capacity = Math.ceil((count + slack) / 8) * 8;
      const mesh = new THREE.InstancedMesh(geo, mat, capacity);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._instanceMeshes.set(id, { mesh, cursor: 0 });
      this._meshList.push(mesh);
      this.scene.add(mesh);
    }

    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          const id = world.getBlock(x, y, z);
          if (id === B.AIR) continue;
          const entry = this._instanceMeshes.get(id);
          if (!entry) continue;
          this._matrixDummy.position.set(x, y, z);
          this._matrixDummy.updateMatrix();
          entry.mesh.setMatrixAt(entry.cursor, this._matrixDummy.matrix);
          this._ledger.add(id, x, y, z);   // slot == entry.cursor, guaranteed by fill order
          entry.cursor++;
        }
      }
    }

    for (const entry of this._instanceMeshes.values()) {
      entry.mesh.count = entry.cursor;
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Incremental block change: oldId → newId at (x,y,z). */
  applyBlockChange(x, y, z, oldId, newId) {
    const AIR = B.AIR;
    const isOldSolid = oldId !== AIR;
    const isNewSolid = newId !== AIR;

    if (!isOldSolid && !isNewSolid) return;  // AIR → AIR, nothing to do

    if (isOldSolid && !isNewSolid) {
      // Solid → AIR: remove
      // Slot BEFORE ledger.remove — after removal the lookup is gone.
      const slot = this._ledger.slotOf(oldId, x, y, z);
      const removed = slot >= 0 && this._ledger.remove(oldId, x, y, z);
      if (!removed) return;  // wasn't tracked (e.g. pre-ledger state) — nothing to draw out
      const entry = this._instanceMeshes.get(oldId);
      if (!entry) return;
      const lastSlot = entry.mesh.count - 1;
      if (slot < lastSlot) {
        // Swap-remove in the mesh too: the last live instance moves into the
        // hole so the ledger (which already swapped its bookkeeping) and the
        // instance buffer agree.
        entry.mesh.getMatrixAt(lastSlot, this._swapMatrix);
        entry.mesh.setMatrixAt(slot, this._swapMatrix);
      }
      entry.mesh.count--;
      entry.mesh.instanceMatrix.needsUpdate = true;
    } else if (!isOldSolid && isNewSolid) {
      // AIR → Solid: add
      const entry = this._instanceMeshes.get(newId);
      if (!entry) {
        // Mesh doesn't exist yet; fall back to full rebuild
        this._needsFullRebuild = true;
        return;
      }
      const slot = this._ledger.add(newId, x, y, z);
      // True capacity of the instance buffer — if we've outgrown the slack,
      // undo the ledger add and fall back to a full rebuild.
      if (slot >= entry.mesh.instanceMatrix.count) {
        this._ledger.remove(newId, x, y, z);
        this._needsFullRebuild = true;
        return;
      }
      this._matrixDummy.position.set(x, y, z);
      this._matrixDummy.updateMatrix();
      entry.mesh.setMatrixAt(slot, this._matrixDummy.matrix);
      entry.mesh.count++;
      entry.mesh.instanceMatrix.needsUpdate = true;
    } else {
      // Solid → Solid: treat as remove + add
      this.applyBlockChange(x, y, z, oldId, AIR);
      this.applyBlockChange(x, y, z, AIR, newId);
    }
  }

  /** Check if a full rebuild was flagged. Clears the flag. */
  needsFullRebuild() {
    const flag = this._needsFullRebuild;
    this._needsFullRebuild = false;
    return flag;
  }

  /** Toggle / set the player's headlamp (SpotLight on camera). */
  setHeadlamp(on, intensity = 2.8) {
    this._headlamp.visible = on;
    this._headlamp.intensity = on ? intensity : 0;
  }

  /** Position Floodlight point lights around the player (called each update). */
  updateFloodlights(placedBlocks, playerPos, floodBlockId) {
    // Find closest N floodlights without allocations — reusable scratch
    // entries (allocated once) instead of fresh {b,d2} wrappers per call.
    if (!this._floodScratch) {
      this._floodScratch = Array.from(
        { length: this._floodPool.length },
        () => ({ b: null, d2: 0 }),
      );
    }
    const poolSize = this._floodPool.length;
    const scratch = this._floodScratch;
    let count = 0;
    let maxDist2 = Infinity;

    for (const b of placedBlocks) {
      if (b.id !== floodBlockId) continue;
      const d2 = (b.x - playerPos.x) ** 2 + (b.z - playerPos.z) ** 2;
      if (count < poolSize) {
        scratch[count].b = b;
        scratch[count].d2 = d2;
        count++;
        if (count === poolSize) {
          // Find max distance in the full pool
          maxDist2 = 0;
          for (let i = 0; i < poolSize; i++) {
            if (scratch[i].d2 > maxDist2) maxDist2 = scratch[i].d2;
          }
        }
      } else if (d2 < maxDist2) {
        // Find the slot with max distance and replace it
        let maxIdx = 0;
        for (let i = 1; i < poolSize; i++) {
          if (scratch[i].d2 > scratch[maxIdx].d2) maxIdx = i;
        }
        scratch[maxIdx].b = b;
        scratch[maxIdx].d2 = d2;
        maxDist2 = 0;
        for (let i = 0; i < poolSize; i++) {
          if (scratch[i].d2 > maxDist2) maxDist2 = scratch[i].d2;
        }
      }
    }

    for (let i = 0; i < poolSize; i++) {
      const l = this._floodPool[i];
      if (i < count) {
        const entry = scratch[i];
        l.position.set(entry.b.x, entry.b.y + 0.5, entry.b.z);
        l.visible = true;
      } else {
        l.visible = false;
      }
    }
  }

  /**
   * Returns {x,y,z,face} for the block under the crosshair, or null.
   * Returns a REUSED object — caller must copy x/y/z if held across frames.
   */
  getTargetBlock(world) {
    this.raycaster.setFromCamera(this._centerVec, this.camera);
    const hits = this.raycaster.intersectObjects(this._meshList);
    if (!hits.length) return null;
    const hit = hits[0];
    // Never mutate hit.point / hit.face.normal (three may share them) — do the
    // -0.5 inset math on a scratch vector and keep face/point pristine.
    this._calcVec.copy(hit.point).addScaledVector(hit.face.normal, -0.5);
    this._target.x = Math.round(this._calcVec.x);
    this._target.y = Math.round(this._calcVec.y);
    this._target.z = Math.round(this._calcVec.z);
    this._target.face.copy(hit.face.normal);
    this._target.point.copy(hit.point);
    return this._target;
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
