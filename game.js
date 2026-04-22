/* ═══════════════════════════════════════════════════════════════
   GAME.JS — GTA Abidjan v5 — Améliorations majeures
   ─────────────────────────────────────────────────────────────
   Nouveautés v5 :
   - Quartiers visuellement distincts (Plateau vitré, Cocody villa,
     Adjamé marché, Yopougon populaire, Treichville coloré)
   - Végétation tropicale enrichie (bananiers, flamboyants)
   - Panneaux publicitaires ivoiriens
   - Effets de particules sur impacts (balles vs bâtiments)
   - Système de couverture (accroupi près d'un mur → -50% dégâts)
   - Animation de rechargement visible (bras animé)
   - IA police : embuscade (se poste DEVANT le joueur)
   - IA : call_backup (appel radio → spawn 2 renforts)
   - Véhicules : inclinaison dans les virages
   - Véhicules : dégâts visuels progressifs (couleur → noirci)
   - Klaxons IA aléatoires (son synthétique)
   - Détecteur de performance au démarrage
   - Frustum culling manuel des bâtiments (>120u)
   - Vignette rouge pulsante si HP < 25%
   - Écran de pause (bouton ☰)
   - FPS counter (double-tap minimap)
   - Missions enrichies (5 missions avec checkpoints)
   - Réputation par quartier
   - Son coupé-décalé la nuit, marché le jour
   - Lampadaires s'allument à 18h (PointLight)
   - Maquis lumineux à 23h
   ═══════════════════════════════════════════════════════════════ */

import * as THREE from 'https://unpkg.com/three@0.163.0/build/three.module.js';
import { buildCharacter, buildNPC, CharacterAudio } from './characters.js';

// ══════════════════════════════════════════════════════
//  DÉTECTEUR DE PERFORMANCE
// ══════════════════════════════════════════════════════
const perfLevel = (() => {
  const cores = navigator.hardwareConcurrency || 4;
  const dpr = window.devicePixelRatio || 1;
  if (cores <= 2 || (dpr > 1.5 && cores <= 4)) return 'low';
  if (cores <= 4) return 'med';
  return 'high';
})();

// ══════════════════════════════════════════════════════
//  RENDERER + SCENE + CAMERA
// ══════════════════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const W = window.innerWidth, H = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: perfLevel !== 'low' });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, perfLevel === 'low' ? 1 : 1.5));
renderer.shadowMap.enabled = perfLevel !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.fog = perfLevel === 'low'
  ? new THREE.Fog(0x87CEEB, 80, 250)
  : new THREE.Fog(0x87CEEB, 120, 420);

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
    src.buffer = buf; src.connect(ctx.destination); src.start();
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

function playKlaxon() {
  try {
    const ctx = getAudio();
    const freqs = [440, 440, 520];
    let t = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = f;
      osc.type = 'sawtooth';
      g.gain.setValueAtTime(0.15, t + i * 0.18);
      g.gain.linearRampToValueAtTime(0, t + i * 0.18 + 0.14);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t + i * 0.18); osc.stop(t + i * 0.18 + 0.14);
    });
  } catch(e) {}
}

function playRadio() {
  try {
    const ctx = getAudio();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * 0.3 * Math.sin(t * 800 * Math.PI * 2) * Math.exp(-t * 3);
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1800; flt.Q.value = 3;
    src.connect(flt); flt.connect(ctx.destination); src.start();
  } catch(e) {}
}

// ══════════════════════════════════════════════════════
//  LUMIÈRES
// ══════════════════════════════════════════════════════
const ambient = new THREE.AmbientLight(0xffeedd, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff8e0, 1.3);
sun.position.set(40, 80, 40);
sun.castShadow = perfLevel !== 'low';
sun.shadow.mapSize.set(perfLevel === 'low' ? 512 : 1024, perfLevel === 'low' ? 512 : 1024);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
sun.shadow.camera.left = sun.shadow.camera.bottom = -180;
sun.shadow.camera.right = sun.shadow.camera.top = 180;
scene.add(sun);

const hemi = new THREE.HemisphereLight(0x87CEEB, 0x4a7a2a, 0.35);
scene.add(hemi);

// ── Cache matériaux ──────────────────────────────────
const _matCache = new Map();
function makeMat(color, rough = 0.9, metal = 0) {
  const key = `${color}_${rough}_${metal}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  }
  return _matCache.get(key);
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _skyColor = new THREE.Color();

// ══════════════════════════════════════════════════════
//  SOL + ROUTES
// ══════════════════════════════════════════════════════
const groundGeo = new THREE.PlaneGeometry(700, 700, 1, 1);
const groundMesh = new THREE.Mesh(groundGeo, makeMat(0x5a7a2a));
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

function road(x, z, w, d, angle = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), makeMat(0x2a2a2a, 0.95));
  m.rotation.x = -Math.PI / 2; m.rotation.z = angle;
  m.position.set(x, 0.01, z); m.receiveShadow = true;
  scene.add(m);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.018, d * 0.96), makeMat(0xFFD700));
  line.rotation.x = -Math.PI / 2; line.rotation.z = angle;
  line.position.set(x, 0.02, z);
  scene.add(line);
}
// ── Routes principales (axe nord-sud et est-ouest) ──
road(0,   0, 10, 500);                 // avenue centrale nord-sud
road(0,   0, 500, 10, Math.PI/2);      // boulevard central est-ouest
// Axes secondaires nord-sud
road( 70,   0,  8, 320);               // côté Cocody/Yopougon
road(-70,   0,  8, 320);               // côté Plateau/Adjamé
road( 120,  0,  7, 200);               // Yopougon est
road(-120,  0,  7, 200);               // Adjamé ouest
// Axes secondaires est-ouest
road(  0,  90, 220, 8, Math.PI/2);     // quartier nord
road(  0, -90, 220, 8, Math.PI/2);     // quartier sud
road(  0, 160, 280, 8, Math.PI/2);     // Cocody haut
road(  0,-160, 200, 8, Math.PI/2);     // Treichville bas
// Rues internes quartiers
road(-35,  60,  8, 120);               // Plateau interne
road( 35, -55,  8, 120);               // Yopougon interne
road( 35,  55,  8, 100);               // Cocody interne
road(-35, -55,  8, 100);               // Adjamé interne

function sidewalk(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), makeMat(0x888880));
  m.position.set(x, 0.05, z); m.receiveShadow = true; scene.add(m);
}
sidewalk( 6, 0, 2, 480); sidewalk(-6, 0, 2, 480);

// Lagune
const laguneMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 80),
  new THREE.MeshStandardMaterial({ color: 0x1565C0, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.88 })
);
laguneMesh.rotation.x = -Math.PI / 2;
laguneMesh.position.set(0, 0.04, -200);
scene.add(laguneMesh);

// Pirogues sur la lagune
function pirogue(x, z) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 1.1), makeMat(0x6B3A1F));
  hull.position.y = 0.2; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 4), makeMat(0x5a2d10));
  bow.rotation.z = Math.PI / 2; bow.position.set(2.5, 0.2, 0); g.add(bow);
  g.position.set(x, 0.06, z);
  g.rotation.y = Math.random() * Math.PI;
  scene.add(g);
}
pirogue(-50, -200); pirogue(30, -195); pirogue(-90, -205); pirogue(80, -198);

function bridge(x, z, len) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 11), makeMat(0x777777));
  m.position.set(x, 0.25, z); m.castShadow = true; scene.add(m);
  [5, -5].forEach(side => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.15), makeMat(0x555555));
    rail.position.set(x, 0.65, z + side); scene.add(rail);
  });
}
bridge(0, -168, 10); bridge(70, -172, 10);

// ══════════════════════════════════════════════════════
//  COLLISIONS AABB
// ══════════════════════════════════════════════════════
const buildings = [];
const buildingMeshes = [];
let notifTimer = null;

function checkBuildingCollision(pos, radius) {
  radius = radius || 0.5;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const hw = b.w / 2 + radius, hd = b.d / 2 + radius;
    const dx = pos.x - b.x, dz = pos.z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const overlapX = hw - Math.abs(dx), overlapZ = hd - Math.abs(dz);
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
    const dx = pos.x - v.position.x, dz = pos.z - v.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < radius + 1.8 && dist > 0.01) {
      const push = (radius + 1.8 - dist) / dist;
      pos.x += dx * push * 0.5; pos.z += dz * push * 0.5;
    }
  }
}

function clampWorld(pos) {
  const limit = 220;
  pos.x = Math.max(-limit, Math.min(limit, pos.x));
  pos.z = Math.max(-limit, Math.min(limit, pos.z));
}

// ══════════════════════════════════════════════════════
//  BÂTIMENTS ENRICHIS PAR QUARTIER
// ══════════════════════════════════════════════════════
function building(x, z, w, d, h, color, windowColor = 0x88bbdd, style = 'default') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color, 0.85));
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);

  if (style === 'vitré') {
    // Façade en verre pour le Plateau
    const glassFront = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.9, h * 0.9),
      new THREE.MeshStandardMaterial({ color: 0x88ccee, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.8 })
    );
    glassFront.position.set(0, 0, d / 2 + 0.02); mesh.add(glassFront);
  }

  // Fenêtres : groupées en une seule bande par étage (moins de draw calls)
  const cols = Math.max(1, Math.min(4, Math.floor(w / 2.5)));
  const rows = Math.max(1, Math.min(6, Math.floor(h / 3.5)));
  // Une bande horizontale par étage au lieu de fenêtres individuelles
  for (let r = 0; r < rows; r++) {
    const wy = 1.5 + r * (h / rows);
    const wm = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.88, 0.55),
      new THREE.MeshStandardMaterial({ color: windowColor, emissive: windowColor, emissiveIntensity: 0.08, roughness: 0.3 })
    );
    wm.position.set(0, wy - h / 2, d / 2 + 0.01);
    mesh.add(wm);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), makeMat(0x333333));
  roof.position.set(x, h + 0.2, z); scene.add(roof);

  const entry = { x, z, w, d, h, mesh, origColor: color };
  buildings.push(entry); buildingMeshes.push(mesh);
  return mesh;
}

function damageBuildingFlash(bEntry) {
  if (!bEntry || !bEntry.mesh) return;
  bEntry.mesh.material.color.set(0xff3300);
  setTimeout(() => { bEntry.mesh.material.color.set(bEntry.origColor); }, 180);
}

// ── PLATEAU — immeubles vitrés hauts (nord-ouest, x:-50→-90, z:+60→+150) ──
building(-60,  80,  12, 10, 38, 0x6e99bb, 0xaaddff, 'vitré');
building(-75,  70,   9,  9, 28, 0x5577aa, 0x99ccee, 'vitré');
building(-55, 110,  14, 10, 45, 0x4470a8, 0x88bbdd, 'vitré');
building(-80,  95,  10,  8, 32, 0x5588cc, 0xaaccee, 'vitré');
building(-65, 135,  12, 10, 28, 0x7aafcc, 0xbbddee, 'vitré');
building(-90,  80,   8,  8, 20, 0x446688, 0x88aacc, 'vitré');
building(-50, 150,  10, 10, 22, 0x6688aa, 0x99bbcc);
building(-85, 120,   7,  7, 18, 0x557799, 0x88aacc);
building(-70, 100,  11,  8, 35, 0x5599cc, 0xaaddff, 'vitré');
building(-95, 105,   8,  7, 24, 0x4477aa, 0x99ccdd, 'vitré');

// ── COCODY — villas basses colorées chaudes (nord-est, x:+50→+110, z:+50→+160) ──
building( 60,  70,   9,  7, 7,  0xD4A865);
building( 80,  90,   8,  8, 6,  0xCC9944);
building( 95,  75,  10,  9, 8,  0xBB8833);
building( 55,  110,  8,  6, 7,  0xDD9955);
building( 75,  120,  9,  8, 6,  0xC89040);
building( 90,  130,  7,  7, 6,  0xDDAA60);
building(105,  100,  8,  7, 5,  0xCC8833);
building( 60,  150,  9,  8, 7,  0xE8BB70);
building( 85,  155,  7,  7, 5,  0xDDA040);
building(110,  85,   8,  7, 6,  0xCC9933);

// ── ADJAMÉ — habitat populaire étroit coloré (sud-ouest, x:-50→-100, z:-50→-140) ──
building(-60,  -65,  11,  9, 11, 0xCC6633, 0xffaa44);
building(-80,  -75,   9,  8,  9, 0xBB5522, 0xff8833);
building(-65,  -95,  10, 10, 12, 0xDD7744, 0xffbb55);
building(-90,  -60,   8,  7, 10, 0xAA4411, 0xff7722);
building(-55, -115,  11,  9, 11, 0xCC5522, 0xff9944);
building(-85, -105,   9,  8, 10, 0xBB6633, 0xffaa55);
building(-70,  -80,   7,  7,  8, 0xDD8844, 0xffcc66);
building(-95,  -90,   8,  7, 12, 0xCC5533, 0xff9933);
building(-60, -130,  10,  8,  9, 0xBB6622, 0xffaa44);

// ── YOPOUGON — populaire vert (sud-est, x:+50→+110, z:-50→-140) ──
building( 60,  -65,   8,  7, 8,  0x88AA55);
building( 80,  -80,   9,  8, 7,  0x779944);
building( 65,  -100,  8,  8, 9,  0x668833);
building( 90,  -60,   7,  7, 8,  0x99BB66);
building( 75,  -120,  8,  8, 8,  0x77AA44);
building(100,  -90,   7,  7, 6,  0x88BB55);
building( 55,  -135,  8,  7, 7,  0x99CC66);
building( 85,  -110,  9,  8, 8,  0x668844);

// ── TREICHVILLE — coloré vivant (sud centre, x:+5→+45, z:-60→-150) ──
building( 15,  -75,   9,  8, 10, 0xAA7744, 0xffcc88);
building( 30,  -90,   8,  8,  9, 0x996633, 0xffbb77);
building( 10, -110,   9,  7, 11, 0xBB8855, 0xffddaa);
building( 35, -70,    7,  7,  8, 0xAA7733, 0xffcc77);
building( 20, -130,   8,  8,  9, 0xCC9955, 0xffddaa);
building( 40, -105,   7,  7,  7, 0x997744, 0xffcc88);

// ══════════════════════════════════════════════════════
//  PALMIERS + VÉGÉTATION TROPICALE
// ══════════════════════════════════════════════════════
function palm(x, z) {
  const g = new THREE.Group();
  const trunkH = 5 + Math.random() * 2;
  const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, trunkH, 7), makeMat(0x7B5E28, 0.9));
  trunkMesh.position.y = trunkH / 2;
  trunkMesh.rotation.z = (Math.random() - 0.5) * 0.25;
  trunkMesh.castShadow = true; g.add(trunkMesh);
  const leafMat2 = makeMat(0x1e6e1e, 0.85);
  for (let i = 0; i < 7; i++) {
    const lf = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.8, 5), leafMat2);
    const angle = (i / 7) * Math.PI * 2;
    lf.position.set(Math.sin(angle) * 0.9, trunkH + 0.2, Math.cos(angle) * 0.9);
    lf.rotation.z = Math.sin(angle) * 0.7; lf.rotation.x = Math.cos(angle) * 0.7;
    lf.castShadow = true; g.add(lf);
  }
  g.position.set(x, 0, z); scene.add(g);
}

function bananier(x, z) {
  const g = new THREE.Group();
  const h = 3.5 + Math.random();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, h, 6), makeMat(0x4a7a1a, 0.9));
  trunk.position.y = h / 2; g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 1.6), makeMat(0x2a9a22, 0.8));
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.sin(a) * 0.7, h + 0.1, Math.cos(a) * 0.7);
    leaf.rotation.y = a; leaf.rotation.z = 0.5; g.add(leaf);
  }
  g.position.set(x, 0, z); scene.add(g);
}

function flamboyant(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 5, 8), makeMat(0x5a3a12, 0.9));
  trunk.position.y = 2.5; trunk.castShadow = true; g.add(trunk);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), makeMat(0xcc3300, 0.7));
  canopy.position.y = 6; canopy.scale.set(1, 0.6, 1); canopy.castShadow = true; g.add(canopy);
  g.position.set(x, 0, z); scene.add(g);
}

[
  // Centre
  [7,7],[7,-7],[-7,7],[-7,-7],[12,12],[-12,12],[12,-12],[-12,-12],[16,0],[-16,0],[0,16],[0,-16],
  // Axes des routes
  [8,40],[8,80],[8,130],[-8,50],[-8,90],[-8,140],
  [8,-40],[8,-80],[8,-130],[-8,-50],[-8,-90],[-8,-140],
  [75,50],[75,90],[75,140],[-75,60],[-75,100],[-75,130],
  [75,-50],[75,-90],[75,-130],[-75,-60],[-75,-100],[-75,-130],
  // Cocody (dense)
  [55,65],[60,110],[100,80],[80,155],[65,95],[90,115],[110,70],[70,135],
  // Plateau
  [-55,65],[-60,110],[-100,75],[-80,145],[-65,95],[-90,115],[-110,70],[-70,135],
  // Yopougon
  [55,-65],[60,-110],[100,-80],[70,-135],[85,-70],[95,-105],
  // Adjamé
  [-55,-65],[-60,-110],[-100,-80],[-70,-135],[-85,-70],[-95,-105],
  // Treichville
  [10,-75],[25,-130],[40,-160],[18,-100],[32,-145],
  // Lagune
  [-40,-190],[0,-190],[40,-190],[-80,-195],[80,-195],
].forEach(([x,z]) => palm(x, z));

[[-80,85],[-60,130],[80,90],[65,155],[-75,-90],[75,-100],[20,-120],[-30,50],[40,35],
 [-45,75],[45,-75],[30,110],[-30,-110],[55,170],[-55,-170],[15,-85],[-15,85]].forEach(([x,z]) => bananier(x, z));
[[90,70],[70,140],[-90,80],[-70,120],[90,-70],[70,-140],[-90,-80],[30,-80],[55,-150],
 [-40,155],[40,-155],[0,170],[0,-170],[85,50],[-85,-50],[120,40],[-120,-40]].forEach(([x,z]) => flamboyant(x, z));

// ══════════════════════════════════════════════════════
//  PANNEAUX PUBLICITAIRES
// ══════════════════════════════════════════════════════
const billboardTexts = ['MTN', 'SOLIBRA', 'BRAFCI', 'SIB', 'CANAL+CI', 'CARGILL'];
const billboardColors = [0xFFCC00, 0x0044AA, 0xCC2200, 0x003366, 0x0099CC, 0x228833];

function billboard(x, z, angle = 0) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 6), makeMat(0x444444));
  post.position.y = 2.5; g.add(post);
  const idx = Math.floor(Math.random() * billboardTexts.length);
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.5, 0.12), makeMat(billboardColors[idx], 0.5));
  board.position.y = 5.2; g.add(board);
  const txt = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.2, 0.14), makeMat(0xffffff, 0.3));
  txt.position.y = 5.2; g.add(txt);
  g.position.set(x, 0, z); g.rotation.y = angle; scene.add(g);
}

billboard(-72,  72, 0);       billboard( 72,  72, Math.PI);
billboard(-72, -72, 0);       billboard( 72, -72, Math.PI);
billboard(  8,  95, Math.PI/2); billboard( -8, -95, -Math.PI/2);
billboard(-100, 85, 0.4);     billboard(100, -85, -0.4);
billboard( 18, -75, 0.5);     billboard(-18,  80, -0.3);
// Panneaux supplémentaires sur axes secondaires
billboard(  0,  55, 0.1); billboard( 0, -55, 0.15); billboard(45, 45, 1.2); billboard(-45, -45, -1.1);

// ══════════════════════════════════════════════════════
//  KIOSQUES, ARRÊTS DE BUS, CABINES, MOBILIER URBAIN
// ══════════════════════════════════════════════════════
function kiosk(x, z, angle = 0) {
  const g = new THREE.Group();
  // Corps kiosque (petite boutique de rue)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.0), makeMat(0xCC8833));
  body.position.y = 1.1; body.castShadow = true; g.add(body);
  // Toit incliné bicolore
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 2.4), makeMat(0xDD3300, 0.7));
  roof.position.y = 2.28; g.add(roof);
  // Vitrine
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x88ccee, transparent: true, opacity: 0.35, roughness: 0.05 }));
  glass.position.set(0, 1.0, 1.02); g.add(glass);
  // Enseigne colorée
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.08), makeMat(0xFFAA00, 0.4));
  sign.position.set(0, 2.0, 1.05); g.add(sign);
  g.position.set(x, 0, z); g.rotation.y = angle; scene.add(g);
}

function busStop(x, z, angle = 0) {
  const g = new THREE.Group();
  // Abri bus
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.4, 0.12), makeMat(0x888880, 0.6));
  back.position.y = 1.2; g.add(back);
  const roof2 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 1.0), makeMat(0x666660, 0.5));
  roof2.position.set(0, 2.45, 0.44); g.add(roof2);
  // Côtés vitrés
  [-1.65, 1.65].forEach(sx => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.10, 2.4, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.45, roughness: 0.1 }));
    side.position.set(sx, 1.2, 0.44); g.add(side);
  });
  // Panneau SOTRA
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.10), makeMat(0x0055AA, 0.5));
  panel.position.set(0, 2.0, -0.05); g.add(panel);
  // Banc
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.10, 0.40), makeMat(0x553311, 0.8));
  bench.position.set(0, 0.50, 0.35); g.add(bench);
  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.50, 0.08), makeMat(0x444444));
  leg1.position.set(-1.1, 0.25, 0.35); g.add(leg1);
  const leg2 = leg1.clone(); leg2.position.set(1.1, 0.25, 0.35); g.add(leg2);
  g.position.set(x, 0, z); g.rotation.y = angle; scene.add(g);
}

function cabineTel(x, z) {
  const g = new THREE.Group();
  const booth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xFFAA00, roughness: 0.5 }));
  booth.position.y = 1.1; g.add(booth);
  // Logo orange (MTN)
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xFFCC00, emissive: 0xFFCC00, emissiveIntensity: 0.15 }));
  logo.position.set(0, 1.8, 0.46); g.add(logo);
  // Toit
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.10, 1.0), makeMat(0xEE8800, 0.6));
  top.position.y = 2.25; g.add(top);
  g.position.set(x, 0, z); scene.add(g);
}

function muralWall(x, z, w, angle = 0) {
  // Mur peint coloré style ivoirien
  const colors = [0xFF6600, 0x00AA44, 0xFF0000, 0x0044CC, 0xFFCC00];
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 3.5, 0.25), makeMat(0xDDAA88, 0.9));
  wall.position.y = 1.75; g.add(wall);
  // Bandes colorées verticales
  const stripes = Math.floor(w / 1.2);
  for (let i = 0; i < stripes; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 3.0),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.8 }));
    stripe.position.set(-w/2 + i*(w/stripes) + 0.4, 1.75, 0.13);
    g.add(stripe);
  }
  g.position.set(x, 0, z); g.rotation.y = angle; scene.add(g);
}

// Kiosques dans les quartiers
kiosk(-8,  10, 0.2);    kiosk( 8,  10, -0.2);
kiosk(-8, -10, 0.1);    kiosk( 8, -10, -0.1);
kiosk(-68, 88, 0.3);    kiosk(-72, 105, -0.2);  // Plateau
kiosk( 68, 88, -0.3);   kiosk( 72, 105, 0.2);   // Cocody
kiosk(-68,-88, 0.4);    kiosk(-72,-105,-0.3);   // Adjamé
kiosk( 68,-88,-0.4);    kiosk( 72,-105, 0.3);   // Yopougon
kiosk( 18,-78, 0.5);    kiosk( 28,-95,-0.4);    // Treichville

// Arrêts de bus sur les axes principaux
busStop(  0,  45, Math.PI/2); busStop(  0, -45, Math.PI/2);
busStop( 68,  30, 0);         busStop(-68,  30, Math.PI);
busStop( 68, -30, 0);         busStop(-68, -30, Math.PI);
busStop(  5, 100, Math.PI/2); busStop( -5,-100, Math.PI/2);

// Cabines téléphoniques
cabineTel(-5, 25); cabineTel(5, -25); cabineTel(-68, 60); cabineTel(68, -60);
cabineTel(20, -72); cabineTel(-20, 72);

// Murals colorés (culture ivoirienne)
muralWall(-45,  30, 8, 0);    muralWall( 45, -30, 8, Math.PI);
muralWall(  8,  60, 6, Math.PI/2); muralWall(-8,-60, 6, Math.PI/2);
muralWall(-68, 130, 7, 0);    muralWall( 68,-130, 7, Math.PI);

// ══════════════════════════════════════════════════════
//  ÉTALS DU MARCHÉ + MAQUIS
// ══════════════════════════════════════════════════════
// Maquis (restaurants de rue) — liste pour le cycle jour/nuit
const maquis = [];

// Grand marché d'Adjamé
[
  [-64,-78],[-68,-81],[-72,-78],[-76,-78],
  [-64,-84],[-68,-87],[-72,-84],[-76,-84],
  [-64,-90],[-68,-93],[-72,-90],[-60,-81],
].forEach(([x,z], i) => {
  const colors = [0xFFCC44, 0xFF8844, 0x44CCFF, 0xFF4488, 0x88FF44, 0xFFFF44, 0xFF6600, 0x44FFCC, 0xCC44FF, 0xFF88CC, 0x88CCFF, 0xFFCC88];
  const stall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.0, 2.2), makeMat(colors[i % colors.length], 0.8));
  stall.position.set(x, 1.0, z); stall.castShadow = true; scene.add(stall);
  // Toit bâche colorée
  const tarp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.10, 2.8),
    makeMat([0xFF4400,0x0044AA,0x00AA22,0xAA0044,0xFFCC00][i%5], 0.65));
  tarp.position.set(x, 2.12, z); scene.add(tarp);
  // Poteau de l'étal
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), makeMat(0x444444));
  pole.position.set(x + 1.35, 1.1, z + 1.05); scene.add(pole);
});

// Treichville — maquis et restaurants de rue + tables
function maquisFull(x, z, name, color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(6, 3.0, 5), makeMat(color, 0.75));
  base.position.y = 1.5; base.castShadow = true; g.add(base);
  // Terrasse
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(7, 0.15, 6), makeMat(0xCC9944, 0.7));
  terrace.position.set(0, 0.075, 0.5); g.add(terrace);
  // Enseigne lumineuse
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.75, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xFFAA00, emissive: 0xFF8800, emissiveIntensity: 0.5, roughness: 0.3 }));
  sign.position.set(0, 3.4, 2.6); g.add(sign);
  // Tables extérieures
  for (let ti = 0; ti < 3; ti++) {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 8), makeMat(0x885522, 0.7));
    table.position.set(-1.5 + ti * 1.5, 0.75, 3.2); g.add(table);
    const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 5), makeMat(0x444444));
    tableLeg.position.set(-1.5 + ti * 1.5, 0.36, 3.2); g.add(tableLeg);
    // Parasol
    const parasol = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 8), makeMat([0xFF4400,0x0044CC,0x00AA22][ti], 0.6));
    parasol.position.set(-1.5 + ti * 1.5, 2.2, 3.2); g.add(parasol);
    const parasol_pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), makeMat(0x888888));
    parasol_pole.position.set(-1.5 + ti * 1.5, 1.5, 3.2); g.add(parasol_pole);
  }
  // Lumière maquis (s'allume à 21h)
  const light = new THREE.PointLight(0xFF8800, 0, 10);
  light.position.set(x, 4.0, z);
  scene.add(light);
  g.position.set(x, 0, z); scene.add(g);
  maquis.push({ light, base });
}

maquisFull(20, -85, 'MAQUIS DU PORT', 0xBB7733);
maquisFull(35,-102, 'CHEZ KOUAMÉ',    0xAA6622);
maquisFull(12,-118, 'BAR SAVANE',     0xCC8844);

const lampadaires = [];
[
  // Axe central nord-sud
  [-8,90],[8,90],[-8,50],[8,50],[-8,0],[8,0],[-8,-50],[8,-50],[-8,-90],[8,-90],[-8,-140],[8,-140],
  // Route x=70
  [64,80],[64,0],[64,-80],
  // Route x=-70
  [-64,80],[-64,0],[-64,-80],
  // Est-ouest z=90
  [-30,84],[30,84],
  // Est-ouest z=-90
  [-30,-96],[30,-96],
].forEach(([x,z]) => {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5, 5), makeMat(0x555555));
  post.position.set(x, 2.5, z); scene.add(post);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), makeMat(0xffffdd, 0.3));
  cap.position.set(x, 5.1, z); scene.add(cap);
  const light = new THREE.PointLight(0xFFEE88, 0, 12);
  light.position.set(x, 5, z);
  scene.add(light);
  lampadaires.push(light);
});

// ══════════════════════════════════════════════════════
//  LOOT
// ══════════════════════════════════════════════════════
const lootItems = [];
const lootGeoSphere = new THREE.SphereGeometry(0.22, 8, 8);

function spawnLoot(x, z, type) {
  const colors = { money: 0x00ff88, ammo_pistol: 0xffdd00, ammo_ak47: 0xff6600, armor: 0x3399ff, health: 0xff3366 };
  const mesh = new THREE.Mesh(lootGeoSphere, new THREE.MeshStandardMaterial({
    color: colors[type] ?? 0xffffff,
    emissive: colors[type] ?? 0xffffff,
    emissiveIntensity: 0.5
  }));
  mesh.position.set(x, 0.4, z);
  mesh.userData = { type, collected: false };
  scene.add(mesh); lootItems.push(mesh);
}

function checkLootPickup() {
  const px = playerChar.group.position.x, pz = playerChar.group.position.z;
  for (let i = lootItems.length - 1; i >= 0; i--) {
    const item = lootItems[i];
    if (item.userData.collected) continue;
    const dx = px - item.position.x, dz = pz - item.position.z;
    if (Math.sqrt(dx*dx + dz*dz) < 1.5) {
      item.userData.collected = true;
      scene.remove(item); lootItems.splice(i, 1);
      const t = item.userData.type;
      if (t === 'money') {
        const amt = 150 + Math.floor(Math.random() * 300);
        playerState.money += amt;
        showNotif('💰 +' + amt.toLocaleString() + ' FCFA ramassé!');
        playPickup();
      } else if (t === 'ammo_pistol') {
        playerState.ammo.pistol += 15; showNotif('🔫 +15 balles pistolet'); playPickup();
        if (playerState.weapon === 'pistol') updateAmmoDisplay();
      } else if (t === 'ammo_ak47') {
        playerState.ammo.ak47 += 30; showNotif('🔫 +30 balles AK-47'); playPickup();
        if (playerState.weapon === 'ak47') updateAmmoDisplay();
      } else if (t === 'armor') {
        playerState.armor = Math.min(100, playerState.armor + 50);
        showNotif('🛡️ +50 Armure!'); playPickup();
      } else if (t === 'health') {
        playerState.hp = Math.min(100, playerState.hp + 40);
        showNotif('❤️ +40 Santé!'); playPickup();
      }
      updateHUD();
    }
  }
}

// ══════════════════════════════════════════════════════
//  PARTICULES D'IMPACT
// ══════════════════════════════════════════════════════
const particles = [];
const particleGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const particleMat = makeMat(0xddaa44, 0.5);

function spawnImpactParticles(pos) {
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(particleGeo, particleMat);
    p.position.copy(pos);
    p.userData.vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.18,
      Math.random() * 0.18,
      (Math.random() - 0.5) * 0.18
    );
    p.userData.life = 18 + Math.floor(Math.random() * 8);
    scene.add(p); particles.push(p);
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.position.add(p.userData.vel);
    p.userData.vel.y -= 0.012;
    p.userData.life--;
    p.material.opacity = p.userData.life / 24;
    p.material.transparent = true;
    if (p.userData.life <= 0) {
      scene.remove(p); particles.splice(i, 1);
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
  hp: 100, armor: 0, stamina: 100, money: 0,
  weapon: 'pistol',
  ammo: { pistol: 30, ak47: 90, knife: 999 },
  wanted: 0, wantedCooldown: 0,
  inVehicle: false, currentVehicle: null,
  isSprinting: false, isShooting: false,
  isGrounded: true, isCrouching: false,
  velocityY: 0, isReloading: false, reloadTimer: 0,
  dead: false,
  reputation: { Plateau: 0, Cocody: 0, Adjamé: 0, Yopougon: 0, Treichville: 0 },
};

// ══════════════════════════════════════════════════════
//  VÉHICULES
// ══════════════════════════════════════════════════════
const vehicleList = [];

function makeVehicle(x, z, bodyColor, type = 'woro') {
  const g = new THREE.Group();
  const scales = { woro: [2.4, 1.1, 4.8], gbaka: [2.6, 1.6, 6.5], moto: [0.75, 0.9, 2.0] };
  const sc = scales[type] ?? scales.woro;

  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(sc[0], sc[1] * 0.55, sc[2]), makeMat(bodyColor, 0.4, 0.3));
  bodyM.position.y = sc[1] * 0.28; bodyM.castShadow = true; g.add(bodyM);

  const roofM = new THREE.Mesh(new THREE.BoxGeometry(sc[0]*0.88, sc[1]*0.5, sc[2]*0.58), makeMat(bodyColor, 0.4, 0.3));
  roofM.position.set(0, sc[1]*0.75, sc[2]*0.05); roofM.castShadow = true; g.add(roofM);

  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.45, roughness: 0.1 });
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(sc[0]*0.78, sc[1]*0.42), glassMat);
  windshield.position.set(0, sc[1]*0.72, sc[2]*0.33); windshield.rotation.x = 0.3; g.add(windshield);

  const wheelOffsets = type === 'moto'
    ? [[0, 0.2, 0.7],[0, 0.2, -0.7]]
    : [[sc[0]/2+0.05,0.28,sc[2]*0.33],[sc[0]/2+0.05,0.28,-sc[2]*0.33],
       [-sc[0]/2-0.05,0.28,sc[2]*0.33],[-sc[0]/2-0.05,0.28,-sc[2]*0.33]];

  const wheels = [];
  wheelOffsets.forEach(([wx,wy,wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.38,0.26,10), makeMat(0x1a1a1a));
    wheel.rotation.z = Math.PI/2; wheel.position.set(wx,wy,wz); wheel.castShadow = true; g.add(wheel);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.28,8), makeMat(0xaaaaaa,0.3,0.7));
    rim.rotation.z = Math.PI/2; rim.position.set(wx,wy,wz); g.add(rim);
    wheels.push(wheel);
  });

  const hlMat = new THREE.MeshStandardMaterial({ color:0xffffee, emissive:0xffffee, emissiveIntensity:0.6 });
  [-sc[0]*0.35, sc[0]*0.35].forEach(hx => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.2,0.08), hlMat);
    hl.position.set(hx, sc[1]*0.28, sc[2]/2+0.04); g.add(hl);
  });

  const rlMat = new THREE.MeshStandardMaterial({ color:0xff2200, emissive:0xff2200, emissiveIntensity:0.4 });
  [-sc[0]*0.35, sc[0]*0.35].forEach(hx => {
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.18,0.06), rlMat);
    rl.position.set(hx, sc[1]*0.28, -sc[2]/2-0.04); g.add(rl);
  });

  if (type === 'woro') {
    const signM = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.25,0.08), makeMat(0xFF6600));
    signM.position.set(0, sc[1]*1.02, 0); g.add(signM);
  }

  g.position.set(x, 0.15, z);
  g.userData = {
    type, hp: 100, bodyColor, origBodyColor: bodyColor,
    velX:0, velZ:0, speed:0, angle: Math.random()*Math.PI*2,
    steer:0, accel:0, onRoad:false,
    maxSpeed: type==='moto'?0.28:type==='gbaka'?0.14:0.20,
    accelRate: type==='moto'?0.012:0.008,
    brakeRate:0.015, friction:0.96,
    steerSpeed: type==='moto'?0.055:0.038,
    aiMode:'traffic', aiTimer:Math.random()*200, aiTarget:null,
    wheelAngle:0, wheels,
    lastKlaxon: Math.random() * 15000,
    bodyMesh: bodyM, roofMesh: roofM,
  };
  scene.add(g); vehicleList.push(g);
  return g;
}

// Véhicules spawned sur les routes principales
makeVehicle(  3,  40, 0xFF6200, 'woro');   // avenue centrale nord
makeVehicle( -3, -30, 0xFF8C00, 'woro');   // avenue centrale sud
makeVehicle(  3,  80, 0xFF4400, 'woro');   // avenue centrale loin
makeVehicle(-70,  15, 0x3355CC, 'gbaka'); // route Plateau/Adjamé
makeVehicle( 70, -10, 0xCC0000, 'moto');  // route Cocody/Yopougon
makeVehicle(  3, -80, 0x00AA44, 'moto');  // avenue centrale sud loin

// ══════════════════════════════════════════════════════
//  PNJs
// ══════════════════════════════════════════════════════
const npcList = [];

const npcDefs = [
  // Plateau (nord-ouest)
  ['dark',  'civil',  -65,  85], ['medium','civil',  -80, 100],
  ['light', 'civil',  -55, 120], ['dark',  'gang',   -70,  75],
  // Cocody (nord-est)
  ['light', 'civil',   65,  85], ['medium','civil',   85, 110],
  ['dark',  'civil',   75, 140], ['medium','gang',    95,  70],
  // Adjamé (sud-ouest)
  ['dark',  'dealer',  -65, -80], ['dark',  'gang',  -80, -95],
  ['medium','civil',   -55, -70], ['dark',  'police', -70,-110],
  // Yopougon (sud-est)
  ['dark',  'gang',    65, -80], ['medium','dealer',  80, -95],
  ['light', 'civil',   70, -65], ['medium','police',  90,-110],
  // Treichville (sud-centre)
  ['dark',  'civil',   15, -80], ['medium','gang',    30, -95],
  // Centre
  ['dark',  'police',   5, -20], ['medium','police', -5,  20],
];

npcDefs.forEach(([skin, outfit, x, z]) => {
  const npc = buildNPC(skin, outfit, x, z);
  scene.add(npc.group);
  npcList.push(npc);
  npc.attachWeapon(outfit==='gang'||outfit==='dealer'||outfit==='police' ? 'pistol' : null);
  npc.group.userData.outfit = outfit;
  npc.npc.shootCooldown = 0;
  npc.npc.idleTalkTimer = Math.random() * 5000;
  npc.npc.backupCalled = false;
});

// ══════════════════════════════════════════════════════
//  MISSIONS ENRICHIES
// ══════════════════════════════════════════════════════
const missions = [
  {
    id: 0, title: '💰 Braquage Rapide',
    desc: 'Vole la recette chez le cambiste au Plateau.',
    reward: 1500, target: { x: -70, z: 90 }, type: 'heist', timerSec: 120,
  },
  {
    id: 1, title: '🏃 Fuite des Flics',
    desc: 'Les kpôkô te cherchent! File vers Cocody.',
    reward: 800, target: { x: 75, z: 120 }, type: 'escape', timerSec: 60,
  },
  {
    id: 2, title: '🔫 Règlement de Compte',
    desc: 'Élimine 3 membres du gang rival à Adjamé.',
    reward: 2500, target: null, type: 'eliminate', killCount: 3, timerSec: 180,
  },
  {
    id: 3, title: '🚕 Vol de Véhicule',
    desc: 'Vole le gbaka bleu et amène-le à Treichville.',
    reward: 1200, target: { x: 20, z: -90 }, type: 'vehicle', timerSec: 90,
  },
  {
    id: 4, title: '🌙 Deal de Nuit',
    desc: 'Retrouve le contact à Yopougon après 22h.',
    reward: 3000, target: { x: 75, z: -100 }, type: 'night_deal', timerSec: 0,
  },
  {
    id: 5, title: '🚀 Course Illégale',
    desc: 'Atteins les 3 checkpoints! Plateau → Cocody → Yopougon.',
    reward: 4000, targets: [{x:-70,z:90},{x:75,z:120},{x:75,z:-95}], currentTarget: 0,
    type: 'race', timerSec: 120,
  },
];

const missionState = {
  current: 0, active: false, timer: 0,
  killsNeeded: 0, killsDone: 0,
  raceTarget: 0,
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
  missionState.active = true;
  missionState.timer = m.timerSec;
  missionState.killsDone = 0;
  missionState.killsNeeded = m.killCount ?? 0;
  missionState.raceTarget = 0;

  document.getElementById('mission-title').textContent = m.title;
  document.getElementById('mission-desc').textContent = m.desc;

  const tgt = m.target || (m.targets && m.targets[0]);
  if (tgt) {
    targetDisc.position.set(tgt.x, 0.08, tgt.z);
    markerCone.position.set(tgt.x, 4.5, tgt.z);
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
let isPaused = false;

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k==='arrowup'  ||k==='w'||k==='z') keys.up    = true;
  if (k==='arrowdown'||k==='s')          keys.down  = true;
  if (k==='arrowleft'||k==='a'||k==='q') keys.left  = true;
  if (k==='arrowright'||k==='d')         keys.right = true;
  if (k===' ')  { keys.jump  = true; e.preventDefault(); }
  if (k==='shift') keys.sprint = true;
  if (k==='c')  { keys.crouch = !keys.crouch; }
  if (k==='f')  toggleVehicle();
  if (k==='e')  tryPickup();
  if (k==='1')  switchWeapon('fists');
  if (k==='2')  switchWeapon('knife');
  if (k==='3')  switchWeapon('pistol');
  if (k==='4')  switchWeapon('ak47');
  if (k==='r')  { if (!keys.shoot) reload(); }
  if (k==='g')  keys.shoot = true;
  if (k==='escape') togglePause();
});
document.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k==='arrowup'  ||k==='w'||k==='z') keys.up    = false;
  if (k==='arrowdown'||k==='s')          keys.down  = false;
  if (k==='arrowleft'||k==='a'||k==='q') keys.left  = false;
  if (k==='arrowright'||k==='d')         keys.right = false;
  if (k===' ')  keys.jump  = false;
  if (k==='shift') keys.sprint = false;
  if (k==='g')  keys.shoot = false;
});

const joystickZone = document.getElementById('joystick-zone');
const stick = document.getElementById('joystick-stick');
let joystickActive = false;

function joyMove(clientX, clientY) {
  const rect = joystickZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const dx = clientX - cx, dy = clientY - cy;
  const maxR = 40, dist = Math.min(Math.sqrt(dx*dx+dy*dy), maxR);
  const ang = Math.atan2(dy, dx);
  stick.style.left = (40 + Math.cos(ang)*dist) + 'px';
  stick.style.top  = (40 + Math.sin(ang)*dist) + 'px';
  joyX = Math.cos(ang)*dist/maxR; joyY = Math.sin(ang)*dist/maxR;
}
function joyReset() { joystickActive=false; joyX=0; joyY=0; stick.style.left='40px'; stick.style.top='40px'; }
joystickZone.addEventListener('touchstart', e => { e.preventDefault(); joystickActive=true; }, {passive:false});
joystickZone.addEventListener('touchmove',  e => { e.preventDefault(); if(joystickActive) joyMove(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, {passive:false});
['touchend','touchcancel'].forEach(ev => joystickZone.addEventListener(ev, e => { e.preventDefault(); joyReset(); }, {passive:false}));
joystickZone.addEventListener('mousedown', () => joystickActive=true);
window.addEventListener('mousemove', e => { if(joystickActive) joyMove(e.clientX, e.clientY); });
window.addEventListener('mouseup', () => { if(joystickActive) joyReset(); });

let camDragging=false, lastCX=0;
renderer.domElement.addEventListener('mousedown', e => { if(!joystickActive){ camDragging=true; lastCX=e.clientX; }});
window.addEventListener('mouseup', () => camDragging=false);
window.addEventListener('mousemove', e => { if(camDragging){ camAngleH -= (e.clientX-lastCX)*0.009; lastCX=e.clientX; }});
let lookTouchId=null, lastLX=0;
renderer.domElement.addEventListener('touchstart', e => {
  for(const t of e.changedTouches) { if(t.clientX > window.innerWidth*0.42) { lookTouchId=t.identifier; lastLX=t.clientX; } }
});
renderer.domElement.addEventListener('touchmove', e => {
  for(const t of e.changedTouches) { if(t.identifier===lookTouchId) { camAngleH -= (t.clientX-lastLX)*0.009; lastLX=t.clientX; } }
});

function btnPress(id, fn) {
  const el = document.getElementById(id); if(!el) return;
  ['click','touchstart'].forEach(ev => el.addEventListener(ev, e => { e.stopPropagation(); fn(); }, {passive:false}));
}
btnPress('btn-jump', () => { if(playerState.isGrounded && !playerState.inVehicle){ playerState.velocityY=0.22; playerState.isGrounded=false; }});
btnPress('btn-shoot', () => { if(!playerState.dead) fireBullet(); });
btnPress('btn-car', toggleVehicle);
btnPress('btn-run', () => {
  sprintToggle = !sprintToggle;
  document.getElementById('btn-run').style.background = sprintToggle ? 'rgba(0,200,100,0.5)' : 'rgba(0,200,100,0.2)';
});
btnPress('btn-pause', togglePause);

const reloadBtn = document.createElement('div');
reloadBtn.className = 'abtn sm'; reloadBtn.id = 'btn-reload';
reloadBtn.style.cssText = 'background:rgba(150,100,255,0.25);border-color:#aa77ff;color:#cc99ff;';
reloadBtn.innerHTML = '🔄<br>RELOAD';
document.getElementById('row-btns').appendChild(reloadBtn);
btnPress('btn-reload', reload);

// ══════════════════════════════════════════════════════
//  PAUSE
// ══════════════════════════════════════════════════════
function togglePause() {
  isPaused = !isPaused;
  let pauseEl = document.getElementById('pause-screen');
  if (!pauseEl) {
    pauseEl = document.createElement('div');
    pauseEl.id = 'pause-screen';
    pauseEl.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.85);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      z-index:300;font-family:'Arial Black',Arial,sans-serif;
    `;
    pauseEl.innerHTML = `
      <div style="color:#FFD700;font-size:36px;letter-spacing:4px;margin-bottom:28px;">⏸ PAUSE</div>
      <button id="pause-resume" style="margin:8px;background:#FFD700;color:#000;border:none;padding:12px 36px;font-size:16px;font-weight:900;border-radius:24px;cursor:pointer;letter-spacing:2px;">▶ REPRENDRE</button>
      <button id="pause-restart-mission" style="margin:8px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid #aaa;padding:10px 28px;font-size:14px;border-radius:24px;cursor:pointer;">🔄 RECOMMENCER LA MISSION</button>
      <div style="color:#666;margin-top:24px;font-size:12px;">ÉCHAP pour reprendre</div>
    `;
    document.body.appendChild(pauseEl);
    document.getElementById('pause-resume').onclick = () => { isPaused=false; pauseEl.style.display='none'; };
    document.getElementById('pause-restart-mission').onclick = () => {
      isPaused=false; pauseEl.style.display='none';
      activateMission(missionState.current);
      showNotif('Mission relancée!');
    };
  }
  pauseEl.style.display = isPaused ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════
//  ARMES, TIR & RECHARGEMENT
// ══════════════════════════════════════════════════════
const MAX_AMMO = { pistol: 12, ak47: 30 };
const RELOAD_TIME = { pistol: 1500, ak47: 2200 };

function updateAmmoDisplay() {
  const w = playerState.weapon;
  const a = playerState.ammo[w];
  const icons = { pistol:'🔫', ak47:'💥', knife:'🔪', fists:'👊' };
  document.getElementById('weapon-name').textContent = (icons[w]||'') + ' ' + w.toUpperCase();
  document.getElementById('ammo-count').textContent = a !== undefined ? a + ' / ' + (MAX_AMMO[w]||'∞') : '';
}

function switchWeapon(type) {
  if (playerState.isReloading) return;
  playerState.weapon = type;
  playerChar.attachWeapon(type==='fists' ? null : type);
  updateAmmoDisplay();
}

function reload() {
  const w = playerState.weapon;
  if (w==='fists'||w==='knife') return;
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
  updateAmmoDisplay(); showNotif('✅ Prêt!');
}

// ── Pool de balles ──
const BULLET_POOL_SIZE = 80;
const bulletGeo = new THREE.SphereGeometry(0.06, 4, 4);
const bulletMatPlayer = new THREE.MeshStandardMaterial({ color:0xFFDD44, emissive:0xFFDD44, emissiveIntensity:1 });
const bulletMatNPC    = new THREE.MeshStandardMaterial({ color:0xff4444, emissive:0xff4444, emissiveIntensity:1 });
const bulletPool = Array.from({length:BULLET_POOL_SIZE}, () => {
  const m = new THREE.Mesh(bulletGeo, bulletMatPlayer);
  m.visible = false; m.userData = { active:false, vel:new THREE.Vector3(), life:0 };
  scene.add(m); return m;
});
let bulletPoolIdx = 0;
const bullets = [];
const raycasterPool = new THREE.Raycaster();

function getBullet(isPlayer) {
  for (let i=0; i<BULLET_POOL_SIZE; i++) {
    const idx = (bulletPoolIdx+i)%BULLET_POOL_SIZE;
    const b = bulletPool[idx];
    if (!b.userData.active) { bulletPoolIdx=(idx+1)%BULLET_POOL_SIZE; b.material=isPlayer?bulletMatPlayer:bulletMatNPC; b.userData.active=true; b.visible=true; return b; }
  }
  const b = bulletPool[bulletPoolIdx]; bulletPoolIdx=(bulletPoolIdx+1)%BULLET_POOL_SIZE;
  b.material=isPlayer?bulletMatPlayer:bulletMatNPC; b.userData.active=true; b.visible=true; return b;
}
function releaseBullet(b) { b.userData.active=false; b.visible=false; }

// ── Système de couverture ─────────────────────────────
function isInCover() {
  if (!keys.crouch) return false;
  const origin = playerChar.group.position.clone().add(new THREE.Vector3(0, 1, 0));
  const dirs = [
    new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0),
    new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1),
  ];
  for (const dir of dirs) {
    raycasterPool.set(origin, dir); raycasterPool.far = 1.5;
    const hits = raycasterPool.intersectObjects(buildingMeshes, false);
    if (hits.length > 0) return true;
  }
  return false;
}

function fireBullet() {
  if (playerState.isReloading) { showNotif('Rechargement en cours...'); return; }
  const w = playerState.weapon;
  if (w==='fists'||w==='knife') { meleeAttack(); return; }
  if (playerState.ammo[w] <= 0) { showNotif('Plus de munitions! [R] pour recharger'); reload(); return; }
  playerState.ammo[w]--; updateAmmoDisplay();
  playShot(w);

  const fwd = _v1.set(Math.sin(camAngleH), 0, Math.cos(camAngleH)).clone();
  const origin = playerChar.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));

  const bm = getBullet(true);
  bm.position.copy(origin);
  bm.userData.vel.copy(fwd).multiplyScalar(w==='ak47'?1.8:1.2);
  bm.userData.life = 60; bullets.push(bm);

  // Flash muzzle : simple sprite émissif (pas de PointLight = gains perfs)
  const fl = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 5, 4),
    new THREE.MeshStandardMaterial({ color:0xFFAA00, emissive:0xFFAA00, emissiveIntensity:3.5, transparent:true, opacity:0.85 })
  );
  fl.position.copy(origin).addScaledVector(fwd, 0.8);
  scene.add(fl);
  setTimeout(() => scene.remove(fl), 60);

  raycasterPool.set(origin, fwd.normalize()); raycasterPool.far = w==='ak47'?60:30;

  npcList.forEach(npc => {
    if (npc.npc.state==='dead') return;
    const hits = raycasterPool.intersectObject(npc.group, true);
    if (hits.length) {
      const dmg = w==='ak47'?35:20;
      const killed = npc.npc.takeDamage(dmg);
      if (killed) killNPC(npc);
      else npc.npc.state = (npc.group.userData.outfit==='police'||npc.group.userData.outfit==='gang') ? 'chase' : 'flee';
    }
  });

  const bHits = raycasterPool.intersectObjects(buildingMeshes, false);
  if (bHits.length > 0) {
    const hitMesh = bHits[0].object;
    const bEntry = buildings.find(b => b.mesh===hitMesh);
    if (bEntry) { damageBuildingFlash(bEntry); spawnImpactParticles(bHits[0].point); }
  }

  playerState.wanted = Math.min(5, playerState.wanted+1);
  playerState.wantedCooldown = 15;
  updateWanted();
}

function meleeAttack() {
  npcList.forEach(npc => {
    if(npc.npc.state==='dead') return;
    const d = playerChar.group.position.distanceTo(npc.group.position);
    if(d < 2.2) {
      npc.npc.hp -= playerState.weapon==='knife'?45:15;
      if(npc.npc.hp<=0) killNPC(npc);
    }
  });
}

function killNPC(npc) {
  npc.npc.state = 'dead'; npc.npc.hp = 0; npc.setAnim('die');
  const lx = npc.group.position.x + (Math.random()-0.5)*2;
  const lz = npc.group.position.z + (Math.random()-0.5)*2;
  const r = Math.random();
  if (r<0.4) spawnLoot(lx,lz,'money');
  else if (r<0.55) spawnLoot(lx,lz,'ammo_pistol');
  else if (r<0.65) spawnLoot(lx,lz,'ammo_ak47');
  else if (r<0.73) spawnLoot(lx,lz,'armor');
  else if (r<0.8)  spawnLoot(lx,lz,'health');

  const loot = 100 + Math.floor(Math.random()*400);
  playerState.money += loot;
  showNotif('+' + loot.toLocaleString() + ' FCFA 💀');
  updateHUD();

  npcList.forEach(other => {
    if (other===npc||other.npc.state==='dead') return;
    const d = other.group.position.distanceTo(npc.group.position);
    if (d<18 && (other.group.userData.outfit==='police'||other.group.userData.outfit==='gang')) other.npc.state='chase';
  });

  if (missionState.active && missions[missionState.current].type==='eliminate') {
    missionState.killsDone++;
    if (missionState.killsDone >= missionState.killsNeeded) completeMission();
  }

  const feed = document.getElementById('kill-feed');
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  const icons = { police:'👮', gang:'🔫', dealer:'💊', civil:'😱', braqueur:'🦹' };
  entry.textContent = (icons[npc.group.userData.outfit]??'💀') + ' ' + (npc.group.userData.outfit??'inconnu') + ' neutralisé';
  feed.appendChild(entry);
  setTimeout(() => entry.remove(), 3200);
}

// ── Spawn de renforts police ──────────────────────────
function spawnPoliceBackup(nearX, nearZ) {
  const offsets = [[15,0],[-15,0],[0,15],[0,-15]];
  const off = offsets[Math.floor(Math.random()*offsets.length)];
  const npc = buildNPC('medium', 'police', nearX+off[0], nearZ+off[1]);
  scene.add(npc.group);
  npcList.push(npc);
  npc.attachWeapon('pistol');
  npc.group.userData.outfit = 'police';
  npc.npc.shootCooldown = 0;
  npc.npc.state = 'chase';
  npc.npc.backupCalled = false;
  showNotif('🚔 Renforts en approche!');
}

// ══════════════════════════════════════════════════════
//  NPC RIPOSTE
// ══════════════════════════════════════════════════════
function npcShootPlayer(npc, now) {
  if (!npc.npc.shootCooldown) npc.npc.shootCooldown = 0;
  if (now < npc.npc.shootCooldown) return;
  const outfit = npc.group.userData.outfit;
  const isHostile = outfit==='police'||outfit==='gang'||outfit==='dealer';
  if (!isHostile || npc.npc.state!=='chase') return;

  const dist = npc.group.position.distanceTo(playerChar.group.position);
  if (dist > 20) return;

  npc.npc.shootCooldown = now + (outfit==='police'?1800:2400);
  const hitChance = outfit==='police'?0.70:0.50;
  if (Math.random() < hitChance) {
    let dmg = outfit==='police'?12:8;
    if (isInCover()) dmg = Math.floor(dmg * 0.5); // couverture -50%
    if (playerState.armor > 0) {
      const armorDmg = Math.min(playerState.armor, dmg*0.6);
      playerState.armor -= armorDmg; playerState.hp -= dmg-armorDmg;
    } else {
      playerState.hp -= dmg;
    }
    playerState.hp = Math.max(0, playerState.hp);
    updateHUD(); showDamageFlash();
    if (playerChar.triggerHit) playerChar.triggerHit();
    if (playerState.hp <= 0) triggerGameOver();
  }

  // Call backup — police seulement, 1 fois
  if (outfit==='police' && !npc.npc.backupCalled && playerState.wanted >= 3 && Math.random() < 0.25) {
    npc.npc.backupCalled = true;
    npc.npc.state = 'idle'; // S'arrête pour appeler
    playRadio();
    showNotif('📻 La police appelle des renforts!');
    setTimeout(() => {
      spawnPoliceBackup(npc.group.position.x, npc.group.position.z);
      spawnPoliceBackup(npc.group.position.x, npc.group.position.z);
      npc.npc.state = 'chase';
    }, 2500);
  }

  const npcOrigin = npc.group.position.clone().add(new THREE.Vector3(0,1.2,0));
  const bm = getBullet(false);
  bm.position.copy(npcOrigin);
  _v3.copy(playerChar.group.position).sub(npcOrigin).normalize();
  bm.userData.vel.copy(_v3).multiplyScalar(1.0);
  bm.userData.life = 40; bullets.push(bm);
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
  setTimeout(() => flash.style.opacity='0', 150);
}

// Vignette rouge pulsante si HP < 25%
let vignetteInterval = null;
function updateVignette() {
  let vig = document.getElementById('low-health-vignette');
  if (!vig) {
    vig = document.createElement('div');
    vig.id = 'low-health-vignette';
    vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9;transition:opacity .4s;opacity:0;box-shadow:inset 0 0 80px 30px rgba(255,0,0,0.6);';
    document.body.appendChild(vig);
  }
  if (playerState.hp < 25 && !playerState.dead) {
    if (!vignetteInterval) {
      let v = 0;
      vignetteInterval = setInterval(() => {
        v += 0.08;
        vig.style.opacity = String(0.4 + Math.sin(v) * 0.4);
      }, 40);
    }
  } else {
    if (vignetteInterval) { clearInterval(vignetteInterval); vignetteInterval=null; }
    vig.style.opacity = '0';
  }
}

// ══════════════════════════════════════════════════════
//  GAME OVER
// ══════════════════════════════════════════════════════
function triggerGameOver() {
  if (playerState.dead) return;
  playerState.dead = true;
  playerChar.setAnim('die');
  if (vignetteInterval) { clearInterval(vignetteInterval); vignetteInterval=null; }

  let go = document.getElementById('game-over');
  if (!go) {
    go = document.createElement('div');
    go.id = 'game-over';
    go.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200;color:#fff;font-family:'Arial Black',Arial,sans-serif;`;
    go.innerHTML = `
      <div style="font-size:48px;color:#ff3333;text-shadow:0 0 20px #ff0000;margin-bottom:12px;">💀 WASTED</div>
      <div style="font-size:20px;color:#FFD700;margin-bottom:8px;">Argent gagné : <span id="go-money">0</span> FCFA</div>
      <div style="font-size:14px;color:#aaa;margin-bottom:30px;">Niveau recherché : <span id="go-wanted">0</span> ⭐</div>
      <button id="go-restart" style="background:#FFD700;color:#000;border:none;padding:14px 40px;font-size:18px;font-weight:900;border-radius:30px;cursor:pointer;text-transform:uppercase;letter-spacing:2px;box-shadow:0 0 20px rgba(255,215,0,0.5);">🔄 RÉESSAYER</button>
    `;
    document.body.appendChild(go);
  }
  document.getElementById('go-money').textContent = playerState.money.toLocaleString();
  document.getElementById('go-wanted').textContent = playerState.wanted;
  go.style.display = 'flex';

  document.getElementById('go-restart').onclick = () => {
    go.style.display = 'none';
    playerState.hp=100; playerState.armor=0; playerState.stamina=100;
    playerState.money=0; playerState.wanted=0; playerState.wantedCooldown=0;
    playerState.dead=false; playerState.inVehicle=false;
    playerState.currentVehicle=null; playerState.isReloading=false;
    playerState.ammo={pistol:30,ak47:90,knife:999};
    playerState.weapon='pistol'; playerState.isCrouching=false;
    keys.crouch=false;
    playerChar.group.position.set(0,0,0); playerChar.group.rotation.y=0;
    if(playerChar.revive) playerChar.revive();
    playerChar.attachWeapon('pistol');
    bullets.forEach(b => releaseBullet(b)); bullets.length=0;
    npcList.forEach(npc => { npc.npc.state='patrol'; npc.npc.hp=100; npc.npc.timer=0; npc.npc.shootCooldown=0; npc.npc.backupCalled=false; if(npc.revive) npc.revive(); });
    lootItems.forEach(item => scene.remove(item)); lootItems.length=0;
    spawnLoot( 8, 15,'ammo_pistol'); spawnLoot(-8, 20,'health');
    spawnLoot( 5, -8,'armor');       spawnLoot(-5, -5,'money');
    spawnLoot(-70, 90,'ammo_ak47');  spawnLoot(70, 90,'money');
    spawnLoot(-70,-80,'armor');      spawnLoot(70,-80,'ammo_pistol');
    activateMission(0); updateHUD(); updateWanted(); switchWeapon('pistol');
    document.getElementById('crosshair').style.display='block';
    playerChar.group.visible=true;
  };
}

// ══════════════════════════════════════════════════════
//  VÉHICULES — ENTRÉE/SORTIE
// ══════════════════════════════════════════════════════
function toggleVehicle() {
  if(playerState.dead) return;
  if(playerState.inVehicle) {
    playerState.inVehicle=false; playerChar.group.visible=true; playerState.currentVehicle=null;
    const btn=document.getElementById('btn-car'); if(btn) btn.innerHTML='🚕<br>AUTO';
    showNotif('Tu descends.'); document.getElementById('crosshair').style.display='block'; return;
  }
  let nearest=null, minD=7;
  vehicleList.forEach(v => { const d=v.position.distanceTo(playerChar.group.position); if(d<minD){minD=d;nearest=v;} });
  if(nearest) {
    playerState.inVehicle=true; playerState.currentVehicle=nearest; playerChar.group.visible=false;
    const btn=document.getElementById('btn-car'); if(btn) btn.innerHTML='🚗<br>SORTIR';
    document.getElementById('crosshair').style.display='none';
    showNotif('Tu montes dans le ' + nearest.userData.type + '!');
  } else { showNotif('Pas de véhicule à portée!'); }
}

function tryPickup() { checkLootPickup(); }

// ══════════════════════════════════════════════════════
//  CYCLE JOUR/NUIT
// ══════════════════════════════════════════════════════
const gameTime = { minutes: 8*60, speed: 0.3 };
let _lastNightState = false;

function updateDayNight(dtMs) {
  gameTime.minutes += gameTime.speed * dtMs / 1000;
  if(gameTime.minutes >= 24*60) gameTime.minutes = 0;
  const h = gameTime.minutes / 60;

  let skyR,skyG,skyB,sunI,ambI;
  if(h>=6&&h<8)        { skyR=255;skyG=180;skyB=100; sunI=0.7; ambI=0.35; }
  else if(h>=8&&h<17)  { skyR=115;skyG=185;skyB=235; sunI=1.3; ambI=0.55; }
  else if(h>=17&&h<19) { skyR=255;skyG=120;skyB=60;  sunI=0.7; ambI=0.3; }
  else                 { skyR=12; skyG=15; skyB=50;  sunI=0.05;ambI=0.12; }

  _skyColor.setRGB(skyR/255, skyG/255, skyB/255);
  scene.background = _skyColor; scene.fog.color.copy(_skyColor);
  ambient.intensity = ambI; sun.intensity = sunI;

  const angle = (h/24)*Math.PI*2 - Math.PI/2;
  sun.position.set(Math.cos(angle)*80, Math.abs(Math.sin(angle))*80, 20);

  const hh = Math.floor(h);
  const mm = Math.floor((h-hh)*60);
  const isNight = h<6||h>=19;
  document.getElementById('time-display').textContent = `${isNight?'🌙':'☀️'} ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;

  // Lampadaires s'allument à 18h
  const lampOn = h>=18 || h<6;
  lampadaires.forEach(l => {
    l.intensity = lampOn ? 1.5 : 0;
  });

  // Maquis lumineux après 21h
  const maqOn = h>=21 || h<4;
  maquis.forEach(m => { m.light.intensity = maqOn ? 2 : 0; });

  // Fenêtres des bâtiments s'allument la nuit (seulement si changement)
  if (_lastNightState !== isNight) {
    _lastNightState = isNight;
    buildings.forEach(b => {
      b.mesh.traverse(child => {
        if (child.isMesh && child !== b.mesh && child.material?.emissiveIntensity !== undefined) {
          child.material.emissiveIntensity = isNight ? 0.45 : 0.05;
        }
      });
    });
  }

  updateAmbientSound(isNight, h);
}

// ══════════════════════════════════════════════════════
//  HUD
// ══════════════════════════════════════════════════════
let fpsVisible = false, fpsCounter = 0, fpsTimer = 0, fpsCurrent = 0;

// Double tap minimap → FPS
document.getElementById('minimap-wrap').addEventListener('dblclick', () => {
  fpsVisible = !fpsVisible;
  let fpsEl = document.getElementById('fps-display');
  if (!fpsEl && fpsVisible) {
    fpsEl = document.createElement('div');
    fpsEl.id = 'fps-display';
    fpsEl.style.cssText = 'position:absolute;top:160px;right:14px;color:#0f0;font-size:11px;font-family:monospace;background:rgba(0,0,0,0.5);padding:2px 6px;border-radius:4px;';
    document.getElementById('hud').appendChild(fpsEl);
  }
  if (fpsEl) fpsEl.style.display = fpsVisible ? 'block' : 'none';
});

function updateFPS(dtMs) {
  fpsCounter++;
  fpsTimer += dtMs;
  if (fpsTimer >= 500) {
    fpsCurrent = Math.round(fpsCounter / (fpsTimer/1000));
    fpsCounter = 0; fpsTimer = 0;
    if (fpsVisible) {
      const el = document.getElementById('fps-display');
      if (el) el.textContent = fpsCurrent + ' FPS';
    }
  }
}

function updateHUD() {
  const hpBar = document.getElementById('bar-health');
  hpBar.style.width = Math.max(0, playerState.hp) + '%';
  hpBar.style.background = playerState.hp>60
    ? 'linear-gradient(90deg,#22cc44,#44ff66)'
    : playerState.hp>30 ? 'linear-gradient(90deg,#ff8800,#ffcc00)'
    : 'linear-gradient(90deg,#cc2200,#ff4400)';
  document.getElementById('bar-armor').style.width = playerState.armor + '%';
  const stamBar = document.getElementById('bar-stamina');
  stamBar.style.width = playerState.stamina + '%';
  stamBar.style.background = playerState.stamina>50 ? 'linear-gradient(90deg,#ffcc00,#ffff00)' : playerState.stamina>20 ? 'linear-gradient(90deg,#ff8800,#ffcc00)' : 'linear-gradient(90deg,#ff2200,#ff8800)';
  document.getElementById('money-display').textContent = '💵 ' + playerState.money.toLocaleString() + ' FCFA';
  updateVignette();
}

function updateWanted() {
  const w = playerState.wanted;
  const el = document.getElementById('wanted');
  el.textContent = '⭐'.repeat(w);
  el.style.color = w>=4?'#ff2222':w>=2?'#ff8800':'#FFD700';
  const ch = document.getElementById('crosshair');
  if(ch) ch.style.color = w>=3?'#ff3333':w>=1?'#ffaa00':'#ffffff';
}

// ── Son ambiant enrichi ───────────────────────────────
let _ambientNode=null, _ambientGain=null, _lastAmbientMode=null;
let _rhythmNodes = [];

function updateAmbientSound(isNight, h) {
  const mode = isNight ? 'night' : 'day';
  if (mode === _lastAmbientMode) return;
  _lastAmbientMode = mode;
  try {
    const ctx = getAudio();
    if (_ambientGain) {
      _ambientGain.gain.linearRampToValueAtTime(0, ctx.currentTime+1.5);
      setTimeout(() => { try{_ambientNode?.stop();}catch(e){} }, 1600);
    }
    _rhythmNodes.forEach(n => { try{n.stop();}catch(e){} });
    _rhythmNodes = [];

    const bufLen = ctx.sampleRate*2;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (isNight) {
      for(let i=0;i<bufLen;i++) data[i] = (Math.random()*2-1)*0.12;
    } else {
      for(let i=0;i<bufLen;i++) data[i] = (Math.random()*2-1)*0.08;
    }
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const flt = ctx.createBiquadFilter();
    flt.type = isNight?'bandpass':'lowpass';
    flt.frequency.value = isNight?4200:320; flt.Q.value = isNight?8:1;
    const gain = ctx.createGain(); gain.gain.value=0;
    gain.gain.linearRampToValueAtTime(isNight?0.18:0.10, ctx.currentTime+2.0);
    src.connect(flt); flt.connect(gain); gain.connect(ctx.destination);
    src.start();
    _ambientNode=src; _ambientGain=gain;

    // Rythme coupé-décalé la nuit
    if (isNight) {
      const bpm = 120, beat = 60/bpm;
      const pattern = [1,0,1,1,0,1,0,1]; // coupé décalé
      for (let i=0; i<16; i++) {
        const step = i % pattern.length;
        if (!pattern[step]) continue;
        const osc = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = step%2===0 ? 120 : 90;
        const t = ctx.currentTime + (i*beat);
        g2.gain.setValueAtTime(0,t); g2.gain.linearRampToValueAtTime(0.08,t+0.02); g2.gain.linearRampToValueAtTime(0,t+beat*0.4);
        osc.connect(g2); g2.connect(ctx.destination);
        osc.start(t); osc.stop(t+beat*0.4);
        _rhythmNodes.push(osc);
      }
    }
  } catch(e) {}
}

function showNotif(msg) {
  const el = document.getElementById('notification');
  el.textContent = msg; el.style.opacity='1';
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.style.opacity='0', 2800);
}

// ══════════════════════════════════════════════════════
//  ZONES & RÉPUTATION
// ══════════════════════════════════════════════════════
const zones = [
  { name:'Plateau',     minX:-110, maxX:-40,  minZ: 50,  maxZ:170 },
  { name:'Cocody',      minX:  40, maxX:120,  minZ: 50,  maxZ:175 },
  { name:'Adjamé',      minX:-115, maxX:-40,  minZ:-150, maxZ:-40 },
  { name:'Yopougon',    minX:  40, maxX:125,  minZ:-150, maxZ:-40 },
  { name:'Treichville', minX:   0, maxX: 50,  minZ:-165, maxZ:-50 },
  { name:'Lagune',      minX:-200, maxX:200,  minZ:-240, maxZ:-170},
];
let lastZone = '';

function checkZone() {
  const px=playerChar.group.position.x, pz=playerChar.group.position.z;
  const z = zones.find(z => px>=z.minX&&px<=z.maxX&&pz>=z.minZ&&pz<=z.maxZ)?.name ?? 'Abidjan';
  if(z !== lastZone) {
    lastZone = z;
    const el = document.getElementById('zone-name');
    el.textContent = '📍 ' + z;
    el.style.opacity = '1';
    const rep = playerState.reputation[z] || 0;
    const repTxt = rep > 50 ? '⭐ Bien connu ici' : rep > 20 ? '😐 Connu' : '👤 Inconnu';
    setTimeout(() => { el.style.opacity='0'; }, 3000);
    showNotif('Bienvenue à ' + z + ' · ' + repTxt);
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
  // Réputation +20 dans la zone actuelle
  if (playerState.reputation[lastZone] !== undefined) playerState.reputation[lastZone] += 20;
  showNotif('✅ Mission réussie! +' + m.reward.toLocaleString() + ' FCFA · Réputation +20 à ' + lastZone);
  updateHUD();
  setTimeout(() => {
    missionState.current = (missionState.current+1) % missions.length;
    activateMission(missionState.current);
  }, 4000);
}

function updateMissions(dtMs) {
  if(!missionState.active) return;
  const m = missions[missionState.current];

  if(m.timerSec > 0) {
    missionState.timer -= dtMs/1000;
    const sec = Math.max(0, Math.ceil(missionState.timer));
    document.getElementById('mission-timer').textContent = '⏱ ' + sec + 's';
    if(missionState.timer <= 0) {
      missionState.active = false;
      showNotif('❌ Mission échouée! Temps écoulé.');
      setTimeout(() => activateMission(missionState.current), 3000);
      return;
    }
  }

  // Mission course (checkpoints séquentiels)
  if (m.type === 'race' && m.targets) {
    const tgt = m.targets[missionState.raceTarget];
    if (tgt) {
      const dx=playerChar.group.position.x-tgt.x, dz=playerChar.group.position.z-tgt.z;
      if(Math.sqrt(dx*dx+dz*dz)<4) {
        missionState.raceTarget++;
        if(missionState.raceTarget >= m.targets.length) { completeMission(); return; }
        const next = m.targets[missionState.raceTarget];
        targetDisc.position.set(next.x,0.08,next.z);
        markerCone.position.set(next.x,4.5,next.z);
        showNotif('✅ Checkpoint ' + missionState.raceTarget + '/' + m.targets.length + ' atteint!');
      }
    }
    return;
  }

  if(m.target) {
    const dx=playerChar.group.position.x-m.target.x, dz=playerChar.group.position.z-m.target.z;
    if(Math.sqrt(dx*dx+dz*dz)<3) {
      if(m.type==='heist')   { playerState.wanted=Math.min(5,playerState.wanted+2); updateWanted(); completeMission(); }
      if(m.type==='escape')  { playerState.wanted=Math.max(0,playerState.wanted-3); updateWanted(); completeMission(); }
      if(m.type==='vehicle'&&playerState.inVehicle) completeMission();
      if(m.type==='night_deal') {
        if(gameTime.minutes>22*60) completeMission();
        else showNotif('Reviens après 22h!');
      }
    }
  }
}

// ══════════════════════════════════════════════════════
//  MINIMAP AMÉLIORÉE
// ══════════════════════════════════════════════════════
const mmCanvas = document.getElementById('minimapCanvas');
const mmCtx = mmCanvas.getContext('2d');
const NPC_COLORS = { civil:'#aaaaaa', gang:'#ff3333', police:'#4488ff', dealer:'#aa44ff', braqueur:'#ff8800' };
let minimapBlink = 0;

function drawMinimap() {
  minimapBlink += 0.08;
  const W2=140, H2=140, cx=70, cy=70, sc=0.38;
  mmCtx.clearRect(0,0,W2,H2);

  mmCtx.fillStyle='rgba(8,20,8,0.94)';
  mmCtx.beginPath(); mmCtx.arc(cx,cy,70,0,Math.PI*2); mmCtx.fill();

  mmCtx.strokeStyle='rgba(255,255,255,0.04)'; mmCtx.lineWidth=1;
  for(let i=0;i<W2;i+=14){ mmCtx.beginPath();mmCtx.moveTo(i,0);mmCtx.lineTo(i,H2);mmCtx.stroke(); }
  for(let i=0;i<H2;i+=14){ mmCtx.beginPath();mmCtx.moveTo(0,i);mmCtx.lineTo(W2,i);mmCtx.stroke(); }

  mmCtx.strokeStyle='#444'; mmCtx.lineWidth=5;
  mmCtx.beginPath(); mmCtx.moveTo(cx,0); mmCtx.lineTo(cx,H2); mmCtx.stroke();
  mmCtx.beginPath(); mmCtx.moveTo(0,cy); mmCtx.lineTo(W2,cy); mmCtx.stroke();
  mmCtx.strokeStyle='#333'; mmCtx.lineWidth=3;
  const ox=cx-playerChar.group.position.x*sc, oz=cy-playerChar.group.position.z*sc;
  mmCtx.beginPath();mmCtx.moveTo(ox+35*sc,0);mmCtx.lineTo(ox+35*sc,H2);mmCtx.stroke();
  mmCtx.beginPath();mmCtx.moveTo(ox-35*sc,0);mmCtx.lineTo(ox-35*sc,H2);mmCtx.stroke();

  // Lagune
  mmCtx.fillStyle='#1a5fa5';
  const laguneY=cy+(-200-playerChar.group.position.z)*sc-16;
  mmCtx.fillRect(0,laguneY,W2,28);

  // Bâtiments
  buildings.forEach(b => {
    const bx=cx+(b.x-playerChar.group.position.x)*sc;
    const bz=cy+(b.z-playerChar.group.position.z)*sc;
    mmCtx.fillStyle='rgba(100,120,140,0.6)';
    mmCtx.fillRect(bx-Math.max(2,b.w*sc*0.5)/2, bz-Math.max(2,b.d*sc*0.5)/2, Math.max(2,b.w*sc*0.5), Math.max(2,b.d*sc*0.5));
  });

  // NPCs — triangle clignotant si chase
  npcList.forEach(npc => {
    const nx=cx+(npc.group.position.x-playerChar.group.position.x)*sc;
    const nz=cy+(npc.group.position.z-playerChar.group.position.z)*sc;
    if (npc.npc.state==='dead') { mmCtx.fillStyle='#333'; }
    else {
      const outfit=npc.group.userData.outfit??'civil';
      mmCtx.fillStyle = NPC_COLORS[outfit]??'#ffffff';
      if (npc.npc.state==='chase') {
        // Clignotement rouge
        mmCtx.fillStyle = `rgba(255,50,50,${0.5+Math.abs(Math.sin(minimapBlink*2))*0.5})`;
      }
    }
    mmCtx.beginPath();
    if (npc.npc.state==='chase') {
      mmCtx.moveTo(nx,nz-5); mmCtx.lineTo(nx+4,nz+4); mmCtx.lineTo(nx-4,nz+4);
      mmCtx.closePath();
    } else { mmCtx.arc(nx,nz,2.5,0,Math.PI*2); }
    mmCtx.fill();
  });

  // Véhicules (bleu = joueur)
  vehicleList.forEach(v => {
    const vx=cx+(v.position.x-playerChar.group.position.x)*sc;
    const vz=cy+(v.position.z-playerChar.group.position.z)*sc;
    mmCtx.fillStyle=playerState.inVehicle&&v===playerState.currentVehicle?'#00ff88':'#4488ff';
    mmCtx.fillRect(vx-2.5,vz-1.5,5,3);
  });

  // Loot (jaune)
  lootItems.forEach(item => {
    const ix=cx+(item.position.x-playerChar.group.position.x)*sc;
    const iz=cy+(item.position.z-playerChar.group.position.z)*sc;
    mmCtx.fillStyle='#FFD700';
    mmCtx.beginPath(); mmCtx.arc(ix,iz,2,0,Math.PI*2); mmCtx.fill();
  });

  // Mission target — étoile + flèche directionnelle si hors minimap
  if(targetDisc.visible) {
    const tx=cx+(targetDisc.position.x-playerChar.group.position.x)*sc;
    const tz=cy+(targetDisc.position.z-playerChar.group.position.z)*sc;
    const mmRadius = 62;
    const distFromCenter = Math.sqrt((tx-cx)**2+(tz-cy)**2);

    if (distFromCenter > mmRadius) {
      // Cible hors minimap : flèche directionnelle sur le bord
      const angle = Math.atan2(tz-cy, tx-cx);
      const arrowX = cx + Math.cos(angle)*(mmRadius-8);
      const arrowZ = cy + Math.sin(angle)*(mmRadius-8);
      // Fond de flèche
      mmCtx.save();
      mmCtx.translate(arrowX, arrowZ);
      mmCtx.rotate(angle + Math.PI/2);
      // Clignotement
      const blink = 0.6 + Math.abs(Math.sin(minimapBlink*3))*0.4;
      mmCtx.fillStyle = `rgba(255,80,0,${blink})`;
      mmCtx.strokeStyle = '#fff';
      mmCtx.lineWidth = 1;
      // Triangle (flèche)
      mmCtx.beginPath();
      mmCtx.moveTo(0, -8); mmCtx.lineTo(5, 4); mmCtx.lineTo(-5, 4);
      mmCtx.closePath(); mmCtx.fill(); mmCtx.stroke();
      // Cercle de fond
      mmCtx.beginPath(); mmCtx.arc(0, 4, 7, 0, Math.PI*2);
      mmCtx.fillStyle = `rgba(255,50,0,${blink*0.5})`; mmCtx.fill();
      mmCtx.restore();
      // Distance en texte
      const realDist = Math.round(Math.sqrt(
        (targetDisc.position.x-playerChar.group.position.x)**2 +
        (targetDisc.position.z-playerChar.group.position.z)**2
      ));
      mmCtx.font = 'bold 8px Arial';
      mmCtx.fillStyle = '#ff8844';
      mmCtx.textAlign = 'center';
      mmCtx.fillText(realDist+'m', arrowX, arrowZ + 18);
      mmCtx.textAlign = 'left';
    } else {
      // Cible visible : étoile animée
      mmCtx.save();
      const starPulse = 5 + Math.abs(Math.sin(minimapBlink*4))*3;
      mmCtx.translate(tx, tz);
      mmCtx.fillStyle = `rgba(255,60,0,${0.7+Math.abs(Math.sin(minimapBlink*3))*0.3})`;
      mmCtx.strokeStyle = '#ffff00';
      mmCtx.lineWidth = 1;
      mmCtx.beginPath();
      for(let i=0;i<5;i++){
        const a=(i*4+1)*Math.PI/5-Math.PI/2;
        const r=i%2===0?starPulse:starPulse*0.4;
        mmCtx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      }
      mmCtx.closePath(); mmCtx.fill(); mmCtx.stroke();
      mmCtx.restore();
    }
  }

  // Joueur
  mmCtx.save(); mmCtx.translate(cx,cy); mmCtx.rotate(-camAngleH);
  mmCtx.fillStyle='#00ff88'; mmCtx.strokeStyle='#fff'; mmCtx.lineWidth=1;
  mmCtx.beginPath(); mmCtx.moveTo(0,-8); mmCtx.lineTo(5,6); mmCtx.lineTo(-5,6);
  mmCtx.closePath(); mmCtx.fill(); mmCtx.stroke(); mmCtx.restore();

  mmCtx.globalCompositeOperation='destination-in';
  mmCtx.beginPath(); mmCtx.arc(cx,cy,68,0,Math.PI*2); mmCtx.fill();
  mmCtx.globalCompositeOperation='source-over';
  mmCtx.strokeStyle='rgba(255,200,0,0.3)'; mmCtx.lineWidth=1;
  mmCtx.beginPath(); mmCtx.arc(cx,cy,67,0,Math.PI*2); mmCtx.stroke();
}

// ══════════════════════════════════════════════════════
//  FRUSTUM CULLING MANUEL
// ══════════════════════════════════════════════════════
function updateFrustumCulling() {
  const camPos = camera.position;
  buildings.forEach(b => {
    const d = Math.sqrt((b.x-camPos.x)**2 + (b.z-camPos.z)**2);
    b.mesh.visible = d < 180;
  });
  // Cull NPCs far away
  npcList.forEach(npc => {
    if (npc.npc.state === 'dead') return;
    const d = npc.group.position.distanceTo(camPos);
    npc.group.visible = d < 120;
  });
}

// ══════════════════════════════════════════════════════
//  BOUCLE PRINCIPALE
// ══════════════════════════════════════════════════════
let lastTime = 0, markerPhase = 0;
const _camTarget = new THREE.Vector3();
let klaxonTimer = 0;

function animate(now = 0) {
  requestAnimationFrame(animate);
  if (isPaused) { renderer.render(scene, camera); return; }
  if (playerState.dead) { renderer.render(scene, camera); return; }

  const dtMs  = Math.min(now - lastTime, 50);
  const dtSec = dtMs / 1000;
  lastTime = now;

  updateFPS(dtMs);

  // Rechargement
  if (playerState.isReloading) {
    playerState.reloadTimer -= dtMs;
    if (playerState.reloadTimer <= 0) finishReload();
  }

  // ── Mouvement joueur / véhicule ──
  _v1.set(Math.sin(camAngleH), 0, Math.cos(camAngleH));
  _v2.set(Math.cos(camAngleH), 0, -Math.sin(camAngleH));
  const fwd = _v1, right = _v2;
  const isMoving = keys.up||keys.down||keys.left||keys.right||Math.abs(joyX)>0.2||Math.abs(joyY)>0.2;
  isSprinting = (keys.sprint||sprintToggle) && isMoving && !playerState.inVehicle;

  if(playerState.inVehicle && playerState.currentVehicle) {
    const v=playerState.currentVehicle, d=v.userData;
    if(keys.up||joyY<-0.22)   d.accel=1;
    else if(keys.down||joyY>0.22) d.accel=-0.6;
    else d.accel=0;
    if(keys.left ||joyX<-0.22)  d.steer= 1;
    else if(keys.right||joyX>0.22) d.steer=-1;
    else d.steer=0;

    d.speed += d.accel*d.accelRate; d.speed*=d.friction;
    d.speed = Math.max(-d.maxSpeed*0.5, Math.min(d.maxSpeed, d.speed));
    if(Math.abs(d.speed)>0.001) v.rotation.y += d.steer*d.steerSpeed*(d.speed/d.maxSpeed);

    // Inclinaison dans les virages
    v.rotation.z = -d.steer * d.speed * 4;

    d.wheelAngle += d.speed*3;
    d.wheels?.forEach(w => { w.rotation.x = d.wheelAngle; });

    const prevPos = v.position.clone();
    v.position.x += Math.sin(v.rotation.y)*d.speed;
    v.position.z += Math.cos(v.rotation.y)*d.speed;
    checkBuildingCollision(v.position, 2.0);
    checkVehicleCollision(v.position, v, 2.2);
    clampWorld(v.position);
    playerChar.group.position.copy(v.position); playerChar.group.position.y=0;
    playerChar.group.rotation.y = v.rotation.y;
  } else {
    const spd = isSprinting&&playerState.stamina>0 ? 0.16 : 0.10;
    if(keys.up   ||joyY<-0.28) playerChar.group.position.addScaledVector(fwd,  spd);
    if(keys.down ||joyY> 0.28) playerChar.group.position.addScaledVector(fwd, -spd*0.7);
    if(keys.left ||joyX<-0.28) playerChar.group.position.addScaledVector(right,-spd*0.8);
    if(keys.right||joyX> 0.28) playerChar.group.position.addScaledVector(right, spd*0.8);
    checkBuildingCollision(playerChar.group.position, 0.45);
    checkVehicleCollision(playerChar.group.position, null, 0.5);
    clampWorld(playerChar.group.position);
    if(isMoving) {
      let ta = camAngleH;
      // Direction combinée joystick (8 directions)
      if(Math.abs(joyX)>0.28 || Math.abs(joyY)>0.28) {
        ta = camAngleH + Math.atan2(joyX, -joyY);
      } else if(keys.up)    { ta = camAngleH; }
      else if(keys.down)    { ta = camAngleH + Math.PI; }
      else if(keys.left)    { ta = camAngleH - Math.PI/2; }
      else if(keys.right)   { ta = camAngleH + Math.PI/2; }
      playerChar.group.rotation.y += (ta - playerChar.group.rotation.y) * 0.18;
    }
    if(!playerState.isGrounded) {
      playerState.velocityY -= 0.018;
      playerChar.group.position.y += playerState.velocityY;
      if(playerChar.group.position.y<=0) { playerChar.group.position.y=0; playerState.velocityY=0; playerState.isGrounded=true; }
    }
    if(keys.jump&&playerState.isGrounded) { playerState.velocityY=0.22; playerState.isGrounded=false; }
    if(isSprinting) playerState.stamina=Math.max(0,playerState.stamina-8*dtSec);
    else            playerState.stamina=Math.min(100,playerState.stamina+15*dtSec);
  }

  // Wanted decay
  if(playerState.wantedCooldown>0) {
    playerState.wantedCooldown -= dtSec;
    if(playerState.wantedCooldown<=0 && playerState.wanted>0) {
      playerState.wanted = Math.max(0, playerState.wanted-1);
      updateWanted();
      if(playerState.wanted>0) playerState.wantedCooldown=10;
    }
  }

  // ── Animation personnage ──
  if(!playerState.inVehicle) {
    if(keys.crouch&&!isSprinting) playerChar.setAnim(isMoving?'crouch_walk':'crouch');
    else if(isSprinting)          playerChar.setAnim('run');
    else if(isMoving)             playerChar.setAnim('walk');
    else if(keys.shoot)           playerChar.setAnim('shoot');
    else                          playerChar.setAnim('idle');
  }
  playerChar.update(dtMs);

  // Tir continu
  if(keys.shoot&&!playerState.inVehicle&&!playerState.dead) {
    if(!playerChar._shootCooldown||now>playerChar._shootCooldown) {
      fireBullet();
      playerChar._shootCooldown = now+(playerState.weapon==='ak47'?150:400);
    }
  }

  // ── Balles ──
  for(let i=bullets.length-1;i>=0;i--) {
    const b=bullets[i];
    b.position.addScaledVector(b.userData.vel,1);
    b.userData.life--;
    if(b.userData.life<=0) { releaseBullet(b); bullets.splice(i,1); }
  }

  // ── Particules ──
  updateParticles();

  // ── Loot ──
  if(!playerState.inVehicle) checkLootPickup();
  const lootBob=Math.sin(now*0.003)*0.1+0.4;
  lootItems.forEach(item => { item.position.y=lootBob; item.rotation.y+=0.04; });

  // ── NPCs IA ──
  npcList.forEach((npc, ni) => {
    if(npc.npc.state==='dead') { npc.update(dtMs); return; }
    npc.npc.timer += dtMs;
    const dist = npc.group.position.distanceTo(playerChar.group.position);

    // Alerte selon wanted
    if(dist<npc.npc.alertRadius && playerState.wanted>=1 &&
      (npc.group.userData.outfit==='police'||npc.group.userData.outfit==='gang')) {
      npc.npc.state='chase';
    }
    if(dist<5&&npc.npc.state==='patrol') npc.npc.state='flee';

    // Séparation NPC
    npcList.forEach((other,oi) => {
      if(oi===ni||other.npc.state==='dead') return;
      const sep=npc.group.position.distanceTo(other.group.position);
      if(sep<1.2&&sep>0.01) {
        _v3.copy(npc.group.position).sub(other.group.position).normalize().multiplyScalar(0.04);
        npc.group.position.add(_v3);
      }
    });

    // Idle talk entre civils proches
    if(npc.group.userData.outfit==='civil' && npc.npc.state==='patrol') {
      npc.npc.idleTalkTimer -= dtMs;
      if(npc.npc.idleTalkTimer <= 0) {
        npc.npc.idleTalkTimer = 4000 + Math.random()*5000;
        // Oscillation tête
        const head = npc.group.getObjectByName?.('head');
        if(head) {
          const origY = head.rotation.y;
          let t2 = 0;
          const anim = setInterval(() => {
            t2 += 100; head.rotation.y = Math.sin(t2*0.01)*0.3;
            if(t2 > 1500) { head.rotation.y=origY; clearInterval(anim); }
          }, 100);
        }
      }
    }

    if(npc.npc.state==='patrol') {
      npc.npc.walkAngle += npc.npc.speed*0.02;
      npc.group.position.x=npc.npc.walkCenter.x+Math.cos(npc.npc.walkAngle)*npc.npc.walkRadius;
      npc.group.position.z=npc.npc.walkCenter.z+Math.sin(npc.npc.walkAngle)*npc.npc.walkRadius;
      npc.group.rotation.y=-npc.npc.walkAngle-Math.PI/2;
      npc.setAnim('walk');
    } else if(npc.npc.state==='flee') {
      _v3.copy(npc.group.position).sub(playerChar.group.position).normalize();
      npc.group.position.addScaledVector(_v3, npc.npc.speed*2.5);
      npc.group.rotation.y=Math.atan2(_v3.x,_v3.z);
      clampWorld(npc.group.position); npc.setAnim('run');
    } else if(npc.npc.state==='chase') {
      // Police : tente de se poster DEVANT le joueur (embuscade)
      if(npc.group.userData.outfit==='police' && dist > 6) {
        const playerFwd = new THREE.Vector3(Math.sin(playerChar.group.rotation.y),0,Math.cos(playerChar.group.rotation.y));
        const ambushTarget = playerChar.group.position.clone().addScaledVector(playerFwd, 8);
        _v3.copy(ambushTarget).sub(npc.group.position).normalize();
      } else {
        _v3.copy(playerChar.group.position).sub(npc.group.position).normalize();
      }
      npc.group.position.addScaledVector(_v3, npc.npc.speed*1.8);
      npc.group.rotation.y=Math.atan2(_v3.x,_v3.z);
      clampWorld(npc.group.position); npc.setAnim('shoot');
      npcShootPlayer(npc, now);
    } else if(npc.npc.state==='idle') {
      npc.setAnim('idle');
    }
    npc.update(dtMs);
  });

  // ── Trafic IA + klaxons + inclinaison ──
  klaxonTimer += dtMs;
  vehicleList.forEach((v, i) => {
    if(playerState.inVehicle&&v===playerState.currentVehicle) return;
    const d = v.userData; if(d.aiMode!=='traffic') return;

    // Klaxon aléatoire
    if(klaxonTimer > 8000+i*3000 && Math.random()<0.02) {
      playKlaxon(); klaxonTimer=0;
    }

d.aiTimer += dtMs;
    if(!d.aiTarget || d.aiTimer > (5000 + i*600)) {
      d.aiTimer = 0;
      const px = v.position.x, pz = v.position.z;

      // Déterminer sur quelle route est le véhicule
      let routeNodes;
      if(Math.abs(px) < 12) {
        // Axe central nord-sud
        const lane = (i % 2 === 0) ? 2.5 : -2.5;
        routeNodes = [
          {x:lane,z:160},{x:lane,z:90},{x:lane,z:40},
          {x:lane,z:0},{x:lane,z:-40},{x:lane,z:-90},{x:lane,z:-150},
        ];
      } else if(Math.abs(px - 70) < 12) {
        // Route x=70 (Cocody / Yopougon)
        const lane = (i % 2 === 0) ? 67.5 : 72.5;
        routeNodes = [
          {x:lane,z:130},{x:lane,z:70},{x:lane,z:20},
          {x:lane,z:-20},{x:lane,z:-80},{x:lane,z:-130},
        ];
      } else if(Math.abs(px + 70) < 12) {
        // Route x=-70 (Plateau / Adjamé)
        const lane = (i % 2 === 0) ? -67.5 : -72.5;
        routeNodes = [
          {x:lane,z:130},{x:lane,z:70},{x:lane,z:20},
          {x:lane,z:-20},{x:lane,z:-80},{x:lane,z:-130},
        ];
      } else if(Math.abs(pz) < 12) {
        // Boulevard est-ouest
        const lane = (i % 2 === 0) ? 2.5 : -2.5;
        routeNodes = [
          {x:-150,z:lane},{x:-80,z:lane},{x:-20,z:lane},
          {x:20,z:lane},{x:80,z:lane},{x:150,z:lane},
        ];
      } else {
        // Véhicule hors route : le ramener vers l'axe central
        routeNodes = [{x:2,z:0},{x:-2,z:0},{x:2,z:40},{x:-2,z:-40}];
      }

      // Préférer un nœud devant le véhicule pour éviter les demi-tours
      const fwdX = Math.sin(v.rotation.y), fwdZ = Math.cos(v.rotation.y);
      const ahead = routeNodes.filter(n =>
        (n.x - px) * fwdX + (n.z - pz) * fwdZ > 10
      );
      const pool = ahead.length > 0 ? ahead : routeNodes;
      d.aiTarget = pool[Math.floor(Math.random() * pool.length)];
    }

    if(d.aiTarget) {
      const tx = d.aiTarget.x, tz = d.aiTarget.z;
      const dx2 = tx - v.position.x, dz2 = tz - v.position.z;
      const distToTarget = Math.sqrt(dx2*dx2 + dz2*dz2);
      if(distToTarget < 8) { d.aiTarget = null; return; }
      const targetAngle = Math.atan2(dx2, dz2);
      let angleDiff = targetAngle - v.rotation.y;
      while(angleDiff >  Math.PI) angleDiff -= Math.PI*2;
      while(angleDiff < -Math.PI) angleDiff += Math.PI*2;
      v.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), d.steerSpeed);
      v.rotation.z = THREE.MathUtils.lerp(v.rotation.z, -angleDiff * 0.15, 0.1);
      const turnFactor = 1 - Math.abs(angleDiff) / Math.PI * 0.7;
      const targetSpeed = d.maxSpeed * Math.max(0.3, turnFactor);
      if(d.speed < targetSpeed) d.speed += d.accelRate; else d.speed *= 0.98;
      const dPlayer = v.position.distanceTo(playerChar.group.position);
      if(dPlayer < 5 && !playerState.inVehicle) { d.speed *= 0.85; if(dPlayer < 2.5) d.speed = -0.03; }
      const prevPos = v.position.clone();
      v.position.x += Math.sin(v.rotation.y) * d.speed;
      v.position.z += Math.cos(v.rotation.y) * d.speed;
      d.wheelAngle += d.speed * 3;
      d.wheels?.forEach(w => { w.rotation.x = d.wheelAngle; });
      checkBuildingCollision(v.position, 2.0); checkVehicleCollision(v.position, v, 2.2); clampWorld(v.position);
      if(v.position.distanceTo(prevPos) < 0.001 && d.speed > 0.02) { d.aiTarget = null; d.speed *= 0.5; }
    }
  });
  // ── Marqueur mission ──
  markerPhase += dtSec*2;
  markerCone.position.y=4.5+Math.sin(markerPhase)*0.5;
  markerCone.rotation.y=markerPhase*0.6;
  targetDisc.rotation.y=markerPhase*0.3;

  // ── Caméra ──
  const camDist   = playerState.inVehicle?11:8;
  const camHeight = playerState.inVehicle?5.5:5;
  _camTarget.set(
    playerChar.group.position.x-Math.sin(camAngleH)*camDist,
    playerChar.group.position.y+camHeight,
    playerChar.group.position.z-Math.cos(camAngleH)*camDist
  );
  camera.position.lerp(_camTarget, 0.10);
  camera.lookAt(playerChar.group.position.x, playerChar.group.position.y+1.2, playerChar.group.position.z);

  // Frustum culling (tous les 10 frames)
  if (Math.floor(now/16) % 6 === 0) updateFrustumCulling();

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
    const start=performance.now();
    function step(now) {
      const t=Math.min((now-start)/durationMs,1);
      loadBar.style.width = (fromPct+(toPct-fromPct)*t)+'%';
      if(t<1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });
}

async function startGame() {
  try {
    if(loadMsg) loadMsg.textContent='Construction du monde...';
    await animateBar(0, 40, 400);
    if(loadMsg) loadMsg.textContent='Compilation des shaders...';
    renderer.render(scene, camera);
    await animateBar(40, 75, 350);
    if(loadMsg) loadMsg.textContent='Initialisation du HUD...';
    updateHUD(); updateWanted(); switchWeapon('pistol'); activateMission(0);
    // Loot centre départ
    spawnLoot( 8,  15, 'ammo_pistol'); spawnLoot(-8,  20, 'health');
    spawnLoot( 5,  -8, 'armor');       spawnLoot(-5,  -5, 'money');
    // Loot dans les quartiers
    spawnLoot(-70,  90, 'ammo_ak47'); spawnLoot(70,  90, 'money');
    spawnLoot(-70, -80, 'armor');     spawnLoot(70, -80, 'ammo_pistol');
    spawnLoot( 20, -90, 'health');
    await animateBar(75, 100, 300);
    const loading=document.getElementById('loading');
    if(loading) { loading.style.opacity='0'; setTimeout(()=>loading.remove(),800); }
    document.getElementById('crosshair').style.display='block';

    // Affiche le niveau de performance
    const perfBadge = document.createElement('div');
    perfBadge.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#FFD700;font-size:13px;text-align:center;pointer-events:none;z-index:1;opacity:0;transition:opacity .5s;';
    perfBadge.textContent = '⚡ Mode performance: ' + perfLevel.toUpperCase();
    document.body.appendChild(perfBadge);
    setTimeout(()=>{ perfBadge.style.opacity='1'; setTimeout(()=>{ perfBadge.style.opacity='0'; setTimeout(()=>perfBadge.remove(),600); },2500); },900);

    animate();
  } catch(err) {
    console.error('Erreur:', err);
    if(loadMsg) loadMsg.textContent='Erreur : '+err.message;
  }
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', startGame);
else startGame();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
});
