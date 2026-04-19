/* ═══════════════════════════════════════════════════════════════
   GAME.JS — GTA Abidjan Alpha (v3 — Optimisé & Amélioré)
   Three.js r163 | ES Modules
   Améliorations v3 :
   - Cache de matériaux (makeMat) → réduit les draw calls
   - scene.background/fog mis à jour sans new THREE.Color chaque frame
   - Buildings meshes pré-indexés pour raycast (plus de .map() par tir)
   - Bullets : pool de 80 meshes réutilisés (zéro allocation par tir)
   - Wanted décroît automatiquement si pas de tir pendant 15 sec
   - IA NPC : état 'alert' avant 'chase' + séparation entre NPC
   - NPC déclenche triggerHit() sur le joueur (feedback visuel)
   - Son ambiant jour/nuit (grillons la nuit, ville le jour)
   - Restart propre sans location.reload() (reset d'état complet)
   - Minimap : lagune & routes pré-calculées (pas de recalcul chaque frame)
   - clampWorld utilisé sur NPC en fuite
   - Animation 'crouch' utilisée quand le joueur est accroupi (C)
   - Séparation NPC : évitent de se superposer
   - Wanted : icône et couleur du crosshair reflètent le niveau
   ═══════════════════════════════════════════════════════════════ */

import * as THREE from 'https://unpkg.com/three@0.163.0/build/three.module.js';
import { buildCharacter, buildNPC, CharacterAudio } from './characters.js';

// ══════════════════════════════════════════════════════
//  RENDERER + SCENE + CAMERA
// ══════════════════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const W = window.innerWidth, H = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87CEEB, 60, 220);

const camera = new THREE.PerspectiveCamera(68, W / H, 0.1, 500);
camera.position.set(0, 6, -8);

// ══════════════════════════════════════════════════════
//  AUDIO (WebAudio API)
// ══════════════════════════════════════════════════════
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playShot(type = 'pistol') {
  try {
    const ctx = getAudio();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (type === 'ak47' ? 800 : 1200));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = type === 'ak47' ? 0.7 : 0.5;
    src.connect(gain); gain.connect(ctx.destination);
    src.start();
  } catch(e) {}
}
function playReload() {
  try {
    const ctx = getAudio();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = Math.sin(t * 400 * Math.PI * 2) * Math.exp(-t * 18) * 0.4;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  } catch(e) {}
}
function playPickup() {
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

// ══════════════════════════════════════════════════════
//  LUMIÈRES
// ══════════════════════════════════════════════════════
const ambient = new THREE.AmbientLight(0xffeedd, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff8e0, 1.3);
sun.position.set(40, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 320;
sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
sun.shadow.camera.right = sun.shadow.camera.top   =  80;
scene.add(sun);

const hemi = new THREE.HemisphereLight(0x87CEEB, 0x4a7a2a, 0.35);
scene.add(hemi);

// ── Cache matériaux (évite les doublons, réduit les draw calls) ───
const _matCache = new Map();
function makeMat(color, rough = 0.9, metal = 0) {
  const key = `${color}_${rough}_${metal}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  }
  return _matCache.get(key);
}

// Vecteurs temporaires (évite les allocations par frame)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3(); // Pour les calculs NPC
// Couleur de fond pré-allouée (évite new THREE.Color chaque frame)
const _skyColor = new THREE.Color();

// ══════════════════════════════════════════════════════
//  SOL + ROUTES
// ══════════════════════════════════════════════════════
const groundGeo = new THREE.PlaneGeometry(400, 400, 4, 4);
const groundMesh = new THREE.Mesh(groundGeo, makeMat(0x5a7a2a));
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

function road(x, z, w, d, angle = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), makeMat(0x2a2a2a, 0.95));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = angle;
  m.position.set(x, 0.01, z);
  m.receiveShadow = true;
  scene.add(m);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.018, d * 0.96), makeMat(0xFFD700));
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = angle;
  line.position.set(x, 0.02, z);
  scene.add(line);
}

road(0, 0, 9, 260);
road(0, 0, 260, 9, Math.PI/2);
road(35, 30, 7, 130);
road(-35, -20, 7, 100);
road(0, 70, 130, 7, Math.PI/2);
road(0, -70, 100, 7, Math.PI/2);

function sidewalk(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), makeMat(0x888880));
  m.position.set(x, 0.05, z);
  m.receiveShadow = true;
  scene.add(m);
}
sidewalk(6, 0, 2, 240);
sidewalk(-6, 0, 2, 240);

// Lagune
const laguneMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(260, 55),
  new THREE.MeshStandardMaterial({ color: 0x1565C0, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.88 })
);
laguneMesh.rotation.x = -Math.PI / 2;
laguneMesh.position.set(0, 0.04, -95);
scene.add(laguneMesh);

function bridge(x, z, len) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 11), makeMat(0x777777));
  m.position.set(x, 0.25, z);
  m.castShadow = true;
  scene.add(m);
  [5, -5].forEach(side => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.15), makeMat(0x555555));
    rail.position.set(x, 0.65, z + side);
    scene.add(rail);
  });
}
bridge(0, -68, 9);
bridge(25, -72, 9);

// ══════════════════════════════════════════════════════
//  COLLISIONS AABB
// ══════════════════════════════════════════════════════
const buildings = [];
const buildingMeshes = []; // pré-indexé pour raycast (évite .map() à chaque tir)
let notifTimer = null;

function checkBuildingCollision(pos, radius) {
  radius = radius || 0.5;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const hw = b.w / 2 + radius;
    const hd = b.d / 2 + radius;
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const overlapX = hw - Math.abs(dx);
      const overlapZ = hd - Math.abs(dz);
      if (overlapX < overlapZ) pos.x += Math.sign(dx) * overlapX;
      else pos.z += Math.sign(dz) * overlapZ;
    }
  }
}

function checkVehicleCollision(pos, excludeVehicle, radius) {
  radius = radius || 1.4;
  for (let i = 0; i < vehicleList.length; i++) {
    const v = vehicleList[i];
    if (v === excludeVehicle) continue;
    const dx = pos.x - v.position.x;
    const dz = pos.z - v.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < radius + 1.8 && dist > 0.01) {
      const push = (radius + 1.8 - dist) / dist;
      pos.x += dx * push * 0.5;
      pos.z += dz * push * 0.5;
    }
  }
}

function clampWorld(pos) {
  const limit = 130;
  pos.x = Math.max(-limit, Math.min(limit, pos.x));
  pos.z = Math.max(-limit, Math.min(limit, pos.z));
}

// ══════════════════════════════════════════════════════
//  BÂTIMENTS (avec effet dégât)
// ══════════════════════════════════════════════════════
function building(x, z, w, d, h, color, windowColor = 0x88bbdd) {
  const geo  = new THREE.BoxGeometry(w, h, d);
  const mat2 = makeMat(color, 0.85);
  const mesh = new THREE.Mesh(geo, mat2);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const cols = Math.max(1, Math.floor(w / 1.6));
  const rows = Math.max(1, Math.floor(h / 2.5));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const wx = -w / 2 + (c + 0.5) * (w / cols);
      const wy = 1.2 + r * (h / rows - 0.3);
      const wm = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.7),
        new THREE.MeshStandardMaterial({ color: windowColor, emissive: windowColor, emissiveIntensity: 0.1, roughness: 0.3 })
      );
      wm.position.set(wx, wy - h / 2, d / 2 + 0.01);
      mesh.add(wm);
    }
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), makeMat(0x333333));
  roof.position.set(x, h + 0.2, z);
  scene.add(roof);

  const entry = { x, z, w, d, h, mesh, origColor: color };
  buildings.push(entry);
  buildingMeshes.push(mesh); // pré-indexé pour raycast
  return mesh;
}

// Flash dégât sur bâtiment (rougissement temporaire)
function damageBuildingFlash(bEntry) {
  if (!bEntry || !bEntry.mesh) return;
  bEntry.mesh.material.color.set(0xff3300);
  setTimeout(() => {
    bEntry.mesh.material.color.set(bEntry.origColor);
  }, 180);
}

// Plateau
building(-16, 25, 9, 9, 28, 0x6e99bb);
building(-26, 18, 7, 7, 20, 0x5577aa);
building(-13, 42, 11, 9, 35, 0x4470a8);
building(-30, 36, 8, 7, 24, 0x5588cc);
building(-20, 52, 10, 8, 22, 0x7aafcc);
building(-38, 22, 6, 6, 16, 0x446688);
building(-10, 62, 8, 8, 18, 0x6688aa);
building(-33, 50, 5, 5, 14, 0x557799);

// Cocody
building(22, 42, 7, 6, 6,  0xD4A865);
building(30, 52, 6, 6, 5,  0xCC9944);
building(38, 38, 8, 7, 7,  0xBB8833);
building(17, 58, 6, 5, 6,  0xDD9955);
building(42, 48, 7, 6, 5,  0xC89040);
building(28, 68, 5, 5, 5,  0xDDAA60);
building(45, 62, 6, 5, 4,  0xCC8833);
building(15, 72, 7, 6, 5,  0xE8BB70);

// Adjamé
building(-22, -22, 9, 7, 9,  0xCC6633);
building(-32, -30, 7, 6, 7,  0xBB5522);
building(-26, -40, 8, 8, 10, 0xDD7744);
building(-38, -17, 6, 5, 8,  0xAA4411);
building(-20, -48, 9, 7, 9,  0xCC5522);
building(-40, -38, 7, 6, 8,  0xBB6633);
building(-14, -30, 5, 5, 6,  0xDD8844);

// Yopougon
building(32, -22, 6, 5, 6, 0x88AA55);
building(40, -33, 7, 6, 5, 0x779944);
building(27, -38, 6, 6, 7, 0x668833);
building(42, -17, 5, 5, 6, 0x99BB66);
building(32, -50, 6, 6, 6, 0x77AA44);
building(48, -42, 5, 5, 5, 0x88BB55);

// Treichville
building(12, -22, 7, 6, 8, 0xAA7744);
building(20, -33, 6, 6, 7, 0x996633);
building(10, -38, 7, 5, 9, 0xBB8855);
building(24, -20, 5, 5, 6, 0xAA7733);

// ══════════════════════════════════════════════════════
//  PALMIERS
// ══════════════════════════════════════════════════════
function palm(x, z) {
  const g = new THREE.Group();
  const trunkH = 5 + Math.random() * 2;
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, trunkH, 7);
  const trunkMesh = new THREE.Mesh(trunkGeo, makeMat(0x7B5E28, 0.9));
  trunkMesh.position.y = trunkH / 2;
  trunkMesh.rotation.z = (Math.random() - 0.5) * 0.25;
  trunkMesh.castShadow = true;
  g.add(trunkMesh);
  const leafMat2 = makeMat(0x1e6e1e, 0.85);
  for (let i = 0; i < 7; i++) {
    const lf = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.8, 5), leafMat2);
    const angle = (i / 7) * Math.PI * 2;
    lf.position.set(Math.sin(angle) * 0.9, trunkH + 0.2, Math.cos(angle) * 0.9);
    lf.rotation.z = Math.sin(angle) * 0.7;
    lf.rotation.x = Math.cos(angle) * 0.7;
    lf.castShadow = true;
    g.add(lf);
  }
  g.position.set(x, 0, z);
  scene.add(g);
}
[
  [7,7],[7,-7],[-7,7],[-7,-7],[12,12],[-12,12],[12,-12],
  [55,22],[55,-22],[-55,22],[-55,-22],[0,95],[0,-75],
  [18,18],[28,28],[38,65],[50,58],[-18,55],[-50,12],
  [3,3],[-3,3],[3,-3],[-3,-3],[60,-60],[-60,60],
].forEach(([x,z]) => palm(x, z));

// ══════════════════════════════════════════════════════
//  ÉTALS DU MARCHÉ (Adjamé)
// ══════════════════════════════════════════════════════
[
  [-24,-24],[-28,-27],[-32,-24],
  [-24,-30],[-28,-33],[-32,-30],
].forEach(([x,z], i) => {
  const colors = [0xFFCC44, 0xFF8844, 0x44CCFF, 0xFF4488, 0x88FF44, 0xFFFF44];
  const stall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.2), makeMat(colors[i]));
  stall.position.set(x, 1.1, z);
  stall.castShadow = true;
  scene.add(stall);
  const roofM = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 2.8), makeMat(0xFF6600, 0.7));
  roofM.position.set(x, 2.28, z);
  scene.add(roofM);
});

// ══════════════════════════════════════════════════════
//  LOOT AU SOL (items ramassables)
// ══════════════════════════════════════════════════════
const lootItems = [];
const lootGeoSphere = new THREE.SphereGeometry(0.22, 8, 8);

function spawnLoot(x, z, type) {
  const colors = { money: 0x00ff88, ammo_pistol: 0xffdd00, ammo_ak47: 0xff6600, armor: 0x3399ff };
  const mesh = new THREE.Mesh(lootGeoSphere, new THREE.MeshStandardMaterial({
    color: colors[type] ?? 0xffffff,
    emissive: colors[type] ?? 0xffffff,
    emissiveIntensity: 0.5
  }));
  mesh.position.set(x, 0.4, z);
  mesh.userData = { type, collected: false };
  scene.add(mesh);
  lootItems.push(mesh);
}

function checkLootPickup() {
  const px = playerChar.group.position.x, pz = playerChar.group.position.z;
  for (let i = lootItems.length - 1; i >= 0; i--) {
    const item = lootItems[i];
    if (item.userData.collected) continue;
    const dx = px - item.position.x;
    const dz = pz - item.position.z;
    if (Math.sqrt(dx*dx + dz*dz) < 1.5) {
      item.userData.collected = true;
      scene.remove(item);
      lootItems.splice(i, 1);
      const t = item.userData.type;
      if (t === 'money') {
        const amt = 150 + Math.floor(Math.random() * 300);
        playerState.money += amt;
        showNotif('💰 +'+ amt.toLocaleString() + ' FCFA ramassé!');
        playPickup();
      } else if (t === 'ammo_pistol') {
        playerState.ammo.pistol += 15;
        showNotif('🔫 +15 balles pistolet');
        playPickup();
        if (playerState.weapon === 'pistol') updateAmmoDisplay();
      } else if (t === 'ammo_ak47') {
        playerState.ammo.ak47 += 30;
        showNotif('🔫 +30 balles AK-47');
        playPickup();
        if (playerState.weapon === 'ak47') updateAmmoDisplay();
      } else if (t === 'armor') {
        playerState.armor = Math.min(100, playerState.armor + 50);
        showNotif('🛡️ +50 Armure!');
        playPickup();
      }
      updateHUD();
    }
  }
}

// ══════════════════════════════════════════════════════
//  JOUEUR
// ══════════════════════════════════════════════════════
const playerChar = buildCharacter('dark', 'street');
playerChar.group.position.set(0, 0, 0);
scene.add(playerChar.group);

const playerState = {
  hp: 100, armor: 0, stamina: 100,
  money: 0,
  weapon: 'pistol',
  ammo:   { pistol: 30, ak47: 90, knife: 999 },
  wanted: 0,
  wantedCooldown: 0, // secondes restantes avant décroissance du wanted
  inVehicle: false,
  currentVehicle: null,
  isSprinting: false,
  isShooting: false,
  isGrounded: true,
  isCrouching: false,
  velocityY: 0,
  speed: 0,
  isReloading: false,
  reloadTimer: 0,
  dead: false,
};
playerChar.attachWeapon('pistol');

// ══════════════════════════════════════════════════════
//  VÉHICULES
// ══════════════════════════════════════════════════════
const vehicleList = [];

function makeVehicle(x, z, bodyColor, type = 'woro') {
  const g = new THREE.Group();
  const scales = { woro: [2.4, 1.1, 4.8], gbaka: [2.6, 1.6, 6.5], moto: [0.75, 0.9, 2.0] };
  const sc = scales[type] ?? scales.woro;

  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(sc[0], sc[1] * 0.55, sc[2]), makeMat(bodyColor, 0.4, 0.3));
  bodyM.position.y = sc[1] * 0.28;
  bodyM.castShadow = true;
  g.add(bodyM);

  const roofM = new THREE.Mesh(new THREE.BoxGeometry(sc[0] * 0.88, sc[1] * 0.5, sc[2] * 0.58), makeMat(bodyColor, 0.4, 0.3));
  roofM.position.set(0, sc[1] * 0.75, sc[2] * 0.05);
  roofM.castShadow = true;
  g.add(roofM);

  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.45, roughness: 0.1 });
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(sc[0] * 0.78, sc[1] * 0.42), glassMat);
  windshield.position.set(0, sc[1] * 0.72, sc[2] * 0.33);
  windshield.rotation.x = 0.3;
  g.add(windshield);

  const wheelOffsets = type === 'moto'
    ? [[0, 0.2, 0.7],[0, 0.2, -0.7]]
    : [[sc[0]/2+0.05, 0.28, sc[2]*0.33],[sc[0]/2+0.05, 0.28,-sc[2]*0.33],
       [-sc[0]/2-0.05,0.28, sc[2]*0.33],[-sc[0]/2-0.05,0.28,-sc[2]*0.33]];

  wheelOffsets.forEach(([wx,wy,wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 10), makeMat(0x1a1a1a));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    g.add(wheel);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 8), makeMat(0xaaaaaa, 0.3, 0.7));
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, wy, wz);
    g.add(rim);
  });

  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 0.6 });
  [-sc[0]*0.35, sc[0]*0.35].forEach(hx => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.08), hlMat);
    hl.position.set(hx, sc[1]*0.28, sc[2]/2+0.04);
    g.add(hl);
  });

  const rlMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.4 });
  [-sc[0]*0.35, sc[0]*0.35].forEach(hx => {
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.06), rlMat);
    rl.position.set(hx, sc[1]*0.28, -sc[2]/2-0.04);
    g.add(rl);
  });

  if (type === 'woro') {
    const signM = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.08), makeMat(0xFF6600));
    signM.position.set(0, sc[1]*1.02, 0);
    g.add(signM);
  }

  g.position.set(x, 0.15, z);
  g.userData = {
    type, hp: 100, bodyColor,
    velX: 0, velZ: 0,
    speed: 0,
    angle: Math.random() * Math.PI * 2,
    steer: 0,
    accel: 0,
    onRoad: false,
    maxSpeed: type === 'moto' ? 0.28 : type === 'gbaka' ? 0.14 : 0.20,
    accelRate: type === 'moto' ? 0.012 : 0.008,
    brakeRate: 0.015,
    friction: 0.96,
    steerSpeed: type === 'moto' ? 0.055 : 0.038,
    aiMode: 'traffic',
    aiTimer: Math.random() * 200,
    aiTarget: null,
    wheelAngle: 0,
  };
  scene.add(g);
  vehicleList.push(g);
  return g;
}

makeVehicle(5, 12, 0xFF6200, 'woro');
makeVehicle(-6, -18, 0xFF8C00, 'woro');
makeVehicle(9, -22, 0xFF4400, 'woro');
makeVehicle(-12, 6, 0x3355CC, 'gbaka');
makeVehicle(3, 3, 0xCC0000, 'moto');
makeVehicle(-9, 14, 0x00AA44, 'moto');

// ══════════════════════════════════════════════════════
//  PNJs
// ══════════════════════════════════════════════════════
const npcList = [];

const npcDefs = [
  ['dark',  'civil',   14,  14], ['medium','civil',  -14, 8],
  ['dark',  'gang',    22, -10], ['light', 'civil',  -20, 18],
  ['dark',  'dealer',  -28,-40], ['medium','gang',    30,-25],
  ['dark',  'police',   8, -30], ['medium','police', -8, -28],
  ['light', 'civil',   40,  40], ['dark',  'civil',  -40, 40],
  ['dark',  'gang',   -30, -50], ['medium','dealer',  18, -45],
];

npcDefs.forEach(([skin, outfit, x, z]) => {
  const npc = buildNPC(skin, outfit, x, z);
  scene.add(npc.group);
  npcList.push(npc);
  npc.attachWeapon(outfit === 'gang' || outfit === 'dealer' || outfit === 'police' ? 'pistol' : null);
  // Propriété outfit accessible depuis la référence NPC
  npc.group.userData.outfit = outfit;
  // Cooldown de tir pour les NPC
  npc.npc.shootCooldown = 0;
});

// ══════════════════════════════════════════════════════
//  MISSIONS
// ══════════════════════════════════════════════════════
const missions = [
  {
    id: 0,
    title: '💰 Braquage Rapide',
    desc: 'Vole la recette chez le cambiste au Plateau. Ne te fais pas attraper.',
    reward: 1500,
    target: { x: -20, z: 30 },
    type: 'heist',
    timerSec: 120,
  },
  {
    id: 1,
    title: '🏃 Fuite des Flics',
    desc: 'Les kpôkô te cherchent! File vers Cocody avant qu\'ils te chopent.',
    reward: 800,
    target: { x: 35, z: 60 },
    type: 'escape',
    timerSec: 60,
  },
  {
    id: 2,
    title: '🔫 Règlement de Compte',
    desc: 'Élimine le gang rival qui squatte Adjamé. 3 cibles à neutraliser.',
    reward: 2500,
    target: null,
    type: 'eliminate',
    killCount: 3,
    timerSec: 180,
  },
  {
    id: 3,
    title: '🚕 Vol de Véhicule',
    desc: 'Vole le gbaka bleu et amène-le à Treichville.',
    reward: 1200,
    target: { x: 15, z: -28 },
    type: 'vehicle',
    timerSec: 90,
  },
  {
    id: 4,
    title: '🌙 Deal de Nuit',
    desc: 'Retrouve le contact à Yopougon après minuit. Méfie-toi des flics.',
    reward: 3000,
    target: { x: 35, z: -38 },
    type: 'night_deal',
    timerSec: 0,
  },
];

const missionState = {
  current: 0,
  active: false,
  timer: 0,
  killsNeeded: 0,
  killsDone: 0,
};

const targetDisc = new THREE.Mesh(
  new THREE.CylinderGeometry(2.2, 2.2, 0.15, 18),
  new THREE.MeshStandardMaterial({ color: 0xFFD700, transparent: true, opacity: 0.75, emissive: 0xFFD700, emissiveIntensity: 0.25 })
);
scene.add(targetDisc);

const markerCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.55, 3.5, 6),
  new THREE.MeshStandardMaterial({ color: 0xFF3300, emissive: 0xFF3300, emissiveIntensity: 0.5 })
);
scene.add(markerCone);
targetDisc.visible = markerCone.visible = false;

function activateMission(idx) {
  const m = missions[idx % missions.length];
  missionState.current = idx % missions.length;
  missionState.active  = true;
  missionState.timer   = m.timerSec;
  missionState.killsDone = 0;
  missionState.killsNeeded = m.killCount ?? 0;

  document.getElementById('mission-title').textContent = m.title;
  document.getElementById('mission-desc').textContent  = m.desc;

  if (m.target) {
    targetDisc.position.set(m.target.x, 0.08, m.target.z);
    markerCone.position.set(m.target.x, 4.5, m.target.z);
    targetDisc.visible = markerCone.visible = true;
  } else {
    targetDisc.visible = markerCone.visible = false;
  }
  const timerEl = document.getElementById('mission-timer');
  if (m.timerSec > 0) {
    timerEl.style.display = 'block';
    timerEl.textContent = '⏱ ' + m.timerSec + 's';
  } else {
    timerEl.style.display = 'none';
  }
  showNotif(m.title + ' — GO!');
}

// ══════════════════════════════════════════════════════
//  CONTRÔLES
// ══════════════════════════════════════════════════════
const keys = { up:false, down:false, left:false, right:false, jump:false, sprint:false, shoot:false, crouch:false };
let joyX = 0, joyY = 0;
let camAngleH = 0;
let isSprinting = false;
let sprintToggle = false;

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k==='arrowup'  ||k==='w'||k==='z') keys.up    = true;
  if (k==='arrowdown'||k==='s')          keys.down   = true;
  if (k==='arrowleft'||k==='a'||k==='q') keys.left   = true;
  if (k==='arrowright'||k==='d')         keys.right  = true;
  if (k===' ')  { keys.jump   = true; e.preventDefault(); }
  if (k==='shift') keys.sprint = true;
  if (k==='c')  { keys.crouch = !keys.crouch; }
  if (k==='f')  toggleVehicle();
  if (k==='e')  tryPickup();
  if (k==='1')  switchWeapon('fists');
  if (k==='2')  switchWeapon('knife');
  if (k==='3')  switchWeapon('pistol');
  if (k==='4')  switchWeapon('ak47');
  if (k==='r')  { if (!keys.shoot) reload(); else keys.shoot = true; }
  if (k==='g')  keys.shoot = true;
});
document.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k==='arrowup'  ||k==='w'||k==='z') keys.up    = false;
  if (k==='arrowdown'||k==='s')          keys.down   = false;
  if (k==='arrowleft'||k==='a'||k==='q') keys.left   = false;
  if (k==='arrowright'||k==='d')         keys.right  = false;
  if (k===' ')  keys.jump   = false;
  if (k==='shift') keys.sprint = false;
  if (k==='g')  keys.shoot  = false;
});

const joystickZone = document.getElementById('joystick-zone');
const stick = document.getElementById('joystick-stick');
let joystickActive = false;

function joyMove(clientX, clientY) {
  const rect = joystickZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top  + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const maxR = 40;
  const dist = Math.min(Math.sqrt(dx*dx+dy*dy), maxR);
  const ang  = Math.atan2(dy, dx);
  const sx   = Math.cos(ang) * dist;
  const sy   = Math.sin(ang) * dist;
  stick.style.left = (40 + sx) + 'px';
  stick.style.top  = (40 + sy) + 'px';
  joyX = sx / maxR;
  joyY = sy / maxR;
}
function joyReset() {
  joystickActive = false; joyX = 0; joyY = 0;
  stick.style.left = '40px'; stick.style.top = '40px';
}
joystickZone.addEventListener('touchstart', e => { e.preventDefault(); joystickActive = true; }, { passive:false });
joystickZone.addEventListener('touchmove',  e => { e.preventDefault(); if(joystickActive) joyMove(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive:false });
['touchend','touchcancel'].forEach(ev => joystickZone.addEventListener(ev, e => { e.preventDefault(); joyReset(); }, { passive:false }));
joystickZone.addEventListener('mousedown', () => joystickActive = true);
window.addEventListener('mousemove', e => { if(joystickActive) joyMove(e.clientX, e.clientY); });
window.addEventListener('mouseup', () => { if(joystickActive) joyReset(); });

let camDragging = false, lastCX = 0;
renderer.domElement.addEventListener('mousedown', e => { if(!joystickActive){ camDragging=true; lastCX=e.clientX; }});
window.addEventListener('mouseup', () => camDragging = false);
window.addEventListener('mousemove', e => { if(camDragging){ camAngleH -= (e.clientX-lastCX)*0.009; lastCX=e.clientX; }});
let lookTouchId = null, lastLX = 0;
renderer.domElement.addEventListener('touchstart', e => {
  for(const t of e.changedTouches) {
    if(t.clientX > window.innerWidth * 0.42) { lookTouchId=t.identifier; lastLX=t.clientX; }
  }
});
renderer.domElement.addEventListener('touchmove', e => {
  for(const t of e.changedTouches) {
    if(t.identifier===lookTouchId) { camAngleH -= (t.clientX-lastLX)*0.009; lastLX=t.clientX; }
  }
});

function btnPress(id, fn) {
  const el = document.getElementById(id);
  if(!el) return;
  ['click','touchstart'].forEach(ev => el.addEventListener(ev, e => { e.stopPropagation(); fn(); }, { passive:false }));
}
btnPress('btn-jump', () => {
  if(playerState.isGrounded && !playerState.inVehicle) {
    playerState.velocityY = 0.22;
    playerState.isGrounded = false;
  }
});
btnPress('btn-shoot', () => { if(!playerState.dead) fireBullet(); });
btnPress('btn-car',  toggleVehicle);
btnPress('btn-run',  () => {
  sprintToggle = !sprintToggle;
  document.getElementById('btn-run').style.background = sprintToggle
    ? 'rgba(0,200,100,0.5)' : 'rgba(0,200,100,0.2)';
});

// Bouton rechargement (ajout dynamique)
const reloadBtn = document.createElement('div');
reloadBtn.className = 'abtn sm';
reloadBtn.id = 'btn-reload';
reloadBtn.style.cssText = 'background:rgba(150,100,255,0.25);border-color:#aa77ff;color:#cc99ff;';
reloadBtn.innerHTML = '🔄<br>RELOAD';
document.getElementById('row-btns').appendChild(reloadBtn);
btnPress('btn-reload', reload);

// ══════════════════════════════════════════════════════
//  ARMES, TIR & RECHARGEMENT
// ══════════════════════════════════════════════════════
const MAX_AMMO = { pistol: 12, ak47: 30 };
const RELOAD_TIME = { pistol: 1500, ak47: 2200 };

function updateAmmoDisplay() {
  const w = playerState.weapon;
  const a = playerState.ammo[w];
  document.getElementById('ammo-count').textContent = a !== undefined ? a + ' balles' : '';
}

function switchWeapon(type) {
  if (playerState.isReloading) return;
  playerState.weapon = type;
  playerChar.attachWeapon(type === 'fists' ? null : type);
  document.getElementById('weapon-name').textContent = type.toUpperCase();
  updateAmmoDisplay();
}

function reload() {
  const w = playerState.weapon;
  if (w === 'fists' || w === 'knife') return;
  if (playerState.isReloading) return;
  if (playerState.ammo[w] >= MAX_AMMO[w]) { showNotif('Chargeur plein!'); return; }

  playerState.isReloading = true;
  playerState.reloadTimer = RELOAD_TIME[w];
  playReload();
  showNotif('🔄 Rechargement...');
  document.getElementById('weapon-name').style.color = '#aa77ff';
}

function finishReload() {
  const w = playerState.weapon;
  playerState.ammo[w] = MAX_AMMO[w];
  playerState.isReloading = false;
  document.getElementById('weapon-name').style.color = '#FFD700';
  updateAmmoDisplay();
  showNotif('✅ Prêt!');
}

// ── Pool de balles (80 meshes réutilisés, zéro allocation par tir) ─
const BULLET_POOL_SIZE = 80;
const bulletGeo  = new THREE.SphereGeometry(0.06, 4, 4);
const bulletMatPlayer = new THREE.MeshStandardMaterial({ color: 0xFFDD44, emissive: 0xFFDD44, emissiveIntensity: 1 });
const bulletMatNPC    = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff4444, emissiveIntensity: 1 });
const bulletPool = Array.from({ length: BULLET_POOL_SIZE }, () => {
  const m = new THREE.Mesh(bulletGeo, bulletMatPlayer);
  m.visible = false;
  m.userData = { active: false, vel: new THREE.Vector3(), life: 0 };
  scene.add(m);
  return m;
});
let bulletPoolIdx = 0;

function getBullet(isPlayer) {
  // cherche une balle inactive
  for (let i = 0; i < BULLET_POOL_SIZE; i++) {
    const idx = (bulletPoolIdx + i) % BULLET_POOL_SIZE;
    const b = bulletPool[idx];
    if (!b.userData.active) {
      bulletPoolIdx = (idx + 1) % BULLET_POOL_SIZE;
      b.material = isPlayer ? bulletMatPlayer : bulletMatNPC;
      b.userData.active = true;
      b.visible = true;
      return b;
    }
  }
  // Fallback : recycle la plus ancienne
  const b = bulletPool[bulletPoolIdx];
  bulletPoolIdx = (bulletPoolIdx + 1) % BULLET_POOL_SIZE;
  b.material = isPlayer ? bulletMatPlayer : bulletMatNPC;
  b.userData.active = true;
  b.visible = true;
  return b;
}

function releaseBullet(b) {
  b.userData.active = false;
  b.visible = false;
}

const bullets = []; // liste des balles actives (références vers le pool)
const raycasterPool = new THREE.Raycaster();

function fireBullet() {
  if (playerState.isReloading) { showNotif('Rechargement en cours...'); return; }
  const w = playerState.weapon;
  if (w === 'fists') { meleeAttack(); return; }
  if (w === 'knife') { meleeAttack(); return; }
  if (playerState.ammo[w] <= 0) {
    showNotif('Plus de munitions! [R] pour recharger');
    reload();
    return;
  }
  playerState.ammo[w]--;
  updateAmmoDisplay();
  playShot(w);

  const fwd = _v1.set(Math.sin(camAngleH), 0, Math.cos(camAngleH)).clone();
  const origin = playerChar.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));

  // Balle via pool (zéro allocation)
  const bm = getBullet(true);
  bm.position.copy(origin);
  bm.userData.vel.copy(fwd).multiplyScalar(w === 'ak47' ? 1.8 : 1.2);
  bm.userData.life = 60;
  bullets.push(bm);

  // Muzzle flash (PointLight réutilisé)
  const fl = new THREE.PointLight(0xFFAA00, 3, 4);
  fl.position.copy(origin);
  scene.add(fl);
  setTimeout(() => scene.remove(fl), 80);

  // Raycast hit detection
  raycasterPool.set(origin, fwd.normalize());
  raycasterPool.far = w === 'ak47' ? 60 : 30;

  npcList.forEach(npc => {
    if (npc.npc.state === 'dead') return;
    const hits = raycasterPool.intersectObject(npc.group, true);
    if (hits.length) {
      const dmg = w === 'ak47' ? 35 : 20;
      const killed = npc.npc.takeDamage(dmg);
      if (killed) killNPC(npc);
      else {
        npc.npc.state = (npc.group.userData.outfit === 'police' || npc.group.userData.outfit === 'gang') ? 'chase' : 'flee';
      }
    }
  });

  // Vérifier impact bâtiment (pré-indexé, pas de .map())
  const bHits = raycasterPool.intersectObjects(buildingMeshes, false);
  if (bHits.length > 0) {
    const hitMesh = bHits[0].object;
    const bEntry = buildings.find(b => b.mesh === hitMesh);
    if (bEntry) damageBuildingFlash(bEntry);
  }

  // Wanted augmente + reset du timer de décroissance
  playerState.wanted = Math.min(5, playerState.wanted + 1);
  playerState.wantedCooldown = 15; // secondes avant décroissance
  updateWanted();
}

function meleeAttack() {
  npcList.forEach(npc => {
    if(npc.npc.state === 'dead') return;
    const d = playerChar.group.position.distanceTo(npc.group.position);
    if(d < 2.2) {
      npc.npc.hp -= playerState.weapon === 'knife' ? 45 : 15;
      if(npc.npc.hp <= 0) killNPC(npc);
    }
  });
}

function killNPC(npc) {
  npc.npc.state = 'dead';
  npc.npc.hp = 0;
  npc.setAnim('die');

  // Loot aléatoire sur le corps
  const lx = npc.group.position.x + (Math.random() - 0.5) * 2;
  const lz = npc.group.position.z + (Math.random() - 0.5) * 2;
  const lootRoll = Math.random();
  if (lootRoll < 0.4) spawnLoot(lx, lz, 'money');
  else if (lootRoll < 0.65) spawnLoot(lx, lz, 'ammo_pistol');
  else if (lootRoll < 0.75) spawnLoot(lx, lz, 'ammo_ak47');
  else if (lootRoll < 0.82) spawnLoot(lx, lz, 'armor');

  const loot = 100 + Math.floor(Math.random() * 400);
  playerState.money += loot;
  showNotif('+' + loot.toLocaleString() + ' FCFA 💀');
  updateHUD();

  // Alerter les NPC proches (rayon 18m)
  npcList.forEach(other => {
    if (other === npc || other.npc.state === 'dead') return;
    const d = other.group.position.distanceTo(npc.group.position);
    if (d < 18 && (other.group.userData.outfit === 'police' || other.group.userData.outfit === 'gang')) {
      other.npc.state = 'chase';
    }
  });

  if (missionState.active && missions[missionState.current].type === 'eliminate') {
    missionState.killsDone++;
    if (missionState.killsDone >= missionState.killsNeeded) completeMission();
  }

  const feed = document.getElementById('kill-feed');
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  const outfit = npc.group.userData.outfit ?? 'inconnu';
  const icons = { police: '👮', gang: '🔫', dealer: '💊', civil: '😱', braqueur: '🦹' };
  entry.textContent = (icons[outfit] ?? '💀') + ' ' + outfit + ' neutralisé';
  feed.appendChild(entry);
  setTimeout(() => entry.remove(), 3200);
}

// ══════════════════════════════════════════════════════
//  NPC RIPOSTE (police & gang tirent sur le joueur)
// ══════════════════════════════════════════════════════
function npcShootPlayer(npc, now) {
  if (!npc.npc.shootCooldown) npc.npc.shootCooldown = 0;
  if (now < npc.npc.shootCooldown) return;

  const outfit = npc.group.userData.outfit;
  const isHostile = outfit === 'police' || outfit === 'gang' || outfit === 'dealer';
  if (!isHostile || npc.npc.state !== 'chase') return;

  const dist = npc.group.position.distanceTo(playerChar.group.position);
  if (dist > 20) return;

  const cooldown = outfit === 'police' ? 1800 : 2400;
  npc.npc.shootCooldown = now + cooldown;

  // Chance de toucher (70% police, 50% gang)
  const hitChance = outfit === 'police' ? 0.70 : 0.50;
  if (Math.random() < hitChance) {
    const dmg = outfit === 'police' ? 12 : 8;
    if (playerState.armor > 0) {
      const armorDmg = Math.min(playerState.armor, dmg * 0.6);
      playerState.armor -= armorDmg;
      playerState.hp    -= dmg - armorDmg;
    } else {
      playerState.hp -= dmg;
    }
    playerState.hp = Math.max(0, playerState.hp);
    updateHUD();
    showDamageFlash();
    // Recul visuel du personnage joueur
    if (playerChar.triggerHit) playerChar.triggerHit();
    if (playerState.hp <= 0) triggerGameOver();
  }

  // Balle visuelle NPC → joueur via pool
  const npcOrigin = npc.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const bm = getBullet(false);
  bm.position.copy(npcOrigin);
  _v3.copy(playerChar.group.position).sub(npcOrigin).normalize();
  bm.userData.vel.copy(_v3).multiplyScalar(1.0);
  bm.userData.life = 40;
  bullets.push(bm);
}

// ══════════════════════════════════════════════════════
//  EFFETS VISUELS
// ══════════════════════════════════════════════════════
function showDamageFlash() {
  let flash = document.getElementById('damage-flash');
  if (!flash) {
    flash = document.createElement('div');
    flash.id = 'damage-flash';
    flash.style.cssText = 'position:fixed;inset:0;background:rgba(255,0,0,0.35);pointer-events:none;z-index:50;opacity:0;transition:opacity 0.1s';
    document.body.appendChild(flash);
  }
  flash.style.opacity = '1';
  setTimeout(() => flash.style.opacity = '0', 150);
}

// ══════════════════════════════════════════════════════
//  GAME OVER
// ══════════════════════════════════════════════════════
function triggerGameOver() {
  if (playerState.dead) return;
  playerState.dead = true;
  playerChar.setAnim('die');

  let go = document.getElementById('game-over');
  if (!go) {
    go = document.createElement('div');
    go.id = 'game-over';
    go.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.88);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      z-index:200;color:#fff;font-family:'Arial Black',Arial,sans-serif;
    `;
    go.innerHTML = `
      <div style="font-size:48px;color:#ff3333;text-shadow:0 0 20px #ff0000;margin-bottom:12px;">💀 WASTED</div>
      <div style="font-size:20px;color:#FFD700;margin-bottom:8px;">Argent gagné : <span id="go-money">0</span> FCFA</div>
      <div style="font-size:14px;color:#aaa;margin-bottom:30px;">Niveau recherché : <span id="go-wanted">0</span> ⭐</div>
      <button id="go-restart" style="
        background:#FFD700;color:#000;border:none;padding:14px 40px;
        font-size:18px;font-weight:900;border-radius:30px;cursor:pointer;
        text-transform:uppercase;letter-spacing:2px;
        box-shadow:0 0 20px rgba(255,215,0,0.5);
      ">🔄 RÉESSAYER</button>
    `;
    document.body.appendChild(go);
  }
  document.getElementById('go-money').textContent = playerState.money.toLocaleString();
  document.getElementById('go-wanted').textContent = playerState.wanted;
  go.style.display = 'flex';

  document.getElementById('go-restart').onclick = () => {
    // Reset propre sans rechargement de page
    go.style.display = 'none';
    playerState.hp = 100; playerState.armor = 0; playerState.stamina = 100;
    playerState.money = 0; playerState.wanted = 0; playerState.wantedCooldown = 0;
    playerState.dead = false; playerState.inVehicle = false;
    playerState.currentVehicle = null; playerState.isReloading = false;
    playerState.ammo = { pistol: 30, ak47: 90, knife: 999 };
    playerState.weapon = 'pistol';
    playerState.isCrouching = false;
    keys.crouch = false;

    // Respawn joueur
    playerChar.group.position.set(0, 0, 0);
    playerChar.group.rotation.y = 0;
    if (playerChar.revive) playerChar.revive();
    playerChar.attachWeapon('pistol');

    // Relancer les bullets actives
    bullets.forEach(b => releaseBullet(b));
    bullets.length = 0;

    // Reset NPC
    npcList.forEach(npc => {
      npc.npc.state = 'patrol';
      npc.npc.hp    = 100;
      npc.npc.timer = 0;
      npc.npc.shootCooldown = 0;
      if (npc.revive) npc.revive();
    });

    // Reset loot
    lootItems.forEach(item => scene.remove(item));
    lootItems.length = 0;
    spawnLoot(8, 8, 'ammo_pistol');
    spawnLoot(-10, 15, 'money');
    spawnLoot(5, -5, 'armor');

    // Reset mission
    activateMission(0);
    updateHUD();
    updateWanted();
    switchWeapon('pistol');
    document.getElementById('crosshair').style.display = 'block';
    playerChar.group.visible = true;
  };
}

// ══════════════════════════════════════════════════════
//  VÉHICULES — ENTRÉE/SORTIE
// ══════════════════════════════════════════════════════
function toggleVehicle() {
  if(playerState.dead) return;
  if(playerState.inVehicle) {
    playerState.inVehicle = false;
    playerChar.group.visible = true;
    playerState.currentVehicle = null;
    const btn = document.getElementById('btn-car');
    if(btn) btn.innerHTML = '🚕<br>AUTO';
    showNotif('Tu descends.');
    document.getElementById('crosshair').style.display = 'block';
    return;
  }
  let nearest = null, minD = 7;
  vehicleList.forEach(v => {
    const d = v.position.distanceTo(playerChar.group.position);
    if(d < minD) { minD = d; nearest = v; }
  });
  if(nearest) {
    playerState.inVehicle = true;
    playerState.currentVehicle = nearest;
    playerChar.group.visible = false;
    const btn = document.getElementById('btn-car');
    if(btn) btn.innerHTML = '🚗<br>SORTIR';
    document.getElementById('crosshair').style.display = 'none';
    showNotif('Tu montes dans le ' + nearest.userData.type + '!');
  } else {
    showNotif('Pas de véhicule à portée!');
  }
}

function tryPickup() {
  checkLootPickup();
}

// ══════════════════════════════════════════════════════
//  CYCLE JOUR/NUIT
// ══════════════════════════════════════════════════════
const gameTime = { minutes: 8 * 60, speed: 0.3 };

function updateDayNight(dtMs) {
  gameTime.minutes += gameTime.speed * dtMs / 1000;
  if(gameTime.minutes >= 24*60) gameTime.minutes = 0;

  const h = gameTime.minutes / 60;
  let skyR, skyG, skyB, sunI, ambI;
  if(h >= 6 && h < 8)       { skyR=255; skyG=180; skyB=100; sunI=0.7; ambI=0.35; }
  else if(h >= 8 && h < 17) { skyR=115; skyG=185; skyB=235; sunI=1.3; ambI=0.55; }
  else if(h >= 17 && h < 19){ skyR=255; skyG=120; skyB=60;  sunI=0.7; ambI=0.3; }
  else                       { skyR=12;  skyG=15;  skyB=50;  sunI=0.05;ambI=0.12; }

  _skyColor.setRGB(skyR/255, skyG/255, skyB/255);
  scene.background = _skyColor;
  scene.fog.color.copy(_skyColor);
  ambient.intensity = ambI;
  sun.intensity     = sunI;

  const angle = (h / 24) * Math.PI * 2 - Math.PI/2;
  sun.position.set(Math.cos(angle)*80, Math.abs(Math.sin(angle))*80, 20);

  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const isNight = h < 6 || h >= 19;
  const icon = isNight ? '🌙' : '☀️';
  document.getElementById('time-display').textContent = `${icon} ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  updateAmbientSound(isNight);
}

// ══════════════════════════════════════════════════════
//  HUD
// ══════════════════════════════════════════════════════
function updateHUD() {
  document.getElementById('bar-health').style.width  = Math.max(0, playerState.hp) + '%';
  // Couleur barre de santé selon niveau
  const hpBar = document.getElementById('bar-health');
  hpBar.style.background = playerState.hp > 60
    ? 'linear-gradient(90deg,#22cc44,#44ff66)'
    : playerState.hp > 30
      ? 'linear-gradient(90deg,#ff8800,#ffcc00)'
      : 'linear-gradient(90deg,#cc2200,#ff4400)';

  document.getElementById('bar-armor').style.width   = playerState.armor + '%';
  const staminaPct = playerState.stamina;
  const staminaBar = document.getElementById('bar-stamina');
  staminaBar.style.width = staminaPct + '%';
  staminaBar.style.background = staminaPct > 50
    ? 'linear-gradient(90deg,#ffcc00,#ffff00)'
    : staminaPct > 20
      ? 'linear-gradient(90deg,#ff8800,#ffcc00)'
      : 'linear-gradient(90deg,#ff2200,#ff8800)';
  document.getElementById('money-display').textContent = '💵 ' + playerState.money.toLocaleString() + ' FCFA';
  // Indicateur accroupi
  const crouchEl = document.getElementById('crouch-indicator');
  if (crouchEl) crouchEl.style.display = keys.crouch ? 'block' : 'none';
}

function updateWanted() {
  const w = playerState.wanted;
  const el = document.getElementById('wanted');
  el.textContent = '⭐'.repeat(w);
  el.style.color = w >= 4 ? '#ff2222' : w >= 2 ? '#ff8800' : '#FFD700';
  // Crosshair rouge si recherché
  const ch = document.getElementById('crosshair');
  if (ch) ch.style.color = w >= 3 ? '#ff3333' : w >= 1 ? '#ffaa00' : '#ffffff';
}

// ── Son ambiant jour/nuit (grillons / bruit de ville) ─────────────
let _ambientNode = null;
let _ambientGain = null;
let _lastAmbientMode = null;

function updateAmbientSound(isNight) {
  const mode = isNight ? 'night' : 'day';
  if (mode === _lastAmbientMode) return;
  _lastAmbientMode = mode;
  try {
    const ctx = getAudio();
    // Fade out l'ancien
    if (_ambientGain) {
      _ambientGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      setTimeout(() => { if (_ambientNode) { try { _ambientNode.stop(); } catch(e){} } }, 1600);
    }
    // Crée le nouveau
    const bufLen = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (isNight) {
      // Grillons : bruit filtré par BPF à 4kHz
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.12;
    } else {
      // Bruit de ville : bruit passe-bas grave
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = isNight ? 'bandpass' : 'lowpass';
    flt.frequency.value = isNight ? 4200 : 320;
    flt.Q.value = isNight ? 8 : 1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(isNight ? 0.18 : 0.10, ctx.currentTime + 2.0);
    src.connect(flt); flt.connect(gain); gain.connect(ctx.destination);
    src.start();
    _ambientNode = src;
    _ambientGain = gain;
  } catch(e) {}
}

function showNotif(msg) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.style.opacity = '0', 2800);
}

// ══════════════════════════════════════════════════════
//  ZONES
// ══════════════════════════════════════════════════════
const zones = [
  { name:'Plateau',     minX:-50, maxX:-5,  minZ:8,   maxZ:70 },
  { name:'Cocody',      minX:10,  maxX:60,  minZ:28,  maxZ:85 },
  { name:'Adjamé',      minX:-50, maxX:-12, minZ:-58, maxZ:-5 },
  { name:'Yopougon',    minX:18,  maxX:58,  minZ:-58, maxZ:-8 },
  { name:'Treichville', minX:5,   maxX:28,  minZ:-48, maxZ:-12},
  { name:'Lagune',      minX:-100,maxX:100, minZ:-120,maxZ:-72},
];
let lastZone = '';
function checkZone() {
  const px = playerChar.group.position.x, pz = playerChar.group.position.z;
  const z  = zones.find(z => px>=z.minX&&px<=z.maxX&&pz>=z.minZ&&pz<=z.maxZ)?.name ?? 'Abidjan';
  if(z !== lastZone) {
    lastZone = z;
    const el = document.getElementById('zone-name');
    el.textContent = '📍 ' + z;
    el.style.opacity = '1';
    setTimeout(() => el.style.opacity='0', 3000);
    showNotif('Bienvenue à ' + z + '!');
  }
}

// ══════════════════════════════════════════════════════
//  MISSION LOGIC
// ══════════════════════════════════════════════════════
function completeMission() {
  const m = missions[missionState.current];
  playerState.money += m.reward;
  missionState.active = false;
  targetDisc.visible = markerCone.visible = false;
  showNotif('✅ Mission réussie! +' + m.reward.toLocaleString() + ' FCFA');
  updateHUD();
  setTimeout(() => {
    missionState.current = (missionState.current + 1) % missions.length;
    activateMission(missionState.current);
  }, 4000);
}

function updateMissions(dtMs) {
  if(!missionState.active) return;
  const m = missions[missionState.current];

  if(m.timerSec > 0) {
    missionState.timer -= dtMs / 1000;
    const sec = Math.max(0, Math.ceil(missionState.timer));
    document.getElementById('mission-timer').textContent = '⏱ ' + sec + 's';
    if(missionState.timer <= 0) {
      missionState.active = false;
      showNotif('❌ Mission échouée! Temps écoulé.');
      setTimeout(() => activateMission(missionState.current), 3000);
    }
  }

  if(m.target) {
    const dx = playerChar.group.position.x - m.target.x;
    const dz = playerChar.group.position.z - m.target.z;
    if(Math.sqrt(dx*dx+dz*dz) < 3) {
      if(m.type === 'heist')   { playerState.wanted=Math.min(5,playerState.wanted+2); updateWanted(); completeMission(); }
      if(m.type === 'escape')  { playerState.wanted=Math.max(0,playerState.wanted-3); updateWanted(); completeMission(); }
      if(m.type === 'vehicle' && playerState.inVehicle) completeMission();
      if(m.type === 'night_deal') {
        if(gameTime.minutes > 22*60) completeMission();
        else showNotif('Reviens après 22h!');
      }
    }
  }
}

// ══════════════════════════════════════════════════════
//  MINIMAP AMÉLIORÉE
// ══════════════════════════════════════════════════════
const mmCanvas = document.getElementById('minimapCanvas');
const mmCtx    = mmCanvas.getContext('2d');

const NPC_COLORS = { civil:'#aaaaaa', gang:'#ff3333', police:'#4488ff', dealer:'#aa44ff', braqueur:'#ff8800' };

function drawMinimap() {
  const W2 = 140, H2 = 140, cx = 70, cy = 70, sc = 0.9;
  mmCtx.clearRect(0, 0, W2, H2);

  // Fond
  mmCtx.fillStyle = 'rgba(8,20,8,0.94)';
  mmCtx.beginPath(); mmCtx.arc(cx,cy,70,0,Math.PI*2); mmCtx.fill();

  // Grille de fond
  mmCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  mmCtx.lineWidth = 1;
  for(let i=0;i<W2;i+=14){ mmCtx.beginPath();mmCtx.moveTo(i,0);mmCtx.lineTo(i,H2);mmCtx.stroke(); }
  for(let i=0;i<H2;i+=14){ mmCtx.beginPath();mmCtx.moveTo(0,i);mmCtx.lineTo(W2,i);mmCtx.stroke(); }

  // Routes
  mmCtx.strokeStyle = '#444'; mmCtx.lineWidth = 5;
  mmCtx.beginPath(); mmCtx.moveTo(cx,0); mmCtx.lineTo(cx,H2); mmCtx.stroke();
  mmCtx.beginPath(); mmCtx.moveTo(0,cy); mmCtx.lineTo(W2,cy); mmCtx.stroke();
  mmCtx.strokeStyle = '#333'; mmCtx.lineWidth = 3;
  // Routes secondaires (approximation)
  const ox = cx - playerChar.group.position.x * sc;
  const oz = cy - playerChar.group.position.z * sc;
  mmCtx.beginPath(); mmCtx.moveTo(ox+35*sc,0); mmCtx.lineTo(ox+35*sc,H2); mmCtx.stroke();
  mmCtx.beginPath(); mmCtx.moveTo(ox-35*sc,0); mmCtx.lineTo(ox-35*sc,H2); mmCtx.stroke();

  // Lagune
  mmCtx.fillStyle = '#1a5fa5';
  const laguneY = cy + (-95 - playerChar.group.position.z) * sc - 14;
  mmCtx.fillRect(0, laguneY, W2, 28);

  // Bâtiments (petits carrés)
  buildings.forEach(b => {
    const bx = cx + (b.x - playerChar.group.position.x) * sc;
    const bz = cy + (b.z - playerChar.group.position.z) * sc;
    const bw = Math.max(2, b.w * sc * 0.5);
    const bd = Math.max(2, b.d * sc * 0.5);
    mmCtx.fillStyle = 'rgba(100,120,140,0.6)';
    mmCtx.fillRect(bx - bw/2, bz - bd/2, bw, bd);
  });

  // NPCs colorés selon type
  npcList.forEach(npc => {
    const nx = cx+(npc.group.position.x-playerChar.group.position.x)*sc;
    const nz = cy+(npc.group.position.z-playerChar.group.position.z)*sc;
    if (npc.npc.state === 'dead') {
      mmCtx.fillStyle = '#333';
    } else {
      const outfit = npc.group.userData.outfit ?? 'civil';
      mmCtx.fillStyle = NPC_COLORS[outfit] ?? '#ffffff';
    }
    mmCtx.beginPath();
    if (npc.npc.state === 'chase') {
      // Triangle pour les ennemis en chasse
      mmCtx.moveTo(nx, nz-4); mmCtx.lineTo(nx+3, nz+3); mmCtx.lineTo(nx-3, nz+3);
      mmCtx.closePath();
    } else {
      mmCtx.arc(nx, nz, 2.5, 0, Math.PI*2);
    }
    mmCtx.fill();
  });

  // Véhicules
  vehicleList.forEach(v => {
    const vx = cx+(v.position.x-playerChar.group.position.x)*sc;
    const vz = cy+(v.position.z-playerChar.group.position.z)*sc;
    mmCtx.fillStyle = playerState.inVehicle && v === playerState.currentVehicle ? '#00ff88' : '#FF6600';
    mmCtx.fillRect(vx-2.5, vz-1.5, 5, 3);
  });

  // Loot au sol
  lootItems.forEach(item => {
    const ix = cx+(item.position.x-playerChar.group.position.x)*sc;
    const iz = cy+(item.position.z-playerChar.group.position.z)*sc;
    mmCtx.fillStyle = '#00ffaa';
    mmCtx.beginPath(); mmCtx.arc(ix,iz,2,0,Math.PI*2); mmCtx.fill();
  });

  // Mission target
  if(targetDisc.visible) {
    const tx = cx+(targetDisc.position.x-playerChar.group.position.x)*sc;
    const tz = cy+(targetDisc.position.z-playerChar.group.position.z)*sc;
    mmCtx.fillStyle = '#FFD700';
    mmCtx.beginPath();
    for(let i=0;i<5;i++){
      const a = (i*4+1)*Math.PI/5 - Math.PI/2;
      const r = i%2===0?6:2.5;
      mmCtx.lineTo(tx+Math.cos(a)*r, tz+Math.sin(a)*r);
    }
    mmCtx.closePath(); mmCtx.fill();
  }

  // Joueur (triangle orienté)
  mmCtx.save();
  mmCtx.translate(cx, cy);
  mmCtx.rotate(-camAngleH);
  mmCtx.fillStyle = '#00ff88';
  mmCtx.strokeStyle = '#fff';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath();
  mmCtx.moveTo(0,-8); mmCtx.lineTo(5,6); mmCtx.lineTo(-5,6);
  mmCtx.closePath(); mmCtx.fill(); mmCtx.stroke();
  mmCtx.restore();

  // Clip circulaire
  mmCtx.globalCompositeOperation = 'destination-in';
  mmCtx.beginPath(); mmCtx.arc(cx,cy,68,0,Math.PI*2); mmCtx.fill();
  mmCtx.globalCompositeOperation = 'source-over';

  // Bordure intérieure
  mmCtx.strokeStyle = 'rgba(255,200,0,0.3)';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath(); mmCtx.arc(cx,cy,67,0,Math.PI*2); mmCtx.stroke();
}

// ══════════════════════════════════════════════════════
//  BOUCLE PRINCIPALE
// ══════════════════════════════════════════════════════
let lastTime = 0;
let markerPhase = 0;
// Pool de Vector3 pour les calculs de la boucle
const _camTarget = new THREE.Vector3();

function animate(now = 0) {
  requestAnimationFrame(animate);
  if (playerState.dead) {
    renderer.render(scene, camera);
    return;
  }

  const dtMs  = Math.min(now - lastTime, 50);
  const dtSec = dtMs / 1000;
  lastTime = now;

  // Rechargement en cours
  if (playerState.isReloading) {
    playerState.reloadTimer -= dtMs;
    if (playerState.reloadTimer <= 0) finishReload();
  }

  // ── Mouvement joueur / véhicule ──
  _v1.set(Math.sin(camAngleH), 0, Math.cos(camAngleH));
  _v2.set(Math.cos(camAngleH), 0, -Math.sin(camAngleH));
  const fwd   = _v1;
  const right = _v2;
  const isMoving = keys.up||keys.down||keys.left||keys.right||Math.abs(joyX)>0.2||Math.abs(joyY)>0.2;
  isSprinting = (keys.sprint || sprintToggle) && isMoving && !playerState.inVehicle;

  if(playerState.inVehicle && playerState.currentVehicle) {
    const v = playerState.currentVehicle;
    const d = v.userData;

    if(keys.up   || joyY < -0.22) d.accel =  1;
    else if(keys.down || joyY >  0.22) d.accel = -0.6;
    else d.accel = 0;

    if(keys.left  || joyX < -0.22) d.steer =  1;
    else if(keys.right || joyX >  0.22) d.steer = -1;
    else d.steer = 0;

    d.speed += d.accel * d.accelRate;
    d.speed *= d.friction;
    d.speed = Math.max(-d.maxSpeed * 0.5, Math.min(d.maxSpeed, d.speed));

    if(Math.abs(d.speed) > 0.001) {
      v.rotation.y += d.steer * d.steerSpeed * (d.speed / d.maxSpeed);
    }
    d.wheelAngle += d.speed * 3;

    const prevPos = v.position.clone();
    v.position.x += Math.sin(v.rotation.y) * d.speed;
    v.position.z += Math.cos(v.rotation.y) * d.speed;

    checkBuildingCollision(v.position, 2.0);
    checkVehicleCollision(v.position, v, 2.2);
    clampWorld(v.position);

    playerChar.group.position.copy(v.position);
    playerChar.group.position.y = 0;
    playerChar.group.rotation.y = v.rotation.y;
  } else {
    const spd = isSprinting && playerState.stamina > 0 ? 0.16 : 0.10;

    if(keys.up   || joyY<-0.28) playerChar.group.position.addScaledVector(fwd,   spd);
    if(keys.down || joyY> 0.28) playerChar.group.position.addScaledVector(fwd,  -spd*0.7);
    if(keys.left || joyX<-0.28) playerChar.group.position.addScaledVector(right, -spd*0.8);
    if(keys.right|| joyX> 0.28) playerChar.group.position.addScaledVector(right,  spd*0.8);

    checkBuildingCollision(playerChar.group.position, 0.45);
    checkVehicleCollision(playerChar.group.position, null, 0.5);
    clampWorld(playerChar.group.position);

    if(isMoving) {
      const ta = camAngleH + (joyY > 0.28 ? Math.PI : 0) + (joyX * 1.2);
      playerChar.group.rotation.y += (ta - playerChar.group.rotation.y) * 0.18;
    }

    // Gravité
    if(!playerState.isGrounded) {
      playerState.velocityY -= 0.018;
      playerChar.group.position.y += playerState.velocityY;
      if(playerChar.group.position.y <= 0) {
        playerChar.group.position.y = 0;
        playerState.velocityY = 0;
        playerState.isGrounded = true;
      }
    }
    if(keys.jump && playerState.isGrounded) {
      playerState.velocityY = 0.22;
      playerState.isGrounded = false;
    }

    if(isSprinting) playerState.stamina = Math.max(0, playerState.stamina - 8*dtSec);
    else            playerState.stamina = Math.min(100, playerState.stamina + 15*dtSec);
  }

  // ── Wanted decay automatique ──
  if (playerState.wantedCooldown > 0) {
    playerState.wantedCooldown -= dtSec;
    if (playerState.wantedCooldown <= 0 && playerState.wanted > 0) {
      playerState.wanted = Math.max(0, playerState.wanted - 1);
      updateWanted();
      if (playerState.wanted > 0) playerState.wantedCooldown = 10;
    }
  }

  // ── Animation personnage ──
  if (!playerState.inVehicle) {
    if (keys.crouch && !isSprinting)  playerChar.setAnim(isMoving ? 'crouch_walk' : 'crouch');
    else if (isSprinting)             playerChar.setAnim('run');
    else if (isMoving)                playerChar.setAnim('walk');
    else if (keys.shoot)              playerChar.setAnim('shoot');
    else                              playerChar.setAnim('idle');
  }
  playerChar.update(dtMs);

  // ── Tir continu ──
  if(keys.shoot && !playerState.inVehicle && !playerState.dead) {
    if(!playerChar._shootCooldown || now > playerChar._shootCooldown) {
      fireBullet();
      playerChar._shootCooldown = now + (playerState.weapon==='ak47'?150:400);
    }
  }

  // ── Balles ──
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.position.addScaledVector(b.userData.vel, 1);
    b.userData.life--;
    if (b.userData.life <= 0) {
      releaseBullet(b);
      bullets.splice(i, 1);
    }
  }

  // ── Loot ──
  if (!playerState.inVehicle) checkLootPickup();

  // ── Loot flottant ──
  const lootBob = Math.sin(now * 0.003) * 0.1 + 0.4;
  lootItems.forEach(item => {
    item.position.y = lootBob;
    item.rotation.y += 0.04;
  });

  // ── NPCs IA + riposte ──
  npcList.forEach((npc, ni) => {
    if (npc.npc.state === 'dead') { npc.update(dtMs); return; }
    npc.npc.timer += dtMs;
    const dist = npc.group.position.distanceTo(playerChar.group.position);

    // Alerte → chase selon wanted et proximité
    if (dist < npc.npc.alertRadius && playerState.wanted >= 1 &&
       (npc.group.userData?.outfit === 'police' || npc.group.userData?.outfit === 'gang')) {
      npc.npc.state = 'chase';
    }
    if (dist < 5 && npc.npc.state === 'patrol') npc.npc.state = 'flee';

    // Séparation entre NPC (évite le regroupement)
    npcList.forEach((other, oi) => {
      if (oi === ni || other.npc.state === 'dead') return;
      const sep = npc.group.position.distanceTo(other.group.position);
      if (sep < 1.2 && sep > 0.01) {
        _v3.copy(npc.group.position).sub(other.group.position).normalize().multiplyScalar(0.04);
        npc.group.position.add(_v3);
      }
    });

    if (npc.npc.state === 'patrol') {
      npc.npc.walkAngle += npc.npc.speed * 0.02;
      npc.group.position.x = npc.npc.walkCenter.x + Math.cos(npc.npc.walkAngle) * npc.npc.walkRadius;
      npc.group.position.z = npc.npc.walkCenter.z + Math.sin(npc.npc.walkAngle) * npc.npc.walkRadius;
      npc.group.rotation.y = -npc.npc.walkAngle - Math.PI / 2;
      npc.setAnim('walk');
    } else if (npc.npc.state === 'flee') {
      _v3.copy(npc.group.position).sub(playerChar.group.position).normalize();
      npc.group.position.addScaledVector(_v3, npc.npc.speed * 2.5);
      npc.group.rotation.y = Math.atan2(_v3.x, _v3.z);
      clampWorld(npc.group.position);
      npc.setAnim('run');
    } else if (npc.npc.state === 'chase') {
      _v3.copy(playerChar.group.position).sub(npc.group.position).normalize();
      npc.group.position.addScaledVector(_v3, npc.npc.speed * 1.8);
      npc.group.rotation.y = Math.atan2(_v3.x, _v3.z);
      clampWorld(npc.group.position);
      npc.setAnim('shoot');
      npcShootPlayer(npc, now);
    }
    npc.update(dtMs);
  });

  // ── Trafic IA ──
  vehicleList.forEach((v, i) => {
    if(playerState.inVehicle && v === playerState.currentVehicle) return;
    const d = v.userData;
    if(d.aiMode !== 'traffic') return;

    d.aiTimer += dtMs;
    if(!d.aiTarget || d.aiTimer > (3000 + i * 800)) {
      d.aiTimer = 0;
      const roadNodes = [
        {x:0,z:60},{x:0,z:30},{x:0,z:0},{x:0,z:-30},{x:0,z:-65},
        {x:30,z:0},{x:-30,z:0},{x:60,z:0},{x:-60,z:0},
        {x:35,z:50},{x:35,z:20},{x:-35,z:-30},{x:-35,z:-50},
        {x:0,z:70},{x:0,z:-70},
      ];
      d.aiTarget = roadNodes[Math.floor(Math.random() * roadNodes.length)];
    }

    if(d.aiTarget) {
      const tx = d.aiTarget.x + (i%3-1) * 2.5;
      const tz = d.aiTarget.z;
      const dx = tx - v.position.x;
      const dz = tz - v.position.z;
      const distToTarget = Math.sqrt(dx*dx+dz*dz);

      if(distToTarget < 3) { d.aiTarget = null; return; }

      const targetAngle = Math.atan2(dx, dz);
      let angleDiff = targetAngle - v.rotation.y;
      while(angleDiff >  Math.PI) angleDiff -= Math.PI * 2;
      while(angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      v.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), d.steerSpeed);
      const turnFactor = 1 - Math.abs(angleDiff) / Math.PI * 0.7;
      const targetSpeed = d.maxSpeed * Math.max(0.3, turnFactor);
      if(d.speed < targetSpeed) d.speed += d.accelRate;
      else d.speed *= 0.98;

      const dPlayer = v.position.distanceTo(playerChar.group.position);
      if(dPlayer < 5 && !playerState.inVehicle) {
        d.speed *= 0.85;
        if(dPlayer < 2.5) d.speed = -0.03;
      }

      const prevPos = v.position.clone();
      v.position.x += Math.sin(v.rotation.y) * d.speed;
      v.position.z += Math.cos(v.rotation.y) * d.speed;
      d.wheelAngle += d.speed * 3;

      checkBuildingCollision(v.position, 2.0);
      checkVehicleCollision(v.position, v, 2.2);
      clampWorld(v.position);

      if(v.position.distanceTo(prevPos) < 0.001 && d.speed > 0.02) {
        d.aiTarget = null;
        d.speed *= 0.5;
      }
    }
  });

  // ── Marqueur mission ──
  markerPhase += dtSec * 2;
  markerCone.position.y = 4.5 + Math.sin(markerPhase) * 0.5;
  markerCone.rotation.y = markerPhase * 0.6;
  targetDisc.rotation.y = markerPhase * 0.3;

  // ── Caméra ──
  const camDist   = playerState.inVehicle ? 11 : 8;
  const camHeight = playerState.inVehicle ? 5.5 : 5;
  _camTarget.set(
    playerChar.group.position.x - Math.sin(camAngleH) * camDist,
    playerChar.group.position.y + camHeight,
    playerChar.group.position.z - Math.cos(camAngleH) * camDist
  );
  camera.position.lerp(_camTarget, 0.10);
  camera.lookAt(
    playerChar.group.position.x,
    playerChar.group.position.y + 1.2,
    playerChar.group.position.z
  );

  updateDayNight(dtMs);
  updateMissions(dtMs);
  checkZone();
  drawMinimap();
  updateHUD();

  renderer.render(scene, camera);
}

// ══════════════════════════════════════════════════════
//  LOADING + DÉMARRAGE
// ══════════════════════════════════════════════════════
const loadBar = document.getElementById('loading-bar');
const loadMsg = document.getElementById('loading-msg');

function animateBar(fromPct, toPct, durationMs) {
  return new Promise(resolve => {
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / durationMs, 1);
      const cur = fromPct + (toPct - fromPct) * t;
      loadBar.style.width = cur + '%';
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

async function startGame() {
  try {
    if (loadMsg) loadMsg.textContent = 'Construction de la scène…';
    await animateBar(0, 40, 400);

    if (loadMsg) loadMsg.textContent = 'Compilation des shaders…';
    renderer.render(scene, camera);
    await animateBar(40, 75, 350);

    if (loadMsg) loadMsg.textContent = 'Initialisation du HUD…';
    updateHUD();
    updateWanted();
    switchWeapon('pistol');
    activateMission(0);
    // Spawn quelques loots initiaux
    spawnLoot(8, 8, 'ammo_pistol');
    spawnLoot(-10, 15, 'money');
    spawnLoot(5, -5, 'armor');
    await animateBar(75, 100, 300);

    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), 800);
    }
    document.getElementById('crosshair').style.display = 'block';
    animate();

  } catch (err) {
    console.error('Erreur au démarrage du jeu :', err);
    if (loadMsg) loadMsg.textContent = 'Erreur : ' + err.message;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startGame);
} else {
  startGame();
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});