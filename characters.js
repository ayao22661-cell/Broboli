import * as THREE from 'https://unpkg.com/three@0.163.0/build/three.module.js';

/* ═══════════════════════════════════════════════════════════════
   CHARACTERS.JS — GTA Abidjan v6 — Style GTA Vice City
   ─────────────────────────────────────────────────────────────
   Refonte visuelle totale :
   - Proportions héroïques GTA : tête plus petite, épaules XXL,
     torse large, jambes longues — silhouette iconique Vice City
   - Tête anguleuse avec mâchoire forte, front plat, yeux stylisés
   - Tenues avec accents couleur vive (néon, contrastes forts)
   - Outfits distinctifs : chemises ouvertes, jeans baggy, uniformes
   - Accessoires : lunettes de soleil, casquettes, chaînes, gilets
   - Performances : cache matériaux, LOD, 0 new Material dans update
   ═══════════════════════════════════════════════════════════════ */

// ── Palettes peau ──────────────────────────────────────────────
const SKIN = {
  dark:   0x1a0a04,
  medium: 0x4a2208,
  light:  0x7a4a28,
};

// ── Cache matériaux ────────────────────────────────────────────
const _matCache = new Map();
function mat(color, roughness = 0.75, metalness = 0.05) {
  const key = `${color}_${roughness}_${metalness}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }
  return _matCache.get(key);
}
function matEmissive(color, emissive, intensity = 0.5) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.5 });
}
export function clearMaterialCache() { _matCache.clear(); }

/* ══════════════════════════════════════════════════════════════════
   CONSTRUCTEUR PRINCIPAL — Style GTA Vice City
══════════════════════════════════════════════════════════════════ */
export function buildCharacter(skinTone = 'dark', outfit = 'street') {

  const skinColor = SKIN[skinTone] ?? SKIN.dark;
  const skinMat   = mat(skinColor, 0.85);

  /* ── Palettes tenues — couleurs vives style Vice City ── */
  const OUTFITS = {
    // Tenue de rue : débardeur blanc + jean baggy + basket blanche
    street:   { shirt: 0xf0f0ee, pants: 0x1a2550, shoes: 0xeeeeee, belt: 0x111111, accent: 0xFF4400, alt: 0x333355 },
    // Gang : bandana + tshirt uni sombre + jean baggy
    gang:     { shirt: 0x8a0010, pants: 0x0a0a0a, shoes: 0x0a0a0a, belt: 0x220000, accent: 0xff2222, alt: 0x660000 },
    // Police : uniforme bleu marine avec reflets, badge doré
    police:   { shirt: 0x1B2A6B, pants: 0x14205a, shoes: 0x050505, belt: 0x090909, accent: 0xffd700, alt: 0x2a3a8b },
    // Dealer : chemise hawaïenne ouverte colorée
    dealer:   { shirt: 0x228833, pants: 0xddcc88, shoes: 0x221100, belt: 0x443300, accent: 0x44ff66, alt: 0x116622 },
    // Braqueur : tout noir avec gilet tactique
    braqueur: { shirt: 0x080808, pants: 0x080808, shoes: 0x030303, belt: 0x151515, accent: 0x444444, alt: 0x222222 },
    // Civil ivoirien : pagne + chemise imprimée
    civil:    { shirt: 0xEE8822, pants: 0x224466, shoes: 0x331100, belt: 0x1a1a00, accent: 0xffcc44, alt: 0xaa6611 },
  };
  const C = OUTFITS[outfit] ?? OUTFITS.street;

  const shirtMat  = mat(C.shirt, 0.8);
  const pantsMat  = mat(C.pants, 0.82);
  const shoesMat  = mat(C.shoes, 0.55);
  const beltMat   = mat(C.belt,  0.4, 0.3);
  const accentMat = mat(C.accent, 0.5, 0.1);
  const altMat    = mat(C.alt,   0.75);
  const soleMat   = mat(0x111111, 0.95);
  const darkMat   = mat(0x111111, 0.8);

  const group = new THREE.Group();
  // Hauteur totale ~2.1 (tête petite, jambes longues = silhouette GTA)

  // ══ JAMBE GAUCHE ══════════════════════════════════════════════
  const lHip = new THREE.Group(); lHip.position.set(-0.16, 0.62, 0); group.add(lHip);
  const lThigh = new THREE.Group(); lHip.add(lThigh);
  // Cuisse — longue et cylindrique (style GTA)
  const lThMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.095, 0.55, 7), pantsMat);
  lThMesh.position.y = -0.275; lThMesh.castShadow = true; lThigh.add(lThMesh);
  const lKnee = new THREE.Group(); lKnee.position.y = -0.55; lThigh.add(lKnee);
  const lShin = new THREE.Group(); lKnee.add(lShin);
  const lShMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.072, 0.50, 7), pantsMat);
  lShMesh.position.y = -0.25; lShMesh.castShadow = true; lShin.add(lShMesh);
  const lAnkle = new THREE.Group(); lAnkle.position.y = -0.50; lShin.add(lAnkle);
  const lFoot = new THREE.Group(); lAnkle.add(lFoot);
  _buildFoot(lFoot, shoesMat, soleMat, accentMat);

  // ══ JAMBE DROITE ══════════════════════════════════════════════
  const rHip = new THREE.Group(); rHip.position.set(0.16, 0.62, 0); group.add(rHip);
  const rThigh = new THREE.Group(); rHip.add(rThigh);
  const rThMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.095, 0.55, 7), pantsMat);
  rThMesh.position.y = -0.275; rThMesh.castShadow = true; rThigh.add(rThMesh);
  const rKnee = new THREE.Group(); rKnee.position.y = -0.55; rThigh.add(rKnee);
  const rShin = new THREE.Group(); rKnee.add(rShin);
  const rShMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.072, 0.50, 7), pantsMat);
  rShMesh.position.y = -0.25; rShMesh.castShadow = true; rShin.add(rShMesh);
  const rAnkle = new THREE.Group(); rAnkle.position.y = -0.50; rShin.add(rAnkle);
  const rFoot = new THREE.Group(); rAnkle.add(rFoot);
  _buildFoot(rFoot, shoesMat, soleMat, accentMat);

  // ══ BASSIN — large & compact ═══════════════════════════════════
  const pelvis = new THREE.Group(); pelvis.position.set(0, 0.62, 0); group.add(pelvis);
  const pelvisMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.26, 9), pantsMat);
  pelvisMesh.position.y = 0; pelvisMesh.castShadow = true; pelvis.add(pelvisMesh);
  // Ceinture épaisse style GTA
  const beltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.255, 0.06, 9), beltMat);
  beltMesh.position.y = 0.12; pelvis.add(beltMesh);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.018), mat(0xddbb00, 0.2, 0.9));
  buckle.position.set(0, 0.12, 0.262); pelvis.add(buckle);

  // ══ TORSE — large, épaules exagérées GTA ══════════════════════
  const torso = new THREE.Group(); torso.position.set(0, 0.23, 0); pelvis.add(torso);
  // Torse bas
  const torsoLowMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.23, 0.30, 9), shirtMat);
  torsoLowMesh.position.y = 0; torsoLowMesh.castShadow = true; torso.add(torsoLowMesh);
  // Torse haut élargi — les épaules c'est ce qui donne le style GTA
  const torsoUpMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.24, 0.38, 9), shirtMat);
  torsoUpMesh.position.y = 0.33; torsoUpMesh.castShadow = true; torso.add(torsoUpMesh);
  // Pecs / muscles — bosse frontale
  const pectoralL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), shirtMat);
  pectoralL.position.set(-0.12, 0.42, 0.22); pectoralL.scale.set(1, 0.7, 0.6); torso.add(pectoralL);
  const pectoralR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), shirtMat);
  pectoralR.position.set(0.12, 0.42, 0.22); pectoralR.scale.set(1, 0.7, 0.6); torso.add(pectoralR);

  // ══ COU ══════════════════════════════════════════════════════
  const neck = new THREE.Group(); neck.position.set(0, 0.53, 0); torso.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.18, 7), skinMat);
  neckMesh.castShadow = true; neck.add(neckMesh);

  // ══ TÊTE — anguleuse, mâchoire forte, style Vice City ═════════
  const head = new THREE.Group(); head.position.set(0, 0.22, 0); neck.add(head);

  // Crâne — forme ovale aplatie sur les côtés (style cartoon GTA)
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skinMat);
  headMesh.scale.set(1.05, 1.15, 1.0); // plus haut que large
  headMesh.castShadow = true; head.add(headMesh);

  // Mâchoire/joues — boites latérales pour l'aspect anguleux GTA
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.28), skinMat);
  jawMesh.position.set(0, -0.10, 0); jawMesh.castShadow = true; head.add(jawMesh);
  // Menton en boîte
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.18), skinMat);
  chin.position.set(0, -0.185, 0.04); head.add(chin);
  // Front plat
  const forehead = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.22), skinMat);
  forehead.position.set(0, 0.16, -0.02); head.add(forehead);

  // ─ Yeux stylisés GTA : amandes horizontales ───────────────────
  const eyeWhiteMat = mat(0xeeeeee, 1.0);
  const pupilMat    = mat(0x050505, 1.0);
  [-0.10, 0.10].forEach(ex => {
    // Blanc de l'œil — boîte plate (style cartoon)
    const ew = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.035, 0.015), eyeWhiteMat);
    ew.position.set(ex, 0.04, 0.198); head.add(ew);
    // Pupille
    const pu = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.030, 0.015), pupilMat);
    pu.position.set(ex, 0.04, 0.208); head.add(pu);
    // Reflet
    const shine = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.010, 0.010),
      matEmissive(0xffffff, 0xffffff, 0.6));
    shine.position.set(ex + 0.010, 0.047, 0.213); head.add(shine);
  });

  // ─ Sourcils épais ─────────────────────────────────────────────
  const browMat = mat(0x0a0404, 0.9);
  [-0.10, 0.10].forEach((ex, i) => {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.020, 0.015), browMat);
    brow.position.set(ex, 0.083, 0.196);
    brow.rotation.z = i === 0 ? 0.18 : -0.18; // sourcils froncés
    head.add(brow);
  });

  // ─ Nez plat et large ──────────────────────────────────────────
  const noseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.04, 0.040), skinMat);
  noseMesh.position.set(0, -0.008, 0.208); head.add(noseMesh);
  // Bout du nez
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.030, 6, 5), skinMat);
  noseTip.position.set(0, -0.038, 0.222); noseTip.scale.set(1.3, 0.9, 1.0); head.add(noseTip);

  // ─ Bouche — trait horizontal style cartoon ─────────────────────
  const mouthMat = mat(skinColor < 0x300000 ? 0x200808 : 0x3a1410, 0.9);
  const mouthMesh = new THREE.Mesh(new THREE.BoxGeometry(0.100, 0.016, 0.016), mouthMat);
  mouthMesh.position.set(0, -0.096, 0.208); head.add(mouthMesh);
  const lipU = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.020, 0.018), mat(skinColor + 0x0a0302));
  lipU.position.set(0, -0.082, 0.208); head.add(lipU);
  const lipL = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.024, 0.020), mat(skinColor + 0x0a0302));
  lipL.position.set(0, -0.108, 0.206); head.add(lipL);

  // ─ Oreilles stylisées ─────────────────────────────────────────
  [-0.232, 0.232].forEach(ex => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.060, 0.050), skinMat);
    ear.position.set(ex, 0.010, 0); head.add(ear);
  });

  // ─ Cheveux / coiffure par outfit ──────────────────────────────
  _addHairGTA(head, outfit, skinColor);

  // ── Accessoires de visage selon outfit ──
  if (outfit === 'gang' || outfit === 'braqueur') {
    // Bandana
    const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.23, 0.08, 9),
      mat(outfit === 'gang' ? 0x990000 : 0x111111, 0.85));
    bandana.position.set(0, 0.145, 0); head.add(bandana);
    // Nœud de bandana
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.06), mat(C.shirt, 0.85));
    knot.position.set(0, 0.13, -0.22); head.add(knot);
  }
  if (outfit === 'dealer') {
    // Lunettes de soleil style 80s
    _addSunglasses(head, 0x111111);
  }
  if (outfit === 'police') {
    // Casquette de police
    const capBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 9), mat(0x101840, 0.6));
    capBrim.position.set(0, 0.22, 0); head.add(capBrim);
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.10, 9), mat(0x1B2A6B, 0.7));
    capTop.position.set(0, 0.27, 0); head.add(capTop);
    // Visière avant
    const visiere = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.035, 0.14), mat(0x0a0f2a, 0.4));
    visiere.position.set(0, 0.200, 0.16); head.add(visiere);
    // Badge
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.015),
      matEmissive(0xddbb00, 0xffcc00, 0.3));
    badge.position.set(0, 0.26, 0.27); head.add(badge);
  }

  // ══ ÉPAULES — sphères larges style GTA ═══════════════════════
  [-0.35, 0.35].forEach(sx => {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 6), shirtMat);
    shoulder.position.set(sx, 0.50, 0); torso.add(shoulder);
  });

  // ══ BRAS GAUCHE ══════════════════════════════════════════════
  const lShoulder = new THREE.Group(); lShoulder.position.set(-0.36, 0.48, 0); torso.add(lShoulder);
  const lUpperArm = new THREE.Group(); lShoulder.add(lUpperArm);
  // Bras épais — style musclé GTA
  const lUAMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.075, 0.38, 7), shirtMat);
  lUAMesh.position.y = -0.19; lUAMesh.castShadow = true; lUpperArm.add(lUAMesh);
  const lElbow = new THREE.Group(); lElbow.position.y = -0.38; lUpperArm.add(lElbow);
  const lForeArm = new THREE.Group(); lElbow.add(lForeArm);
  const lFAMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.058, 0.34, 7), skinMat);
  lFAMesh.position.y = -0.17; lFAMesh.castShadow = true; lForeArm.add(lFAMesh);
  const lHand = new THREE.Group(); lHand.position.y = -0.34; lForeArm.add(lHand);
  // Main — poing stylisé rectangulaire GTA
  const lHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.12), skinMat);
  lHandMesh.castShadow = true; lHand.add(lHandMesh);
  // Doigts suggérés
  const lFingersM = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.032, 0.12), skinMat);
  lFingersM.position.set(0, -0.06, 0); lHand.add(lFingersM);

  // ══ BRAS DROIT ════════════════════════════════════════════════
  const rShoulder = new THREE.Group(); rShoulder.position.set(0.36, 0.48, 0); torso.add(rShoulder);
  const rUpperArm = new THREE.Group(); rShoulder.add(rUpperArm);
  const rUAMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.075, 0.38, 7), shirtMat);
  rUAMesh.position.y = -0.19; rUAMesh.castShadow = true; rUpperArm.add(rUAMesh);
  const rElbow = new THREE.Group(); rElbow.position.y = -0.38; rUpperArm.add(rElbow);
  const rForeArm = new THREE.Group(); rElbow.add(rForeArm);
  const rFAMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.058, 0.34, 7), skinMat);
  rFAMesh.position.y = -0.17; rFAMesh.castShadow = true; rForeArm.add(rFAMesh);
  const rHand = new THREE.Group(); rHand.position.y = -0.34; rForeArm.add(rHand);
  const rHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.12), skinMat);
  rHandMesh.castShadow = true; rHand.add(rHandMesh);
  const rFingersM = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.032, 0.12), skinMat);
  rFingersM.position.set(0, -0.06, 0); rHand.add(rFingersM);

  // ── Accessoires corps par outfit ──────────────────────────────
  if (outfit === 'police') {
    // Gilet de police
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.44, 0.28), mat(0x1B2A6B, 0.65));
    vest.position.set(0, 0.30, 0); torso.add(vest);
    // Badge sur la poitrine
    const bdg = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.08, 0.02),
      matEmissive(0xddbb00, 0xffcc00, 0.4));
    bdg.position.set(-0.12, 0.42, 0.235); torso.add(bdg);
  }
  if (outfit === 'braqueur') {
    // Gilet tactique
    const tacVest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.46, 0.30), mat(0x1a1a1a, 0.7));
    tacVest.position.set(0, 0.30, 0); torso.add(tacVest);
    // Poches tactiques
    [-0.18, 0.18].forEach(px => {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.045), mat(0x111111, 0.8));
      pocket.position.set(px, 0.28, 0.175); torso.add(pocket);
    });
  }
  if (outfit === 'dealer') {
    // Chemise hawaïenne ouverte — liseré coloré
    const shirtOpen = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.02), accentMat);
    shirtOpen.position.set(0, 0.30, 0.225); torso.add(shirtOpen);
    // Chaîne en or
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.008, 6, 16), matEmissive(0xddaa00, 0xffcc00, 0.3));
    chain.rotation.x = Math.PI / 2; chain.position.set(0, 0.42, 0.20); torso.add(chain);
  }
  if (outfit === 'gang') {
    // Débardeur sans manches — voir les biceps
    const tanktop = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.235, 0.38, 9), mat(C.shirt, 0.8));
    tanktop.position.y = 0.33; torso.add(tanktop);
    // Tatouage suggéré (bande sombre sur le bras)
    const tattoo = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.08, 7), mat(0x0a0a14, 0.7));
    tattoo.position.set(-0.065, -0.12, 0); lUpperArm.add(tattoo);
  }
  if (outfit === 'civil') {
    // Tissu imprimé ivoirien — bande de couleur
    const printBand = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.240, 0.12, 9), accentMat);
    printBand.position.set(0, 0.14, 0); torso.add(printBand);
  }
  if (outfit === 'street') {
    // Chaîne fine
    const chain2 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.005, 5, 14), matEmissive(0xccaa00, 0xffdd00, 0.25));
    chain2.rotation.x = Math.PI / 2; chain2.position.set(0, 0.44, 0.22); torso.add(chain2);
    // Logo sur tshirt
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.018), mat(C.accent, 0.4));
    logo.position.set(0, 0.40, 0.230); torso.add(logo);
  }

  // ══ OS (pour animation) ══════════════════════════════════════
  const bones = {
    root: group, pelvis, torso, neck, head,
    lUpperArm, lElbow, lForeArm, lHand,
    rUpperArm, rElbow, rForeArm, rHand,
    lHip, lThigh, lKnee, lShin, lFoot,
    rHip, rThigh, rKnee, rShin, rFoot,
  };

  // ══ ARME PORTÉE ══════════════════════════════════════════════
  let weaponMesh = null;
  const WEAPON_OFFSETS = {
    pistol:  { pos: [0.02, -0.06, 0.06], rot: [0.1, 0, 0] },
    ak47:    { pos: [0.01, -0.07, 0.10], rot: [0.05, 0, 0] },
    knife:   { pos: [0, -0.04, 0.07], rot: [0, 0, Math.PI * 0.08] },
    shotgun: { pos: [0, -0.07, 0.10], rot: [0, 0, 0] },
  };
  function attachWeapon(type) {
    if (weaponMesh) { rHand.remove(weaponMesh); weaponMesh = null; }
    const g = buildWeapon(type);
    if (g) {
      weaponMesh = g;
      const off = WEAPON_OFFSETS[type];
      if (off) { g.position.set(...off.pos); g.rotation.set(...off.rot); }
      rHand.add(g);
    }
  }

  // ══ SYSTÈME D'ANIMATION ══════════════════════════════════════
  let currentAnim = 'idle';
  let animTime    = 0;
  let animSpeed   = 1;
  let dead        = false;

  const ANIMS = {
    idle(t) {
      const breath = Math.sin(t * 1.1) * 0.010;
      pelvis.position.y = 0.62 + breath;
      torso.rotation.x  = Math.sin(t * 0.7) * 0.008;
      torso.rotation.z  = Math.sin(t * 0.5) * 0.009;
      // Bras légèrement écartés (gros bras style GTA)
      lUpperArm.rotation.z =  0.28 + Math.sin(t * 1.0) * 0.015;
      rUpperArm.rotation.z = -0.28 - Math.sin(t * 1.0) * 0.015;
      lUpperArm.rotation.x = Math.sin(t * 0.6) * 0.025;
      rUpperArm.rotation.x = -Math.sin(t * 0.6) * 0.025;
      lElbow.rotation.x = 0.10 + Math.sin(t * 0.8) * 0.015;
      rElbow.rotation.x = 0.10 + Math.sin(t * 0.8) * 0.015;
      head.rotation.y = Math.sin(t * 0.3) * 0.07;
      head.rotation.x = Math.sin(t * 0.5) * 0.018;
      lThigh.rotation.x =  Math.sin(t * 0.35) * 0.018;
      rThigh.rotation.x = -Math.sin(t * 0.35) * 0.018;
    },

    walk(t) {
      const s = Math.sin(t * 2.8);
      const c = Math.cos(t * 2.8);
      pelvis.position.y = 0.62 + Math.abs(s) * 0.030;
      pelvis.rotation.z = s * 0.040;
      torso.rotation.y  = s * 0.08; // légère torsion
      torso.rotation.x  = 0.02;
      head.rotation.y   = -s * 0.04;
      // Bras opposés aux jambes (marche naturelle)
      lUpperArm.rotation.x = -s * 0.50;
      rUpperArm.rotation.x =  s * 0.50;
      lUpperArm.rotation.z =  0.20;
      rUpperArm.rotation.z = -0.20;
      lElbow.rotation.x = Math.max(0,  s) * 0.35;
      rElbow.rotation.x = Math.max(0, -s) * 0.35;
      lThigh.rotation.x =  s * 0.70;
      rThigh.rotation.x = -s * 0.70;
      lKnee.rotation.x  = Math.max(0, -s) * 0.55;
      rKnee.rotation.x  = Math.max(0,  s) * 0.55;
      lFoot.rotation.x  = -Math.max(0, -s) * 0.20;
      rFoot.rotation.x  = -Math.max(0,  s) * 0.20;
    },

    run(t) {
      const s = Math.sin(t * 4.5);
      const c = Math.cos(t * 4.5);
      pelvis.position.y = 0.62 + Math.abs(s) * 0.055;
      pelvis.rotation.z = s * 0.060;
      torso.rotation.x  = -0.22;
      torso.rotation.y  = s * 0.14;
      head.rotation.x   = -0.08;
      head.rotation.y   = -s * 0.05;
      lUpperArm.rotation.x = -s * 1.10;
      rUpperArm.rotation.x =  s * 1.10;
      lUpperArm.rotation.z =  0.18;
      rUpperArm.rotation.z = -0.18;
      lElbow.rotation.x = Math.max(0,  s) * 0.90;
      rElbow.rotation.x = Math.max(0, -s) * 0.90;
      lThigh.rotation.x =  s * 1.20;
      rThigh.rotation.x = -s * 1.20;
      lKnee.rotation.x  = Math.max(0, -s) * 1.10;
      rKnee.rotation.x  = Math.max(0,  s) * 1.10;
      lFoot.rotation.x  = -0.25;
      rFoot.rotation.x  = -0.25;
    },

    shoot(t) {
      const kick = Math.sin(t * 8) * Math.exp(-t * 2.5) * 0.25;
      pelvis.position.y = 0.62;
      torso.rotation.x  = -0.15;
      head.rotation.x   = -0.08;
      // Bras en position de tir — tendu vers l'avant
      rUpperArm.rotation.x = -1.0;
      rUpperArm.rotation.z = -0.08;
      rElbow.rotation.x    = 0.40;
      // Recul de tir
      rUpperArm.rotation.x -= kick;
      torso.rotation.x -= kick * 0.5;
      // Bras gauche de soutien
      lUpperArm.rotation.x = -0.7;
      lUpperArm.rotation.z =  0.25;
      lElbow.rotation.x    = 0.60;
    },

    jump(t) {
      const p  = Math.min(t * 2.2, 1);
      const p2 = Math.max(0, Math.min((t - 0.45) * 2.5, 1));
      pelvis.position.y = 0.62 + Math.sin(Math.PI * Math.min(t * 1.6, 1)) * 0.35;
      torso.rotation.x  = -0.18 + p * 0.12;
      lThigh.rotation.x =  p * 0.65 - p2 * 0.35;
      rThigh.rotation.x =  p * 0.65 - p2 * 0.35;
      lKnee.rotation.x  =  p * 1.10 - p2 * 0.55;
      rKnee.rotation.x  =  p * 1.10 - p2 * 0.55;
      lUpperArm.rotation.x = -0.55 + p2 * 0.35;
      rUpperArm.rotation.x = -0.55 + p2 * 0.35;
      lUpperArm.rotation.z =  0.40;
      rUpperArm.rotation.z = -0.40;
    },

    die(t) {
      const p    = Math.min(t / 1.0, 1);
      const ease = p * p * (3 - 2 * p);
      pelvis.position.y    = 0.62 - ease * 0.60;
      pelvis.rotation.z    = ease * Math.PI * 0.54;
      pelvis.rotation.x    = ease * 0.32;
      torso.rotation.x     = ease * 0.48;
      torso.rotation.z     = ease * 0.18;
      lThigh.rotation.x    = ease * 0.80;
      rThigh.rotation.x    = ease * 0.48;
      lKnee.rotation.x     = ease * 0.95;
      rKnee.rotation.x     = ease * 0.52;
      lUpperArm.rotation.z =  ease * 1.40;
      lUpperArm.rotation.x =  ease * 0.45;
      rUpperArm.rotation.z = -ease * 0.95;
      rUpperArm.rotation.x =  ease * 0.35;
      lElbow.rotation.x    = ease * 0.65;
      rElbow.rotation.x    = ease * 0.45;
      head.rotation.z      = ease * 0.22;
      head.rotation.x      = ease * 0.30;
    },

    crouch(t) {
      const breath = Math.sin(t * 1.0) * 0.006;
      pelvis.position.y = 0.36 + breath;
      torso.rotation.x  = -0.28;
      head.rotation.x   = -0.14;
      lThigh.rotation.x =  1.10; rThigh.rotation.x =  1.10;
      lKnee.rotation.x  =  1.50; rKnee.rotation.x  =  1.50;
      lFoot.rotation.x  = -0.38; rFoot.rotation.x  = -0.38;
      lUpperArm.rotation.z =  0.30; rUpperArm.rotation.z = -0.30;
      lUpperArm.rotation.x =  Math.sin(t * 0.6) * 0.025;
      rUpperArm.rotation.x = -Math.sin(t * 0.6) * 0.025;
      lElbow.rotation.x = 0.15; rElbow.rotation.x = 0.15;
    },

    crouch_walk(t) {
      const s = Math.sin(t * 3.2);
      pelvis.position.y = 0.34 + Math.abs(s) * 0.025;
      pelvis.rotation.z = s * 0.028;
      torso.rotation.x  = -0.30;
      torso.rotation.y  = s * 0.07;
      head.rotation.x   = -0.16;
      lThigh.rotation.x =  0.90 + s * 0.38; rThigh.rotation.x =  0.90 - s * 0.38;
      lKnee.rotation.x  =  1.25 + Math.max(0, -s) * 0.32; rKnee.rotation.x  =  1.25 + Math.max(0, s) * 0.32;
      lUpperArm.rotation.x = -s * 0.25; rUpperArm.rotation.x =  s * 0.25;
      lUpperArm.rotation.z =  0.22; rUpperArm.rotation.z = -0.22;
    },

    hit(t) {
      const shock = Math.max(0, 1 - t * 2.8);
      pelvis.position.y = 0.62 - shock * 0.09;
      torso.rotation.x  =  shock * 0.50;
      torso.rotation.z  =  shock * 0.14;
      head.rotation.x   =  shock * 0.35;
      lUpperArm.rotation.z =  0.28 + shock * 0.90;
      rUpperArm.rotation.z = -0.28 - shock * 0.90;
      lUpperArm.rotation.x =  shock * 0.35;
      rUpperArm.rotation.x =  shock * 0.35;
      lKnee.rotation.x = shock * 0.28;
      rKnee.rotation.x = shock * 0.28;
    },

    swim(t) {
      const s = Math.sin(t * 2.8);
      pelvis.position.y = 0.32 + Math.sin(t * 2.8) * 0.04;
      torso.rotation.x  = -1.25;
      torso.rotation.z  =  s * 0.14;
      head.rotation.x   =  0.70;
      head.rotation.y   =  s * 0.22;
      lUpperArm.rotation.x = -s * 1.50; rUpperArm.rotation.x =  s * 1.50;
      lUpperArm.rotation.z =  0.12; rUpperArm.rotation.z = -0.12;
      lElbow.rotation.x = Math.max(0,  s) * 0.65;
      rElbow.rotation.x = Math.max(0, -s) * 0.65;
      const c = Math.cos(t * 2.8);
      lThigh.rotation.x =  c * 0.38; rThigh.rotation.x = -c * 0.38;
    },
  };

  // ── Blending ──────────────────────────────────────────────────
  const _boneArray = [pelvis, torso, neck, head,
    lUpperArm, lElbow, lForeArm, lHand,
    rUpperArm, rElbow, rForeArm, rHand,
    lHip, lThigh, lKnee, lShin, lFoot,
    rHip, rThigh, rKnee, rShin, rFoot];

  let blendFrom  = null;
  let blendAlpha = 1.0;

  function snapshotBones() {
    const snap = {};
    _boneArray.forEach((b, i) => {
      snap[i] = { rx: b.rotation.x, ry: b.rotation.y, rz: b.rotation.z,
                  py: b === pelvis ? b.position.y : null };
    });
    return snap;
  }

  function resetBones() {
    if (dead) return;
    _boneArray.forEach(b => b.rotation.set(0, 0, 0));
    pelvis.position.set(0, 0.62, 0);
    lHip.position.set(-0.16, 0.62, 0);
    rHip.position.set( 0.16, 0.62, 0);
  }

  function applyBlend() {
    if (!blendFrom || blendAlpha >= 1.0) return;
    _boneArray.forEach((b, i) => {
      const f = blendFrom[i]; if (!f) return;
      b.rotation.x = f.rx + (b.rotation.x - f.rx) * blendAlpha;
      b.rotation.y = f.ry + (b.rotation.y - f.ry) * blendAlpha;
      b.rotation.z = f.rz + (b.rotation.z - f.rz) * blendAlpha;
      if (f.py !== null) b.position.y = f.py + (b.position.y - f.py) * blendAlpha;
    });
  }

  function setAnim(name, speed = 1) {
    if (dead && name !== 'die') return;
    if (currentAnim !== name) {
      blendFrom  = snapshotBones();
      blendAlpha = 0.0;
      currentAnim = name;
      animTime    = 0;
    }
    animSpeed = speed;
  }

  let _prevAnim = 'idle';
  let _hitPending = false;

  function triggerHit() {
    if (dead) return;
    _prevAnim   = currentAnim !== 'hit' ? currentAnim : _prevAnim;
    _hitPending = false;
    setAnim('hit');
    _hitPending = true;
  }

  function update(dt) {
    if (dead) return;
    animTime += dt * animSpeed * 1000;
    if (blendAlpha < 1.0) blendAlpha = Math.min(1.0, blendAlpha + dt * 8.0);
    resetBones();
    const fn = ANIMS[currentAnim] ?? ANIMS.idle;
    fn(animTime / 1000);
    applyBlend();
    if (_hitPending && animTime >= 450) {
      _hitPending = false; setAnim(_prevAnim, animSpeed);
    }
  }

  function revive() {
    dead = false; currentAnim = 'idle'; animTime = 0; blendAlpha = 1.0;
    resetBones(); group.visible = true;
  }

  function isDead() { return dead; }

  // ── Die : freeze ──
  const _origUpdate = update;
  let _dieTime = 0;
  function updateWithDie(dt) {
    if (dead) {
      _dieTime += dt;
      if (_dieTime < 1.1) {
        animTime += dt * 1000;
        resetBones();
        ANIMS.die(animTime / 1000);
      }
      return;
    }
    _origUpdate(dt);
  }

  return {
    group, bones,
    setAnim, update: updateWithDie,
    attachWeapon, triggerHit, revive, isDead,
    get currentAnim() { return currentAnim; },
    _deadSet: (v) => {
      dead = v;
      if (v) { _dieTime = 0; setAnim('die'); }
    },
  };
}

/* ── Helpers internes ────────────────────────────────────────────── */
function _buildFoot(footGroup, shoesMat, soleMat, accentMat) {
  // Semelle principale — forme trapézoïdale
  const main = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.26), shoesMat);
  main.position.set(0, 0.035, 0.05); main.castShadow = true;
  footGroup.add(main);
  // Semelle (outsole) — légèrement plus large
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.148, 0.025, 0.275), soleMat);
  sole.position.set(0, -0.012, 0.05); sole.receiveShadow = true;
  footGroup.add(sole);
  // Talon
  const heel = new THREE.Mesh(new THREE.BoxGeometry(0.130, 0.045, 0.080), shoesMat);
  heel.position.set(0, 0.010, -0.10); footGroup.add(heel);
  // Bande de couleur (swoosh style)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.042, 0.20), accentMat);
  stripe.position.set(0.075, 0.030, 0.04); footGroup.add(stripe);
}

function _addHairGTA(headMesh, outfit, skinColor) {
  const darkHair = 0x0d0808;
  if (outfit === 'gang' || outfit === 'braqueur') return; // bandana couvre les cheveux

  if (outfit === 'police') return; // casquette

  if (outfit === 'dealer') {
    // Dreadlocks courtes
    const dreadsMat = new THREE.MeshStandardMaterial({ color: 0x1a0e06, roughness: 0.95 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.010, 0.18, 5), dreadsMat);
      dr.position.set(Math.sin(a) * 0.17, 0.14 + Math.random() * 0.04, Math.cos(a) * 0.17);
      dr.rotation.x = Math.sin(a) * 0.35; dr.rotation.z = Math.cos(a) * 0.35;
      headMesh.add(dr);
    }
    // Haut de la tête
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 6), dreadsMat);
    crown.position.y = 0.12; crown.scale.set(1, 0.40, 1);
    headMesh.add(crown);
    return;
  }

  if (outfit === 'civil') {
    // Cheveux rasés courts
    const capHair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 9, 7), new THREE.MeshStandardMaterial({color: darkHair, roughness: 0.9}));
    capHair.position.y = 0.06; capHair.scale.set(1.04, 0.45, 1.04);
    headMesh.add(capHair);
    return;
  }

  // Street & default : casquette à l'envers / dégradé
  const capMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.75 });
  const capBase = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.242, 0.09, 9), capMat);
  capBase.position.y = 0.195; headMesh.add(capBase);
  const capTop2 = new THREE.Mesh(new THREE.SphereGeometry(0.228, 9, 7), capMat);
  capTop2.position.y = 0.220; capTop2.scale.set(1, 0.65, 1); headMesh.add(capTop2);
  // Visière de casquette (à l'envers — vers l'arrière)
  const viziere = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.028, 0.15), capMat);
  viziere.position.set(0, 0.175, -0.185); headMesh.add(viziere);
}

function _addSunglasses(headGroup, frameCo) {
  const frameMat = new THREE.MeshStandardMaterial({ color: frameCo, roughness: 0.3, metalness: 0.6 });
  const lensMat  = new THREE.MeshStandardMaterial({ color: 0x000408, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.88 });
  // Verres
  [-0.10, 0.10].forEach(ex => {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.042, 0.012), lensMat);
    lens.position.set(ex, 0.040, 0.205); headGroup.add(lens);
  });
  // Monture
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.010, 0.008), frameMat);
  bridge.position.set(0, 0.040, 0.204); headGroup.add(bridge);
  // Branches
  [-0.148, 0.148].forEach(ex => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.010, 0.12), frameMat);
    arm.position.set(ex, 0.040, 0.150); headGroup.add(arm);
  });
}

/* ══════════════════════════════════════════════════════════════════
   buildNPC — Wrapper avec IA intégrée
══════════════════════════════════════════════════════════════════ */
export function buildNPC(skinTone = 'medium', outfit = 'civil', x = 0, z = 0) {
  const char = buildCharacter(skinTone, outfit);
  char.group.position.set(x, 0, z);
  char.group.rotation.y = Math.random() * Math.PI * 2;

  // Légère variation de taille pour la diversité
  const scaleVar = 0.90 + Math.random() * 0.18;
  char.group.scale.setScalar(scaleVar);

  const npcData = {
    hp: 100, state: 'patrol',
    speed: 0.025 + Math.random() * 0.015,
    alertRadius: outfit === 'police' ? 28 : outfit === 'gang' ? 22 : 18,
    walkCenter: { x, z },
    walkAngle: Math.random() * Math.PI * 2,
    walkRadius: 4 + Math.random() * 6,
    timer: 0,
    shootCooldown: 0,
    idleTalkTimer: Math.random() * 6000,
    backupCalled: false,
  };

  function takeDamage(amount) {
    npcData.hp = Math.max(0, npcData.hp - amount);
    char.triggerHit();
    if (npcData.hp <= 0) {
      npcData.state = 'dead';
      char._deadSet(true);
      return true; // killed
    }
    return false;
  }

  return {
    group: char.group,
    bones: char.bones,
    setAnim:      char.setAnim,
    update:       char.update,
    attachWeapon: char.attachWeapon,
    triggerHit:   char.triggerHit,
    revive:       char.revive,
    npc: { ...npcData, takeDamage },
  };
}

/* ══════════════════════════════════════════════════════════════════
   buildWeapon — Armes stylisées GTA
══════════════════════════════════════════════════════════════════ */
export function buildWeapon(type) {
  if (!type || type === 'fists') return null;
  const g = new THREE.Group();

  if (type === 'pistol') {
    // Corps du pistolet
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.095, 0.155),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.75 }));
    g.add(body);
    // Canon
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.120, 7),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.2, metalness: 0.9 }));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.018, 0.125);
    g.add(barrel);
    // Poignée
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.090, 0.075),
      new THREE.MeshStandardMaterial({ color: 0x2a1510, roughness: 0.85 }));
    grip.position.set(0, -0.082, -0.015); g.add(grip);
    // Gâchette
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.025, 0.010),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 }));
    trigger.position.set(0, -0.025, 0.030); g.add(trigger);
  }
  else if (type === 'ak47') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.8 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a2a0a, roughness: 0.85 });
    // Receveur
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.068, 0.300), bodyMat);
    g.add(receiver);
    // Canon
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.250, 7), bodyMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.018, 0.270); g.add(barrel);
    // Chargeur courbé
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.110, 0.045), bodyMat);
    mag.position.set(0, -0.085, 0.020); mag.rotation.x = 0.22; g.add(mag);
    // Crosse en bois
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.052, 0.155), woodMat);
    stock.position.set(0, -0.012, -0.220); g.add(stock);
    // Poignée pistolet bois
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.095, 0.065), woodMat);
    grip.position.set(0, -0.080, -0.045); g.add(grip);
    // Garde main
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.040, 0.140), woodMat);
    handguard.position.set(0, -0.012, 0.130); g.add(handguard);
  }
  else if (type === 'knife') {
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.15, metalness: 0.95 });
    const gripMat  = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.85 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.170, 0.028), bladeMat);
    blade.position.y = 0.085; g.add(blade);
    // Pointe
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.014, 0.040, 4), bladeMat);
    tip.rotation.x = Math.PI; tip.position.y = 0.190; g.add(tip);
    // Garde
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.012, 0.030), bladeMat);
    g.add(guard);
    // Poignée
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.090, 7), gripMat);
    grip.position.y = -0.052; g.add(grip);
  }

  return g;
}

/* ══════════════════════════════════════════════════════════════════
   LOD — Niveau de détail selon distance caméra
══════════════════════════════════════════════════════════════════ */
export class CharacterLOD {
  constructor(char, camera) {
    this._char = char;
    this._cam  = camera;
    this._level = 'high';
    this._camPos = new THREE.Vector3();
  }
  update() {
    this._cam.getWorldPosition(this._camPos);
    const d = this._char.group.position.distanceTo(this._camPos);
    let newLevel;
    if      (d < 18) newLevel = 'high';
    else if (d < 45) newLevel = 'med';
    else if (d < 90) newLevel = 'low';
    else             newLevel = 'culled';
    if (newLevel !== this._level) {
      this._level = newLevel;
      this._apply();
    }
  }
  _apply() {
    if (this._level === 'culled') {
      this._char.group.visible = false; return;
    }
    this._char.group.visible = true;
    this._char.group.traverse(m => {
      if (!m.isMesh) return;
      if (this._level === 'high') {
        m.visible = true; m.castShadow = true; m.receiveShadow = true;
      } else if (this._level === 'med') {
        const geo = m.geometry;
        const isDetail = geo?.parameters &&
          (('radius' in geo.parameters && geo.parameters.radius < 0.012) ||
           ('width'  in geo.parameters && geo.parameters.width  < 0.018));
        m.visible = !isDetail; m.castShadow = true; m.receiveShadow = false;
      } else {
        m.visible = m === this._char.bones?.torso?.children[0] ||
                    m === this._char.bones?.pelvis?.children[0] ||
                    m === this._char.bones?.head?.children[0];
        m.castShadow = false; m.receiveShadow = false;
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════════════
   CharacterAudio — Sons positionnels synthétiques
══════════════════════════════════════════════════════════════════ */
export class CharacterAudio {
  constructor(charGroup, camera, opts = {}) {
    this._group   = charGroup;
    this._cam     = camera;
    this._maxDist = opts.maxDist ?? 32;
    this._vol     = opts.volume  ?? 1.0;
    this._ctx     = null;
    this._camPos  = new THREE.Vector3();
    this._srcPos  = new THREE.Vector3();
  }
  _ensureCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  }
  _gainFromDist() {
    this._cam.getWorldPosition(this._camPos);
    this._group.getWorldPosition(this._srcPos);
    return Math.max(0, 1 - this._camPos.distanceTo(this._srcPos) / this._maxDist) * this._vol;
  }
  play(name) {
    const gain = this._gainFromDist();
    if (gain <= 0.001) return;
    const ctx = this._ensureCtx();
    const SOUNDS = {
      step:      () => { const b=ctx.createBuffer(1,ctx.sampleRate*0.06,ctx.sampleRate); const d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length); const s=ctx.createBufferSource();s.buffer=b; const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=280;s.connect(f);return{src:s,out:f}; },
      run_step:  () => { const b=ctx.createBuffer(1,ctx.sampleRate*0.04,ctx.sampleRate); const d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length)*1.4; const s=ctx.createBufferSource();s.buffer=b; const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=350;s.connect(f);return{src:s,out:f}; },
      hit:       () => { const o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(180,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(60,ctx.currentTime+0.12);return{src:o,out:o,duration:0.14}; },
      shoot:     () => { const b=ctx.createBuffer(1,ctx.sampleRate*0.12,ctx.sampleRate); const d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*0.025)); const s=ctx.createBufferSource();s.buffer=b; const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=800;s.connect(f);return{src:s,out:f}; },
      die:       () => { const b=ctx.createBuffer(1,ctx.sampleRate*0.35,ctx.sampleRate); const d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*0.12))*2; const s=ctx.createBufferSource();s.buffer=b; const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=200;s.connect(f);return{src:s,out:f}; },
    };
    const def = SOUNDS[name]; if (!def) return;
    const { src, out, duration } = def();
    const gainNode = ctx.createGain(); gainNode.gain.value = gain;
    out.connect(gainNode); gainNode.connect(ctx.destination);
    if (src.start) src.start(0);
    if (duration) src.stop(ctx.currentTime + duration);
  }
  suspend() { this._ctx?.suspend(); }
  resume()  { this._ctx?.resume(); }
}
