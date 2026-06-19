import * as THREE from 'three';
import { B, BLOCK_DEF } from './data/blocks.js';

const CHUNK_SIZE = 16;
const WORLD_H = 8; // max height

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this._init();
    this._buildBlockMaterials();
    this._instanceMeshes = new Map(); // blockId → InstancedMesh
    this._pending = true;
  }

  _init() {
    const w = window.innerWidth, h = window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8aabbb);
    this.scene.fog = new THREE.Fog(0x8aabbb, 20, 80);

    this.camera = new THREE.PerspectiveCamera(70, w / h, 0.05, 200);
    this.camera.position.set(8, 3, 8);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ambient
    const ambient = new THREE.AmbientLight(0xffeedd, 0.6);
    this.scene.add(ambient);

    // Sun
    const sun = new THREE.DirectionalLight(0xfff8e0, 1.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);

    // Haze point lights for ambience
    const fire1 = new THREE.PointLight(0xff5500, 2, 12);
    fire1.position.set(10, 2, 10);
    this.scene.add(fire1);
    this._fireLights = [fire1];

    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    // Crosshair raycaster
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 6;
  }

  _buildBlockMaterials() {
    this._matCache = new Map();
    for (const [idStr, def] of Object.entries(BLOCK_DEF)) {
      const mat = new THREE.MeshLambertMaterial({ color: def.color });
      if (def.emissive) {
        mat.emissive = new THREE.Color(def.emissive);
        mat.emissiveIntensity = def.emissiveIntensity ?? 0.3;
      }
      this._matCache.set(Number(idStr), mat);
    }
  }

  /**
   * Rebuild all instanced meshes from world voxel data.
   * world.blocks is a flat Uint8Array [x + z*W + y*W*D].
   */
  rebuildMeshes(world) {
    // Clear old
    for (const mesh of this._instanceMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this._instanceMeshes.clear();

    const W = world.width, D = world.depth, H = world.height;

    // Count per block type
    const counts = new Map();
    for (let i = 0; i < world.blocks.length; i++) {
      const id = world.blocks[i];
      if (id === B.AIR) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    // Build one InstancedMesh per block type
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

  getTargetBlock(world) {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const meshes = [...this._instanceMeshes.values()].map(e => e.mesh);
    const hits = this.raycaster.intersectObjects(meshes);
    if (!hits.length) return null;
    const hit = hits[0];
    // World position from hit
    const p = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(-0.5));
    const bx = Math.floor(p.x + 0.5);
    const by = Math.floor(p.y + 0.5);
    const bz = Math.floor(p.z + 0.5);
    const norm = hit.face.normal.clone();
    return { x: bx, y: by, z: bz, face: norm, point: hit.point };
  }

  tick(dt) {
    // Flicker fire lights
    for (const l of this._fireLights) {
      l.intensity = 1.5 + Math.sin(Date.now() * 0.008) * 0.5 + Math.random() * 0.3;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
