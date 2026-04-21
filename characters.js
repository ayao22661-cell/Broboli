import * as THREE from 'https://unpkg.com/three@0.163.0/build/three.module.js';

/* ═══════════════════════════════════════════════════════════════
   CHARACTERS.JS — GTA Abidjan v4 — Design & Code complet
   ─────────────────────────────────────────────────────────────
   Nouveautés v3 :
   - Cache de matériaux partagés (réduit les draw calls)
   - Yeux avec émission lumineuse (plus vivants)
   - Animation 'crouch' ajoutée
   - Animation 'die' : freeze correct APRÈS la chute (1 sec)
   - resetBones() bloqué quand dead=true
   - update() court-circuité après mort complète
   - revive() pour respawn propre + isDead() exposé
   - attachWeapon() avec offsets par type d'arme
   - buildWeapon() exporté, buildNPC() npc.takeDamage() intégré

   Nouveautés v4 :
   - Animation 'hit'    : recul brusque + retour auto à l'anim précédente
   - Animation 'crouch_walk' : marche accroupie furtive
   - Animation 'swim'   : nage crawl complète
   - Système de BLEND   : transition douce entre toutes les animations
   - triggerHit()       : API publique de recul de dégâts
   - LOD (CharacterLOD) : high/med/low/culled selon distance caméra
   - Sons positionnels  : CharacterAudio (Web Audio API, synthétique)
     Sons : step, run_step, crouch_step, hit, shoot, die, swim_splash
   - receiveShadow sur toutes les chaussures/semelles
   - Masque à gaz tactique complet pour le braqueur
   - npc.takeDamage() déclenche triggerHit() automatiquement
   ═══════════════════════════════════════════════════════════════ */

// ── Palettes skin ─────────────────────────────────────────────────
const SKIN = {
  dark:   0x2C1508,   // ébène profond
  medium: 0x5C2E10,   // brun chaud
  light:  0x8B5E3C,   // brun clair
};

// ── Cache matériaux (réduit les draw calls) ───────────────────────
const _matCache = new Map();
function mat(color, roughness = 0.8, metalness = 0.05) {
  const key = `${color}_${roughness}_${metalness}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }
  return _matCache.get(key);
}
function matEmissive(color, emissive, intensity = 0.3) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.6 });
}
/** Vide le cache de matériaux (ex: changement de scène) */
export function clearMaterialCache() { _matCache.clear(); }

// ── Géométries ────────────────────────────────────────────────────
const GEO = {
  // Tête légèrement ovale (plus haute que large)
  head:     () => new THREE.SphereGeometry(0.23, 14, 12),
  neck:     () => new THREE.CylinderGeometry(0.085, 0.095, 0.16, 8),
  // Torse : cylindre tronqué (épaules arrondies, plus naturel)
  torsoUp:  () => new THREE.CylinderGeometry(0.24, 0.20, 0.32, 10),   // buste haut
  torsoLow: () => new THREE.CylinderGeometry(0.20, 0.18, 0.28, 10),   // buste bas
  // Épaules
  shoulder: () => new THREE.SphereGeometry(0.10, 8, 6),
  // Bassin plus large
  pelvis:   () => new THREE.CylinderGeometry(0.20, 0.18, 0.22, 10),
  // Bras
  upperArm: () => new THREE.CylinderGeometry(0.075, 0.065, 0.34, 8),
  foreArm:  () => new THREE.CylinderGeometry(0.060, 0.052, 0.30, 8),
  // Main : sphère aplatie (poing arrondi)
  hand:     () => new THREE.SphereGeometry(0.07, 8, 6),
  // Jambes
  thigh:    () => new THREE.CylinderGeometry(0.105, 0.090, 0.44, 8),
  shin:     () => new THREE.CylinderGeometry(0.080, 0.068, 0.38, 8),
  // Pied avec forme
  footMain: () => new THREE.BoxGeometry(0.13, 0.06, 0.22),
  footHeel: () => new THREE.BoxGeometry(0.11, 0.05, 0.08),
  // Semelle
  sole:     () => new THREE.BoxGeometry(0.135, 0.022, 0.24),
  // Ceinture
  belt:     () => new THREE.CylinderGeometry(0.205, 0.195, 0.035, 10),
};

/* ══════════════════════════════════════════════════════════════════
   CONSTRUCTEUR PRINCIPAL
══════════════════════════════════════════════════════════════════ */
export function buildCharacter(skinTone = 'dark', outfit = 'street') {

  const skinColor = SKIN[skinTone] ?? SKIN.dark;
  const skinMat   = mat(skinColor, 0.88);

  /* ── Palettes tenues ── */
  const OUTFITS = {
    street:   { shirt: 0x0d0d1a, pants: 0x1a1a2a, shoes: 0x0a0a0a, belt: 0x222222, accent: 0xFF4400 },
    gang:     { shirt: 0x7a0000, pants: 0x111111, shoes: 0x1a1000, belt: 0x1a0000, accent: 0xff2222 },
    police:   { shirt: 0x1B2A6B, pants: 0x162058, shoes: 0x080808, belt: 0x111111, accent: 0xffd700 },
    dealer:   { shirt: 0x1a3a10, pants: 0x2a2a00, shoes: 0x120800, belt: 0x1a1a00, accent: 0x44ff44 },
    braqueur: { shirt: 0x0a0a0a, pants: 0x0a0a0a, shoes: 0x050505, belt: 0x111111, accent: 0x333333 },
    civil:    { shirt: 0xCC7722, pants: 0x2a3545, shoes: 0x2a1500, belt: 0x1a0e00, accent: 0xffcc88 },
  };
  const C = OUTFITS[outfit] ?? OUTFITS.street;

  const shirtMat = mat(C.shirt, 0.85);
  const pantsMat = mat(C.pants, 0.85);
  const shoesMat = mat(C.shoes, 0.6);
  const beltMat  = mat(C.belt,  0.5, 0.2);
  const soleMat  = mat(0x1a1a1a, 0.9);

  const group = new THREE.Group();

  // ── BASSIN ──
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.56, 0);
  group.add(pelvis);
  const pelvisMesh = new THREE.Mesh(GEO.pelvis(), pantsMat);
  pelvisMesh.castShadow = true;
  pelvis.add(pelvisMesh);

  // Ceinture (sur tous les personnages)
  const beltMesh = new THREE.Mesh(GEO.belt(), beltMat);
  beltMesh.position.y = 0.13;
  pelvis.add(beltMesh);
  // Boucle de ceinture
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.015), mat(0xbbaa00, 0.3, 0.8));
  buckle.position.set(0, 0.13, 0.20);
  pelvis.add(buckle);

  // ── TORSE (deux parties pour plus de volume) ──
  const torso = new THREE.Group();
  torso.position.set(0, 0.21, 0);
  pelvis.add(torso);

  const torsoLowMesh = new THREE.Mesh(GEO.torsoLow(), shirtMat);
  torsoLowMesh.position.y = 0;
  torsoLowMesh.castShadow = true;
  torso.add(torsoLowMesh);

  const torsoUpMesh = new THREE.Mesh(GEO.torsoUp(), shirtMat);
  torsoUpMesh.position.y = 0.28;
  torsoUpMesh.castShadow = true;
  torso.add(torsoUpMesh);

  // ── COU ──
  const neck = new THREE.Group();
  neck.position.set(0, 0.46, 0);
  torso.add(neck);
  const neckMesh = new THREE.Mesh(GEO.neck(), skinMat);
  neckMesh.castShadow = true;
  neck.add(neckMesh);

  // ── TÊTE ──
  const head = new THREE.Group();
  head.position.set(0, 0.22, 0);
  neck.add(head);
  const headMesh = new THREE.Mesh(GEO.head(), skinMat);
  headMesh.castShadow = true;
  head.add(headMesh);

  // ── VISAGE ──

  // Yeux (blanc + pupille + iris coloré + lueur émissive)
  const eyeWhiteMat = mat(0xf0f0f0, 1.0);
  const pupilMat    = mat(0x0a0a0a, 1.0);
  const irisMat     = mat(0x2a1800, 0.9);
  const eyeGlowMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 1.0 });
  [-0.085, 0.085].forEach(ex => {
    // Blanc de l'œil
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), eyeWhiteMat);
    ew.position.set(ex, 0.055, 0.195);
    headMesh.add(ew);
    // Iris
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.024, 7, 5), irisMat);
    iris.position.set(ex, 0.055, 0.212);
    headMesh.add(iris);
    // Pupille
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), pupilMat);
    pupil.position.set(ex, 0.055, 0.222);
    headMesh.add(pupil);
    // Reflet lumineux (émissif)
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.005, 4, 4), eyeGlowMat);
    shine.position.set(ex + 0.008, 0.062, 0.226);
    headMesh.add(shine);
  });

  // Sourcils (barre sombre inclinée)
  const browMat = mat(0x0a0505, 0.9);
  [-0.085, 0.085].forEach((ex, i) => {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.01), browMat);
    brow.position.set(ex, 0.098, 0.200);
    brow.rotation.z = i === 0 ? 0.12 : -0.12;
    headMesh.add(brow);
  });

  // Nez (plus proéminent, africain)
  const noseBridge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.055, 6), skinMat);
  noseBridge.rotation.x = Math.PI / 2;
  noseBridge.position.set(0, 0.012, 0.210);
  headMesh.add(noseBridge);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 5), skinMat);
  noseTip.position.set(0, -0.015, 0.223);
  noseTip.scale.set(1.2, 0.8, 0.9);
  headMesh.add(noseTip);
  // Narines
  [-0.016, 0.016].forEach(nx => {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.009, 5, 4), mat(skinColor * 0.7, 0.9));
    nostril.position.set(nx, -0.020, 0.225);
    headMesh.add(nostril);
  });

  // Bouche (lèvres avec volume)
  const lipColor = skinColor < 0x4a2000 ? 0x4a1a1a : 0x6b2e1a;
  const lipUpperMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.018, 0.012), mat(lipColor));
  lipUpperMesh.position.set(0, -0.065, 0.217);
  lipUpperMesh.scale.set(1, 1, 1);
  headMesh.add(lipUpperMesh);
  const lipLowerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.014), mat(lipColor));
  lipLowerMesh.position.set(0, -0.088, 0.215);
  headMesh.add(lipLowerMesh);

  // Oreilles (forme plus réaliste)
  [-0.225, 0.225].forEach((ex, side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.042, 7, 5), skinMat);
    ear.scale.set(0.45, 1.1, 0.6);
    ear.position.set(ex, 0.01, 0.01);
    headMesh.add(ear);
  });

  // ── CHEVEUX variés selon outfit ──
  addHair(headMesh, outfit, skinColor);

  // ── ÉPAULES (sphères aux articulations) ──
  const lShBall = new THREE.Mesh(GEO.shoulder(), shirtMat);
  lShBall.position.set(-0.255, 0.43, 0);
  torso.add(lShBall);
  const rShBall = new THREE.Mesh(GEO.shoulder(), shirtMat);
  rShBall.position.set(0.255, 0.43, 0);
  torso.add(rShBall);

  // ── BRAS GAUCHE ──
  const lShoulder = new THREE.Group();
  lShoulder.position.set(-0.265, 0.43, 0);
  torso.add(lShoulder);

  const lUpperArm = new THREE.Group();
  lUpperArm.position.set(-0.04, 0, 0);
  lShoulder.add(lUpperArm);
  const lUAMesh = new THREE.Mesh(GEO.upperArm(), shirtMat);
  lUAMesh.position.set(0, -0.17, 0); lUAMesh.castShadow = true;
  lUpperArm.add(lUAMesh);

  const lElbow = new THREE.Group();
  lElbow.position.set(0, -0.34, 0);
  lUpperArm.add(lElbow);
  const lForeArm = new THREE.Group();
  lElbow.add(lForeArm);
  const lFAMesh = new THREE.Mesh(GEO.foreArm(), skinMat);
  lFAMesh.position.set(0, -0.15, 0); lFAMesh.castShadow = true;
  lForeArm.add(lFAMesh);

  const lHand = new THREE.Group();
  lHand.position.set(0, -0.30, 0);
  lForeArm.add(lHand);
  const lHandMesh = new THREE.Mesh(GEO.hand(), skinMat);
  lHandMesh.scale.set(1.1, 0.9, 1.2);
  lHandMesh.castShadow = true;
  lHand.add(lHandMesh);

  // ── BRAS DROIT ──
  const rShoulder = new THREE.Group();
  rShoulder.position.set(0.265, 0.43, 0);
  torso.add(rShoulder);

  const rUpperArm = new THREE.Group();
  rUpperArm.position.set(0.04, 0, 0);
  rShoulder.add(rUpperArm);
  const rUAMesh = new THREE.Mesh(GEO.upperArm(), shirtMat);
  rUAMesh.position.set(0, -0.17, 0); rUAMesh.castShadow = true;
  rUpperArm.add(rUAMesh);

  const rElbow = new THREE.Group();
  rElbow.position.set(0, -0.34, 0);
  rUpperArm.add(rElbow);
  const rForeArm = new THREE.Group();
  rElbow.add(rForeArm);
  const rFAMesh = new THREE.Mesh(GEO.foreArm(), skinMat);
  rFAMesh.position.set(0, -0.15, 0); rFAMesh.castShadow = true;
  rForeArm.add(rFAMesh);

  const rHand = new THREE.Group();
  rHand.position.set(0, -0.30, 0);
  rForeArm.add(rHand);
  const rHandMesh = new THREE.Mesh(GEO.hand(), skinMat);
  rHandMesh.scale.set(1.1, 0.9, 1.2);
  rHandMesh.castShadow = true;
  rHand.add(rHandMesh);

  // ── JAMBE GAUCHE ──
  const lHip = new THREE.Group();
  lHip.position.set(-0.115, -0.11, 0);
  pelvis.add(lHip);

  const lThigh = new THREE.Group();
  lHip.add(lThigh);
  const lThMesh = new THREE.Mesh(GEO.thigh(), pantsMat);
  lThMesh.position.set(0, -0.22, 0); lThMesh.castShadow = true;
  lThigh.add(lThMesh);

  const lKnee = new THREE.Group();
  lKnee.position.set(0, -0.44, 0);
  lThigh.add(lKnee);
  const lShin = new THREE.Group();
  lKnee.add(lShin);
  const lShMesh = new THREE.Mesh(GEO.shin(), pantsMat);
  lShMesh.position.set(0, -0.19, 0); lShMesh.castShadow = true;
  lShin.add(lShMesh);

  const lAnkle = new THREE.Group();
  lAnkle.position.set(0, -0.38, 0);
  lShin.add(lAnkle);
  const lFoot = new THREE.Group();
  lAnkle.add(lFoot);
  buildFoot(lFoot, shoesMat, soleMat);

  // ── JAMBE DROITE ──
  const rHip = new THREE.Group();
  rHip.position.set(0.115, -0.11, 0);
  pelvis.add(rHip);

  const rThigh = new THREE.Group();
  rHip.add(rThigh);
  const rThMesh = new THREE.Mesh(GEO.thigh(), pantsMat);
  rThMesh.position.set(0, -0.22, 0); rThMesh.castShadow = true;
  rThigh.add(rThMesh);

  const rKnee = new THREE.Group();
  rKnee.position.set(0, -0.44, 0);
  rThigh.add(rKnee);
  const rShin = new THREE.Group();
  rKnee.add(rShin);
  const rShMesh = new THREE.Mesh(GEO.shin(), pantsMat);
  rShMesh.position.set(0, -0.19, 0); rShMesh.castShadow = true;
  rShin.add(rShMesh);

  const rAnkle = new THREE.Group();
  rAnkle.position.set(0, -0.38, 0);
  rShin.add(rAnkle);
  const rFoot = new THREE.Group();
  rAnkle.add(rFoot);
  buildFoot(rFoot, shoesMat, soleMat);

  // ── ACCESSOIRES selon tenue ──
  addOutfitAccessories(headMesh, torso, pelvis, outfit, C, skinMat);

  // ── OS (pour animation) ──
  const bones = {
    root: group, pelvis, torso, neck, head,
    lUpperArm, lElbow, lForeArm, lHand,
    rUpperArm, rElbow, rForeArm, rHand,
    lHip, lThigh, lKnee, lShin, lFoot,
    rHip, rThigh, rKnee, rShin, rFoot,
  };

  // ── Arme portée ──
  let weaponMesh = null;
  const WEAPON_OFFSETS = {
    pistol:  { pos: [0, -0.05, 0.05], rot: [0, 0, 0] },
    ak47:    { pos: [0, -0.06, 0.08], rot: [0, 0, 0] },
    knife:   { pos: [0, -0.04, 0.06], rot: [0, 0, Math.PI * 0.1] },
    shotgun: { pos: [0, -0.06, 0.08], rot: [0, 0, 0] },
  };
  function attachWeapon(type) {
    if (weaponMesh) { rHand.remove(weaponMesh); weaponMesh = null; }
    const g = buildWeapon(type);
    if (g) {
      weaponMesh = g;
      const off = WEAPON_OFFSETS[type];
      if (off) {
        g.position.set(...off.pos);
        g.rotation.set(...off.rot);
      }
      rHand.add(g);
    }
  }

  // ── Système d'animation ──
  let currentAnim = 'idle';
  let animTime    = 0;
  let animSpeed   = 1;
  let dead        = false;

  const ANIMS = {

    idle(t) {
      // Respiration : balancement léger haut/bas
      const breath = Math.sin(t * 1.2) * 0.009;
      const sway   = Math.sin(t * 0.7) * 0.006;
      pelvis.position.y = 0.56 + breath;
      torso.rotation.x  = sway;
      torso.rotation.z  = Math.sin(t * 0.5) * 0.008;
      // Bras légèrement ouverts, oscillation douce
      lUpperArm.rotation.z =  0.18 + Math.sin(t * 1.1) * 0.018;
      rUpperArm.rotation.z = -0.18 - Math.sin(t * 1.1) * 0.018;
      lUpperArm.rotation.x = Math.sin(t * 0.6) * 0.03;
      rUpperArm.rotation.x = -Math.sin(t * 0.6) * 0.03;
      lElbow.rotation.x = 0.08 + Math.sin(t * 0.9) * 0.02;
      rElbow.rotation.x = 0.08 + Math.sin(t * 0.9) * 0.02;
      // Tête se tourne doucement
      head.rotation.y = Math.sin(t * 0.35) * 0.08;
      head.rotation.x = Math.sin(t * 0.55) * 0.02;
      // Légère flexion genou (poids sur un pied)
      lThigh.rotation.x =  Math.sin(t * 0.4) * 0.022;
      rThigh.rotation.x = -Math.sin(t * 0.4) * 0.022;
    },

    walk(t) {
      const s = Math.sin(t * 3.5);
      const c = Math.cos(t * 3.5);
      pelvis.position.y = 0.56 + Math.abs(s) * 0.038;
      pelvis.rotation.z = s * 0.04;   // tangage latéral
      torso.rotation.y  = s * 0.10;
      torso.rotation.z  = -s * 0.025;
      head.rotation.y   = -s * 0.05;
      lThigh.rotation.x =  s * 0.58;
      rThigh.rotation.x = -s * 0.58;
      lKnee.rotation.x  = Math.max(0, -s) * 0.72;
      rKnee.rotation.x  = Math.max(0,  s) * 0.72;
      lFoot.rotation.x  = s * 0.18;
      rFoot.rotation.x  = -s * 0.18;
      lUpperArm.rotation.x = -s * 0.42;
      rUpperArm.rotation.x =  s * 0.42;
      lUpperArm.rotation.z =  0.12;
      rUpperArm.rotation.z = -0.12;
      lElbow.rotation.x = 0.18 + Math.max(0, s) * 0.28;
      rElbow.rotation.x = 0.18 + Math.max(0,-s) * 0.28;
    },

    run(t) {
      const s = Math.sin(t * 5.8);
      const c = Math.cos(t * 5.8);
      pelvis.position.y = 0.52 + Math.abs(s) * 0.065;
      pelvis.rotation.z = s * 0.06;
      torso.rotation.y  = s * 0.20;
      torso.rotation.x  = -0.22;   // inclinaison vers l'avant
      head.rotation.x   = -0.08;
      head.rotation.y   = s * 0.05;
      // Jambes : amplitude élevée
      lThigh.rotation.x =  s * 0.95;
      rThigh.rotation.x = -s * 0.95;
      lKnee.rotation.x  = Math.max(0, -s) * 1.35;
      rKnee.rotation.x  = Math.max(0,  s) * 1.35;
      lFoot.rotation.x  = s * 0.35;
      rFoot.rotation.x  = -s * 0.35;
      // Bras : fort balancement opposé aux jambes
      lUpperArm.rotation.x = -s * 0.80;
      rUpperArm.rotation.x =  s * 0.80;
      lUpperArm.rotation.z =  0.18;
      rUpperArm.rotation.z = -0.18;
      lElbow.rotation.x = 0.5 + Math.max(0, s) * 0.55;
      rElbow.rotation.x = 0.5 + Math.max(0,-s) * 0.55;
    },

    shoot(t) {
      // Base idle mais bras en position de tir à deux mains
      const breath = Math.sin(t * 1.2) * 0.006;
      pelvis.position.y = 0.56 + breath;
      torso.rotation.x  = -0.15;  // légère inclinaison vers l'avant
      head.rotation.x   = -0.08;
      // Bras droit : tient l'arme, tendu vers l'avant
      rUpperArm.rotation.x = -1.15;
      rUpperArm.rotation.z = -0.12;
      rElbow.rotation.x    =  0.45;
      // Bras gauche : soutient (avant-bras vers l'avant)
      lUpperArm.rotation.x = -0.95;
      lUpperArm.rotation.z =  0.25;
      lElbow.rotation.x    =  0.62;
      // Recul au tir
      const kick = Math.max(0, Math.sin(t * 20)) * 0.10;
      torso.rotation.x = -0.15 + kick * 0.25;
      torso.rotation.z = kick * 0.04;
    },

    jump(t) {
      // Phase montée : jambes repliées
      const p = Math.min(t * 2.5, 1);
      const p2 = Math.max(0, Math.min((t - 0.4) * 3, 1)); // descente
      pelvis.position.y = 0.56 + Math.sin(Math.PI * Math.min(t * 1.8, 1)) * 0.25;
      torso.rotation.x  = -0.15 + p * 0.10;
      // Jambes repliées en l'air
      lThigh.rotation.x = p * 0.6 - p2 * 0.3;
      rThigh.rotation.x = p * 0.6 - p2 * 0.3;
      lKnee.rotation.x  = p * 1.0 - p2 * 0.5;
      rKnee.rotation.x  = p * 1.0 - p2 * 0.5;
      // Bras légèrement levés pour équilibre
      lUpperArm.rotation.x = -0.5 + p2 * 0.3;
      rUpperArm.rotation.x = -0.5 + p2 * 0.3;
      lUpperArm.rotation.z =  0.35;
      rUpperArm.rotation.z = -0.35;
    },

    die(t) {
      // Chute dramatique vers l'avant avec rotation complète
      const p = Math.min(t / 1.0, 1);
      const ease = p * p * (3 - 2 * p); // smooth step
      pelvis.position.y    = 0.56 - ease * 0.54;
      pelvis.rotation.z    = ease * Math.PI * 0.52;
      pelvis.rotation.x    = ease * 0.3;
      torso.rotation.x     = ease * 0.45;
      torso.rotation.z     = ease * 0.15;
      lThigh.rotation.x    = ease * 0.75;
      rThigh.rotation.x    = ease * 0.45;
      lKnee.rotation.x     = ease * 0.9;
      rKnee.rotation.x     = ease * 0.5;
      lUpperArm.rotation.z =  ease * 1.3;
      lUpperArm.rotation.x =  ease * 0.4;
      rUpperArm.rotation.z = -ease * 0.9;
      rUpperArm.rotation.x =  ease * 0.3;
      lElbow.rotation.x    = ease * 0.6;
      rElbow.rotation.x    = ease * 0.4;
      head.rotation.z      = ease * 0.2;
    },

    crouch(t) {
      // Position accroupie : bassin bas, torse incliné
      const breath = Math.sin(t * 1.0) * 0.005;
      pelvis.position.y = 0.34 + breath;
      torso.rotation.x  = -0.25;
      head.rotation.x   = -0.12;
      lThigh.rotation.x =  1.05;
      rThigh.rotation.x =  1.05;
      lKnee.rotation.x  =  1.40;
      rKnee.rotation.x  =  1.40;
      lFoot.rotation.x  = -0.35;
      rFoot.rotation.x  = -0.35;
      lUpperArm.rotation.z =  0.22 + Math.sin(t * 0.8) * 0.015;
      rUpperArm.rotation.z = -0.22 - Math.sin(t * 0.8) * 0.015;
      lUpperArm.rotation.x =  Math.sin(t * 0.5) * 0.02;
      rUpperArm.rotation.x = -Math.sin(t * 0.5) * 0.02;
      lElbow.rotation.x = 0.12;
      rElbow.rotation.x = 0.12;
    },

    crouch_walk(t) {
      // Marche accroupie furtive
      const s = Math.sin(t * 3.2);
      pelvis.position.y = 0.32 + Math.abs(s) * 0.022;
      pelvis.rotation.z = s * 0.025;
      torso.rotation.x  = -0.28;
      torso.rotation.y  = s * 0.06;
      head.rotation.x   = -0.14;
      head.rotation.y   = -s * 0.03;
      lThigh.rotation.x =  0.85 + s * 0.35;
      rThigh.rotation.x =  0.85 - s * 0.35;
      lKnee.rotation.x  =  1.20 + Math.max(0, -s) * 0.30;
      rKnee.rotation.x  =  1.20 + Math.max(0,  s) * 0.30;
      lFoot.rotation.x  = -0.25 + s * 0.10;
      rFoot.rotation.x  = -0.25 - s * 0.10;
      lUpperArm.rotation.x = -s * 0.22;
      rUpperArm.rotation.x =  s * 0.22;
      lUpperArm.rotation.z =  0.18;
      rUpperArm.rotation.z = -0.18;
      lElbow.rotation.x = 0.20 + Math.max(0,  s) * 0.15;
      rElbow.rotation.x = 0.20 + Math.max(0, -s) * 0.15;
    },

    hit(t) {
      // Recul brusque quand touché (durée ~0.4 sec)
      const p  = Math.min(t / 0.4, 1);
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p; // ease in-out
      const shock = Math.max(0, 1 - p * 2.5); // pic au début, retombe vite
      pelvis.position.y = 0.56 - shock * 0.08;
      torso.rotation.x  =  shock * 0.45;   // penche vers l'arrière
      torso.rotation.z  =  shock * 0.12;
      head.rotation.x   =  shock * 0.30;
      head.rotation.z   = -shock * 0.10;
      // Bras s'écartent par réflexe
      lUpperArm.rotation.z =  0.18 + shock * 0.80;
      rUpperArm.rotation.z = -0.18 - shock * 0.80;
      lUpperArm.rotation.x =  shock * 0.30;
      rUpperArm.rotation.x =  shock * 0.30;
      lElbow.rotation.x = 0.08 + shock * 0.40;
      rElbow.rotation.x = 0.08 + shock * 0.40;
      // Genoux fléchissent légèrement
      lKnee.rotation.x = shock * 0.25;
      rKnee.rotation.x = shock * 0.25;
    },

    swim(t) {
      // Nage crawl : corps horizontal, bras alternatifs
      const s = Math.sin(t * 2.8);
      const c = Math.cos(t * 2.8);
      // Corps couché vers l'avant
      pelvis.position.y = 0.30 + Math.sin(t * 2.8) * 0.04;
      torso.rotation.x  = -1.20;  // quasi horizontal
      torso.rotation.z  =  s * 0.12;
      head.rotation.x   =  0.65;  // tête relevée pour respirer
      head.rotation.y   =  s * 0.20;
      // Bras alternent : un en avant, un en arrière
      lUpperArm.rotation.x = -s * 1.40;
      rUpperArm.rotation.x =  s * 1.40;
      lUpperArm.rotation.z =  0.10;
      rUpperArm.rotation.z = -0.10;
      lElbow.rotation.x = Math.max(0,  s) * 0.60;
      rElbow.rotation.x = Math.max(0, -s) * 0.60;
      // Jambes battent (ciseau vertical)
      lThigh.rotation.x =  c * 0.35;
      rThigh.rotation.x = -c * 0.35;
      lKnee.rotation.x  = Math.max(0, -c) * 0.30;
      rKnee.rotation.x  = Math.max(0,  c) * 0.30;
      lFoot.rotation.x  =  c * 0.20;
      rFoot.rotation.x  = -c * 0.20;
    },
  };

  // ── Blending d'animations ──────────────────────────────────────
  // Capture un snapshot de toutes les rotations/positions des os
  function snapshotBones() {
    const snap = {};
    const boneList = [pelvis, torso, neck, head,
      lUpperArm, lElbow, lForeArm, lHand,
      rUpperArm, rElbow, rForeArm, rHand,
      lHip, lThigh, lKnee, lShin, lFoot,
      rHip, rThigh, rKnee, rShin, rFoot];
    boneList.forEach((b, i) => {
      snap[i] = {
        rx: b.rotation.x, ry: b.rotation.y, rz: b.rotation.z,
        py: (b === pelvis) ? b.position.y : null,
      };
    });
    return snap;
  }

  // Os sous forme de tableau indexé (même ordre que snapshotBones)
  const _boneArray = [pelvis, torso, neck, head,
    lUpperArm, lElbow, lForeArm, lHand,
    rUpperArm, rElbow, rForeArm, rHand,
    lHip, lThigh, lKnee, lShin, lFoot,
    rHip, rThigh, rKnee, rShin, rFoot];

  let blendFrom   = null;   // snapshot de départ du blend
  let blendAlpha  = 1.0;    // 0 = départ, 1 = arrivée
  let blendSpeed  = 8.0;    // vitesse de blend (unités/sec)

  function resetBones() {
    if (dead) return;
    _boneArray.forEach(b => { b.rotation.set(0, 0, 0); });
    pelvis.position.set(0, 0.56, 0);
  }

  // Applique un blend linéaire entre blendFrom (alpha=0) et pose actuelle (alpha=1)
  function applyBlend() {
    if (!blendFrom || blendAlpha >= 1.0) return;
    _boneArray.forEach((b, i) => {
      const f = blendFrom[i];
      if (!f) return;
      b.rotation.x = f.rx + (b.rotation.x - f.rx) * blendAlpha;
      b.rotation.y = f.ry + (b.rotation.y - f.ry) * blendAlpha;
      b.rotation.z = f.rz + (b.rotation.z - f.rz) * blendAlpha;
      if (f.py !== null) b.position.y = f.py + (b.position.y - f.py) * blendAlpha;
    });
  }

  function setAnim(name, speed = 1) {
    if (dead && name !== 'die') return;
    if (currentAnim !== name) {
      // Capture la pose actuelle avant de changer pour blending doux
      blendFrom  = snapshotBones();
      blendAlpha = 0.0;
      currentAnim = name;
      animTime    = 0;
    }
    animSpeed = speed;
  }

  // ── hit : retour automatique à l'animation précédente ──
  let _prevAnim = 'idle';
  let _hitPending = false;

  /** Déclenche un recul de dégâts et reprend l'anim courante après */
  function triggerHit() {
    if (dead) return;
    _prevAnim    = currentAnim !== 'hit' ? currentAnim : _prevAnim;
    _hitPending  = false;
    setAnim('hit');
    _hitPending  = true;
  }

  function update(dt) {
    if (dead) return;
    animTime += dt * animSpeed * 1000; // en ms
    if (blendAlpha < 1.0) blendAlpha = Math.min(1.0, blendAlpha + dt * blendSpeed);

    resetBones();
    const fn = ANIMS[currentAnim] ?? ANIMS.idle;
    fn(animTime / 1000);
    applyBlend();

    // Retour auto après hit (~0.45 sec)
    if (_hitPending && animTime >= 450) {
      _hitPending = false;
      setAnim(_prevAnim, animSpeed);
    }

    // Marquer mort APRÈS avoir joué l'anim complète (1 seconde)
    if (currentAnim === 'die' && animTime >= 1000) dead = true;
  }

  /** Réinitialise l'état (respawn) */
  function revive() {
    dead        = false;
    animTime    = 0;
    currentAnim = 'idle';
    blendFrom   = null;
    blendAlpha  = 1.0;
    _hitPending = false;
    _prevAnim   = 'idle';
    _boneArray.forEach(b => { b.rotation.set(0, 0, 0); });
    pelvis.position.set(0, 0.56, 0);
  }

  group.userData.charHeight = 1.88;
  return { group, bones, setAnim, update, attachWeapon, revive, triggerHit, isDead: () => dead };
}

/* ══════════════════════════════════════════════════════════════════
   HELPERS DESIGN
══════════════════════════════════════════════════════════════════ */

// ── Chaussure avec semelle ──────────────────────────────────────────
function buildFoot(footGroup, shoesMat, soleMat) {
  const main = new THREE.Mesh(GEO.footMain(), shoesMat);
  main.position.set(0, -0.03, 0.04);
  main.castShadow    = true;
  main.receiveShadow = true;
  footGroup.add(main);
  // Talon
  const heel = new THREE.Mesh(GEO.footHeel(), shoesMat);
  heel.position.set(0, -0.025, -0.07);
  heel.castShadow    = true;
  heel.receiveShadow = true;
  footGroup.add(heel);
  // Semelle
  const sole = new THREE.Mesh(GEO.sole(), soleMat);
  sole.position.set(0, -0.06, 0.03);
  sole.castShadow    = true;
  sole.receiveShadow = true;
  footGroup.add(sole);
  // Lacets (petits points blancs)
  const lacetMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const lacet = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.012), lacetMat);
    lacet.position.set(0, -0.008, 0.02 + i * 0.032);
    footGroup.add(lacet);
  }
}

// ── Cheveux variés par outfit ──────────────────────────────────────
function addHair(headMesh, outfit, skinColor) {
  const hairBlack  = new THREE.MeshStandardMaterial({ color: 0x0a0808, roughness: 0.95 });
  const hairBrown  = new THREE.MeshStandardMaterial({ color: 0x1a0e04, roughness: 0.95 });

  if (outfit === 'braqueur') {
    // Cagoule complète
    const balaclava = new THREE.Mesh(new THREE.SphereGeometry(0.238, 12, 10), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 }));
    balaclava.scale.set(1.04, 1.06, 1.04);
    headMesh.add(balaclava);
    // Découpe pour les yeux
    const eyeSlot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.02), new THREE.MeshStandardMaterial({ color: 0x060606 }));
    eyeSlot.position.set(0, 0.055, 0.218);
    headMesh.add(eyeSlot);
    return;
  }

  if (outfit === 'police') {
    // Casquette police structurée
    const capBase = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.24, 0.10, 12), new THREE.MeshStandardMaterial({ color: 0x1B2A6B, roughness: 0.7 }));
    capBase.position.set(0, 0.20, 0);
    headMesh.add(capBase);
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.235, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0x1B2A6B, roughness: 0.7 }));
    capTop.position.set(0, 0.285, 0);
    headMesh.add(capTop);
    // Visière
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.27, 0.025, 12, 1, false, -0.1, Math.PI + 0.2), new THREE.MeshStandardMaterial({ color: 0x0e1840, roughness: 0.5 }));
    visor.position.set(0, 0.175, 0.05);
    headMesh.add(visor);
    // Bandeau doré
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.238, 0.238, 0.018, 12), new THREE.MeshStandardMaterial({ color: 0xCCAA00, roughness: 0.3, metalness: 0.6 }));
    band.position.set(0, 0.155, 0);
    headMesh.add(band);
    return;
  }

  if (outfit === 'gang') {
    // Bandana noué sur la tête (avec nœud sur le côté)
    const bandanaBack = new THREE.Mesh(new THREE.SphereGeometry(0.236, 10, 8), new THREE.MeshStandardMaterial({ color: 0xCC0000, roughness: 0.85 }));
    bandanaBack.scale.set(1.03, 0.62, 1.03);
    bandanaBack.position.y = -0.04;
    headMesh.add(bandanaBack);
    // Nœud côté droit
    const knot1 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshStandardMaterial({ color: 0xCC0000, roughness: 0.85 }));
    knot1.position.set(0.21, -0.06, -0.05);
    headMesh.add(knot1);
    const knot2 = knot1.clone();
    knot2.position.set(0.22, -0.09, -0.06);
    headMesh.add(knot2);
    // Cheveux visibles sous le bandana
    const hairUnder = new THREE.Mesh(new THREE.SphereGeometry(0.228, 10, 8), hairBlack);
    hairUnder.scale.set(1, 0.55, 1);
    hairUnder.position.y = 0.02;
    headMesh.add(hairUnder);
    return;
  }

  if (outfit === 'dealer') {
    // Dreadlocks : plusieurs cylindres qui tombent
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const loc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.012, 0.22 + Math.random() * 0.12, 5),
        hairBrown
      );
      loc.position.set(
        Math.sin(angle) * 0.17,
        0.10 - 0.22/2,
        Math.cos(angle) * 0.14
      );
      loc.rotation.z = Math.sin(angle) * 0.3;
      loc.rotation.x = Math.cos(angle) * 0.2;
      headMesh.add(loc);
    }
    // Calotte de base
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.232, 10, 8), hairBrown);
    cap.scale.set(1, 0.65, 1);
    cap.position.y = 0.06;
    headMesh.add(cap);
    return;
  }

  if (outfit === 'street') {
    // Casquette à l'envers (streetwear)
    const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.234, 0.238, 0.115, 12), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
    capBody.position.y = 0.195;
    headMesh.add(capBody);
    const capFlat = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.234, 0.045, 12), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 }));
    capFlat.position.y = 0.285;
    headMesh.add(capFlat);
    // Visière vers l'arrière
    const visorBack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.015, 0.10), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7 }));
    visorBack.position.set(0, 0.172, -0.14);
    visorBack.rotation.x = -0.15;
    headMesh.add(visorBack);
    // Logo (petit rectangle) sur le devant
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.012), new THREE.MeshStandardMaterial({ color: 0xFF4400 }));
    logo.position.set(0, 0.215, 0.228);
    headMesh.add(logo);
    return;
  }

  if (outfit === 'civil') {
    // Cheveux courts naturels (afro structuré)
    const afroBase = new THREE.Mesh(new THREE.SphereGeometry(0.232, 10, 8), hairBlack);
    afroBase.scale.set(1.02, 0.75, 1.02);
    afroBase.position.y = 0.06;
    headMesh.add(afroBase);
    // Texture afro : petites sphères sur le dessus
    for (let i = 0; i < 12; i++) {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * 0.6;
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 4), hairBlack);
      bump.position.set(
        Math.sin(theta) * Math.cos(phi) * 0.22,
        0.09 + Math.cos(theta) * 0.16,
        Math.sin(theta) * Math.sin(phi) * 0.22
      );
      headMesh.add(bump);
    }
    return;
  }
}

// ── Accessoires distinctifs ────────────────────────────────────────
function addOutfitAccessories(headMesh, torso, pelvis, outfit, C, skinMat) {
  const accentMat = new THREE.MeshStandardMaterial({ color: C.accent, roughness: 0.4, metalness: 0.3 });

  if (outfit === 'dealer') {
    // Lunettes de soleil (cerclage + verres teintés)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.7 });
    const lensMat  = new THREE.MeshStandardMaterial({ color: 0x001a00, transparent: true, opacity: 0.75, roughness: 0.1 });
    [-0.075, 0.075].forEach(lx => {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 5, 10), frameMat);
      frame.position.set(lx, 0.058, 0.212);
      frame.rotation.y = Math.PI / 2;
      headMesh.add(frame);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 10), lensMat);
      lens.position.set(lx, 0.058, 0.214);
      lens.rotation.y = Math.PI / 2;
      headMesh.add(lens);
    });
    // Pont de lunettes
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.005, 0.006), frameMat);
    bridge.position.set(0, 0.058, 0.214);
    headMesh.add(bridge);
  }

  if (outfit === 'gang') {
    // Collier en or (chaîne)
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const link = new THREE.Mesh(
        new THREE.TorusGeometry(0.008, 0.003, 4, 6),
        new THREE.MeshStandardMaterial({ color: 0xDAA520, roughness: 0.2, metalness: 0.9 })
      );
      link.position.set(Math.sin(angle) * 0.14, 0.38 - Math.abs(Math.sin(angle)) * 0.05, Math.cos(angle) * 0.12);
      torso.add(link);
    }
    // Pendentif
    const pendant = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.008), new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.2, metalness: 1.0 }));
    pendant.position.set(0, 0.30, 0.16);
    torso.add(pendant);
  }

  if (outfit === 'police') {
    // Badge sur le torse gauche
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.014), new THREE.MeshStandardMaterial({ color: 0xC8A800, roughness: 0.2, metalness: 0.8 }));
    badge.position.set(-0.12, 0.35, 0.20);
    torso.add(badge);
    // Étoile sur le badge
    const star = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 5), new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.2, metalness: 0.9 }));
    star.position.set(-0.12, 0.35, 0.212);
    torso.add(star);
    // Radio (rectangle sur l'épaule)
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.02), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    radio.position.set(0.20, 0.42, 0.08);
    torso.add(radio);
  }

  if (outfit === 'civil') {
    // Cravate courte ivoirienne (bande de couleur)
    const tie1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.012), new THREE.MeshStandardMaterial({ color: 0xFF8800, roughness: 0.7 }));
    tie1.position.set(0, 0.28, 0.20);
    torso.add(tie1);
    const tieKnot = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.035, 0.016), new THREE.MeshStandardMaterial({ color: 0xCC6600, roughness: 0.7 }));
    tieKnot.position.set(0, 0.40, 0.20);
    torso.add(tieKnot);
  }

  if (outfit === 'street') {
    // Chaîne fine autour du cou
    const chainMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.2, metalness: 0.9 });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.002, 4, 6), chainMat);
      link.position.set(Math.sin(angle) * 0.12, 0.40, Math.cos(angle) * 0.10);
      torso.add(link);
    }
    // Écouteurs / oreillette
    const earbud = new THREE.Mesh(new THREE.SphereGeometry(0.014, 5, 4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    earbud.position.set(-0.21, 0.02, 0.01);
    headMesh.add(earbud);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.15, 4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    wire.position.set(-0.18, -0.04, 0.00);
    wire.rotation.z = 0.4;
    headMesh.add(wire);
  }

  if (outfit === 'braqueur') {
    // Gilet tactique (rectangles sur le torse)
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.06), vestMat);
    vest.position.set(0, 0.28, 0.03);
    torso.add(vest);
    // Poches du gilet
    [[-0.12, 0.32, 0.063], [0.12, 0.32, 0.063], [-0.12, 0.20, 0.063], [0.12, 0.20, 0.063]].forEach(([x,y,z]) => {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.065, 0.018), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
      pocket.position.set(x, y, z);
      torso.add(pocket);
    });
    // Masque à gaz sur la tête (filtre + oculaires)
    const maskMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const filterMat = new THREE.MeshStandardMaterial({ color: 0x222211, roughness: 0.6, metalness: 0.3 });
    const goggleMat = new THREE.MeshStandardMaterial({ color: 0x001a00, transparent: true, opacity: 0.82, roughness: 0.05, metalness: 0.1 });
    // Corps du masque
    const maskBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.055), maskMat);
    maskBody.position.set(0, -0.025, 0.222);
    headMesh.add(maskBody);
    // Oculaires (2 cercles)
    [-0.058, 0.058].forEach(ox => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.007, 6, 10), new THREE.MeshStandardMaterial({ color: 0x333322, roughness: 0.4, metalness: 0.6 }));
      rim.position.set(ox, 0.010, 0.248);
      headMesh.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 10), goggleMat);
      lens.position.set(ox, 0.010, 0.250);
      headMesh.add(lens);
    });
    // Filtre cylindrique central (bas du masque)
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.025, 0.055, 8), filterMat);
    filter.rotation.x = Math.PI / 2;
    filter.position.set(0, -0.068, 0.250);
    headMesh.add(filter);
    // Stries du filtre
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.003, 4, 8), new THREE.MeshStandardMaterial({ color: 0x444433, roughness: 0.5 }));
      stripe.position.set(0, -0.068, 0.240 + i * 0.010);
      headMesh.add(stripe);
    }
    // Sangle arrière du masque
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.236, 0.236, 0.020, 12), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }));
    strap.position.set(0, -0.020, 0);
    headMesh.add(strap);
  }
}

// ── Construction des armes ─────────────────────────────────────────
export function buildWeapon(type) {
  if (!type) return null;
  const g = new THREE.Group();

  if (type === 'pistol') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.11, 0.19), mat(0x1a1a1a, 0.5, 0.4));
    body.position.set(0, -0.055, 0.095);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.17, 7), mat(0x2a2a2a, 0.3, 0.6));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.018, 0.210);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.09, 0.12), mat(0x111111, 0.9));
    grip.position.set(0, -0.115, 0.04);
    grip.rotation.x = 0.15;
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.035, 0.02), mat(0x333333, 0.5, 0.4));
    trigger.position.set(0, -0.078, 0.090);
    g.add(body); g.add(barrel); g.add(grip); g.add(trigger);
    return g;
  }

  if (type === 'ak47') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.105, 0.50), mat(0x4a2a0e, 0.85));
    body.position.set(0, -0.05, 0.25);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.32, 7), mat(0x2a2a2a, 0.3, 0.7));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.008, 0.56);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.16, 0.065), mat(0x2a2a2a, 0.5, 0.3));
    mag.position.set(0, -0.148, 0.21);
    mag.rotation.x = -0.2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.18), mat(0x3a1e08, 0.85));
    stock.position.set(0, -0.015, -0.09);
    // Garde avant en bois
    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.16), mat(0x4a2a0e, 0.85));
    foregrip.position.set(0, -0.06, 0.42);
    g.add(body); g.add(barrel); g.add(mag); g.add(stock); g.add(foregrip);
    return g;
  }

  if (type === 'knife') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.24), mat(0xcccccc, 0.15, 0.7));
    blade.position.set(0, 0, 0.12);
    // Tranchant visible
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.24), mat(0xeeeeee, 0.05, 0.9));
    edge.position.set(0.009, -0.007, 0.12);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.11, 7), mat(0x3a1e00, 0.85));
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0, -0.055);
    // Garde
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.025), mat(0x555555, 0.4, 0.5));
    guard.position.set(0, 0, 0.005);
    g.add(blade); g.add(edge); g.add(handle); g.add(guard);
    return g;
  }

  if (type === 'shotgun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), mat(0x3a1e00, 0.85));
    body.position.set(0, -0.04, 0.275);
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.50, 7), mat(0x222222, 0.3, 0.6));
    barrel1.rotation.x = Math.PI / 2;
    barrel1.position.set(0.018, 0.008, 0.48);
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.50, 7), mat(0x222222, 0.3, 0.6));
    barrel2.rotation.x = Math.PI / 2;
    barrel2.position.set(-0.018, 0.008, 0.48);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.22), mat(0x2e1600, 0.85));
    stock.position.set(0, -0.01, -0.11);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.038, 0.022), mat(0x333333));
    trigger.position.set(0, -0.07, 0.12);
    g.add(body); g.add(barrel1); g.add(barrel2); g.add(stock); g.add(trigger);
    return g;
  }

  return null;
}

/* ══════════════════════════════════════════════════════════════════
   buildNPC — Enveloppe avec état IA
══════════════════════════════════════════════════════════════════ */
export function buildNPC(skinTone, outfit, x, z) {
  const char = buildCharacter(skinTone, outfit);
  char.group.position.set(x, 0, z);
  char.group.rotation.y = Math.random() * Math.PI * 2;

  char.npc = {
    hp: 100,
    maxHp: 100,
    state: 'patrol',
    target: null,
    walkAngle: Math.random() * Math.PI * 2,
    walkRadius: 5 + Math.random() * 8,
    walkCenter: new THREE.Vector3(x, 0, z),
    alertRadius: 14,
    speed: 0.03 + Math.random() * 0.02,
    timer: 0,
    shootCooldown: 0,
    /**
     * Inflige des dégâts au NPC. Retourne true si mort.
     * @param {number} amount - Dégâts
     */
    takeDamage(amount) {
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp <= 0 && !char.isDead()) {
        char.setAnim('die');
        this.state = 'dead';
        return true;
      }
      // Recul visuel au dégât
      char.triggerHit();
      return false;
    },
  };
  return char;
}

/* ══════════════════════════════════════════════════════════════════
   LOD — Level Of Detail
   Usage :
     const lod = new CharacterLOD(char, camera);
     // dans la boucle : lod.update();
══════════════════════════════════════════════════════════════════ */
export class CharacterLOD {
  /**
   * @param {object} char   - Résultat de buildCharacter()
   * @param {THREE.Camera} camera
   * @param {object} [opts]
   * @param {number} [opts.distMed=20]  - Distance passage HIGH→MED
   * @param {number} [opts.distLow=45]  - Distance passage MED→LOW
   * @param {number} [opts.distCull=80] - Distance culling total
   */
  constructor(char, camera, opts = {}) {
    this._char   = char;
    this._cam    = camera;
    this._dist   = { med: opts.distMed ?? 20, low: opts.distLow ?? 45, cull: opts.distCull ?? 80 };
    this._level  = 'high'; // 'high' | 'med' | 'low' | 'culled'
    this._camPos = new THREE.Vector3();
    this._pos    = new THREE.Vector3();
    // Précalcule la liste de tous les Mesh du groupe pour contrôle fin
    this._allMeshes = [];
    char.group.traverse(obj => { if (obj.isMesh) this._allMeshes.push(obj); });
  }

  update() {
    this._cam.getWorldPosition(this._camPos);
    this._char.group.getWorldPosition(this._pos);
    const d = this._camPos.distanceTo(this._pos);
    let newLevel;
    if      (d > this._dist.cull) newLevel = 'culled';
    else if (d > this._dist.low)  newLevel = 'low';
    else if (d > this._dist.med)  newLevel = 'med';
    else                          newLevel = 'high';

    if (newLevel === this._level) return;
    this._level = newLevel;
    this._apply();
  }

  _apply() {
    const { group } = this._char;
    if (this._level === 'culled') {
      group.visible = false;
      return;
    }
    group.visible = true;

    this._allMeshes.forEach(m => {
      if (this._level === 'high') {
        m.visible = true;
        m.castShadow    = true;
        m.receiveShadow = true;
      } else if (this._level === 'med') {
        // Masquer les petits détails (lacets, narines, sourcils…)
        const geo = m.geometry;
        const isDetail = geo && geo.parameters &&
          (('radius' in geo.parameters && geo.parameters.radius < 0.012) ||
           ('width'  in geo.parameters && geo.parameters.width  < 0.02));
        m.visible = !isDetail;
        m.castShadow    = true;
        m.receiveShadow = false;
      } else { // low
        // Garder uniquement tête, torse, bassin, cuisses
        const keep = [
          this._char.bones.head,
          this._char.bones.torso,
          this._char.bones.pelvis,
          this._char.bones.lThigh,
          this._char.bones.rThigh,
        ];
        m.visible = keep.some(b => b && b.children.includes(m));
        m.castShadow    = false;
        m.receiveShadow = false;
      }
    });
  }

  /** Force un niveau de détail particulier ('high'|'med'|'low'|'culled') */
  forceLevel(level) { this._level = level; this._apply(); }
}

/* ══════════════════════════════════════════════════════════════════
   SONS POSITIONNELS — CharacterAudio
   Utilise Web Audio API. Sons synthétiques (pas de fichiers requis).
   Usage :
     const audio = new CharacterAudio(char.group);
     audio.play('step');   // 'step'|'run_step'|'hit'|'shoot'|'die'|'swim_splash'
══════════════════════════════════════════════════════════════════ */
export class CharacterAudio {
  /**
   * @param {THREE.Object3D} charGroup  - group du personnage (pour position 3D)
   * @param {THREE.Camera}   camera     - caméra (listener)
   * @param {object}         [opts]
   * @param {number}         [opts.maxDist=30] - Distance max audible
   * @param {number}         [opts.volume=1.0]
   */
  constructor(charGroup, camera, opts = {}) {
    this._group   = charGroup;
    this._cam     = camera;
    this._maxDist = opts.maxDist ?? 30;
    this._vol     = opts.volume  ?? 1.0;
    this._ctx     = null; // AudioContext créé à la demande (politique autoplay)
    this._camPos  = new THREE.Vector3();
    this._srcPos  = new THREE.Vector3();
  }

  _ensureCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  }

  /** Calcule le gain en fonction de la distance (0 → 1) */
  _gainFromDist() {
    this._cam.getWorldPosition(this._camPos);
    this._group.getWorldPosition(this._srcPos);
    const d = this._camPos.distanceTo(this._srcPos);
    return Math.max(0, 1 - d / this._maxDist) * this._vol;
  }

  /** Calcule le panoramique (-1 gauche, +1 droite) */
  _pan() {
    this._cam.getWorldPosition(this._camPos);
    this._group.getWorldPosition(this._srcPos);
    const rel = this._srcPos.clone().sub(this._camPos);
    // Projeter sur l'axe X de la caméra
    const camRight = new THREE.Vector3();
    this._cam.getWorldDirection(new THREE.Vector3()); // flush matrix
    this._cam.matrixWorld.extractBasis(camRight, new THREE.Vector3(), new THREE.Vector3());
    return Math.max(-1, Math.min(1, rel.dot(camRight) / (this._maxDist * 0.5)));
  }

  /**
   * Joue un son synthétique positionnel.
   * @param {'step'|'run_step'|'hit'|'shoot'|'die'|'swim_splash'|'crouch_step'} name
   */
  play(name) {
    const gain = this._gainFromDist();
    if (gain <= 0.001) return; // trop loin, on skip
    const ctx = this._ensureCtx();

    // ── Descripteurs de sons synthétiques ──────────────────────────
    const SOUNDS = {
      step: () => {
        // Pas sourd : bruit blanc court + filtre passe-bas
        const buf    = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
        const data   = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src    = ctx.createBufferSource();
        src.buffer   = buf;
        const flt    = ctx.createBiquadFilter();
        flt.type     = 'lowpass'; flt.frequency.value = 280;
        src.connect(flt);
        return { src, out: flt };
      },
      run_step: () => {
        const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 1.4;
        const src  = ctx.createBufferSource(); src.buffer = buf;
        const flt  = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 350;
        src.connect(flt); return { src, out: flt };
      },
      crouch_step: () => {
        const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.5;
        const src  = ctx.createBufferSource(); src.buffer = buf;
        const flt  = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 180;
        src.connect(flt); return { src, out: flt };
      },
      hit: () => {
        // Impact chair : bruit + oscillateur basse freq
        const osc  = ctx.createOscillator();
        osc.type   = 'sine'; osc.frequency.setValueAtTime(180, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.12);
        return { src: osc, out: osc, duration: 0.14 };
      },
      shoot: () => {
        // Claquement : bruit blanc très court + punch
        const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const env = Math.exp(-i / (ctx.sampleRate * 0.025));
          data[i]   = (Math.random() * 2 - 1) * env;
        }
        const src  = ctx.createBufferSource(); src.buffer = buf;
        const flt  = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 800;
        src.connect(flt); return { src, out: flt };
      },
      die: () => {
        // Chute lourde : bruit grave
        const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const env = Math.exp(-i / (ctx.sampleRate * 0.12));
          data[i]   = (Math.random() * 2 - 1) * env * 2;
        }
        const src = ctx.createBufferSource(); src.buffer = buf;
        const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 200;
        src.connect(flt); return { src, out: flt };
      },
      swim_splash: () => {
        const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.20, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const env = i < ctx.sampleRate * 0.02 ? i / (ctx.sampleRate * 0.02) : Math.exp(-(i - ctx.sampleRate * 0.02) / (ctx.sampleRate * 0.06));
          data[i]   = (Math.random() * 2 - 1) * env;
        }
        const src = ctx.createBufferSource(); src.buffer = buf;
        const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1200; flt.Q.value = 0.8;
        src.connect(flt); return { src, out: flt };
      },
    };

    const def = SOUNDS[name];
    if (!def) return;
    const { src, out, duration } = def();

    // Gain spatial
    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;

    // Panoramique
    const panner = ctx.createStereoPanner();
    panner.pan.value = this._pan();

    out.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(ctx.destination);

    if (src.start) src.start(0);
    if (duration) src.stop(ctx.currentTime + duration);
  }

  /** Suspend l'AudioContext (pause du jeu) */
  suspend() { this._ctx?.suspend(); }
  /** Reprend l'AudioContext */
  resume()  { this._ctx?.resume(); }
}
