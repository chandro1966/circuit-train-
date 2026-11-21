import * as THREE from 'three';
import {
  FARM_COURTYARD_CENTER,
  GRAND_MEADOW_BOUNDS,
  getTerrainHeight,
} from '../sim/railwayMath';
import type { ProceduralTexturePack } from './textures';

export interface FarmAndMeadowResult {
  group: THREE.Group;
  updateFarmLife: (elapsed: number) => void;
  setNightFactor: (nightFactor: number) => void;
  dispose: () => void;
}

interface AnimatedCow {
  headGroup: THREE.Group;
  basePitch: number;
  phase: number;
  grazing: boolean;
}

/**
 * Builds the new Western Rural Wing on the doubled exhibition plateau:
 * - Traditional French/Alpine Farmstead (Corps de ferme, stone & timber barn, grain silo, tractor + hay trailer)
 * - Grand Pré aux Vaches (large fenced green meadow with open farm gate, stone water trough, hay feeder,
 *   golden hay bales, plowed crop rows, and a lively herd of 14 composite Holstein & brown cows).
 */
export function buildFarmAndMeadow(textures: ProceduralTexturePack): FarmAndMeadowResult {
  const group = new THREE.Group();
  group.name = 'FarmAndMeadow';

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Night-responsive emissive materials
  const farmWindowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b4d63,
      emissive: 0xffc668,
      emissiveIntensity: 0.1,
      roughness: 0.18,
      metalness: 0.28,
    })
  );
  const yardLampMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfbf0d8,
      emissive: 0xffd27a,
      emissiveIntensity: 0.2,
      roughness: 0.22,
    })
  );
  const tractorHeadlightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfff6dc,
      emissive: 0xffe8a0,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    })
  );

  // Architectural & rural PBR materials
  const plasterMat = track(new THREE.MeshStandardMaterial({ color: 0xefe3cb, roughness: 0.86 }));
  const stoneWallMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd6cfc2,
      map: textures.stoneMap,
      bumpMap: textures.stoneBump,
      bumpScale: 0.1,
      roughness: 0.88,
    })
  );
  const darkTimberMat = track(new THREE.MeshStandardMaterial({ color: 0x4c311e, roughness: 0.9 }));
  const barnPlankMat = track(new THREE.MeshStandardMaterial({ color: 0x7c492d, roughness: 0.88 }));
  const shutterBlueMat = track(new THREE.MeshStandardMaterial({ color: 0x4b6c88, roughness: 0.72 }));
  const tileRoofMat = track(new THREE.MeshStandardMaterial({ color: 0x9c4530, roughness: 0.78 }));
  const slateRoofMat = track(new THREE.MeshStandardMaterial({ color: 0x3b444f, roughness: 0.74 }));
  const brickMat = track(new THREE.MeshStandardMaterial({ color: 0x914839, roughness: 0.85 }));
  const siloConcreteMat = track(new THREE.MeshStandardMaterial({ color: 0xbeb9ad, roughness: 0.82 }));
  const galvanizedMat = track(new THREE.MeshStandardMaterial({ color: 0xaab4be, roughness: 0.34, metalness: 0.72 }));
  const fenceWoodMat = track(new THREE.MeshStandardMaterial({ color: 0x7a593c, roughness: 0.92 }));
  const hayMat = track(new THREE.MeshStandardMaterial({ color: 0xd7b556, roughness: 0.94 }));
  const gravelMat = track(new THREE.MeshStandardMaterial({ color: 0xb3a58c, roughness: 0.95 }));
  const soilMat = track(new THREE.MeshStandardMaterial({ color: 0x6b4e34, roughness: 0.96 }));
  const cropMat = track(new THREE.MeshStandardMaterial({ color: 0xc9a846, roughness: 0.9 }));
  const waterMat = track(
    new THREE.MeshStandardMaterial({ color: 0x3f8ca4, roughness: 0.14, metalness: 0.25 })
  );

  // =========================================================================
  // 1. GRAVEL FARMYARD COURTYARD & DIRT LANE TO MEADOW GATE
  // =========================================================================
  const yardY = getTerrainHeight(FARM_COURTYARD_CENTER.x, FARM_COURTYARD_CENTER.z) + 0.032;
  const yardGeo = track(new THREE.CircleGeometry(6.2, 24));
  yardGeo.rotateX(-Math.PI / 2);
  const yardPad = new THREE.Mesh(yardGeo, gravelMat);
  yardPad.position.set(-34.2, yardY, 16.0);
  yardPad.receiveShadow = true;
  group.add(yardPad);

  // Gravel apron connecting the Farm Roundabout north to the open wooden meadow gate
  const laneGeo = track(new THREE.PlaneGeometry(2.5, 4.4));
  laneGeo.rotateX(-Math.PI / 2);
  const laneMesh = new THREE.Mesh(laneGeo, gravelMat);
  laneMesh.position.set(-34.6, yardY + 0.008, 11.4);
  laneMesh.receiveShadow = true;
  group.add(laneMesh);

  // =========================================================================
  // 2. CORPS DE FERME (TRADITIONAL STONE & PLASTER FARMHOUSE)
  // =========================================================================
  const house = new THREE.Group();
  const hx = -41.1;
  const hz = 16.6;
  const hy = getTerrainHeight(hx, hz);
  house.position.set(hx, hy, hz);
  house.rotation.y = 0.14;

  // Deep stone foundation plinth
  const hPlinth = new THREE.Mesh(track(new THREE.BoxGeometry(5.6, 1.3, 3.8)), stoneWallMat);
  hPlinth.position.y = -0.35;
  house.add(hPlinth);

  // Ground floor dressed stone + upper plaster facade
  const hLower = new THREE.Mesh(track(new THREE.BoxGeometry(5.4, 1.45, 3.6)), stoneWallMat);
  hLower.position.y = 0.85;
  hLower.castShadow = true;
  hLower.receiveShadow = true;
  house.add(hLower);

  const hUpper = new THREE.Mesh(track(new THREE.BoxGeometry(5.36, 1.35, 3.56)), plasterMat);
  hUpper.position.y = 2.22;
  hUpper.castShadow = true;
  hUpper.receiveShadow = true;
  house.add(hUpper);

  // Timber eaves & half-timber beams
  const hBelt = new THREE.Mesh(track(new THREE.BoxGeometry(5.46, 0.14, 3.66)), darkTimberMat);
  hBelt.position.y = 1.56;
  house.add(hBelt);

  // Pitched terracotta gable roof
  const hRoofShape = new THREE.Shape();
  hRoofShape.moveTo(-2.15, 0);
  hRoofShape.lineTo(0, 1.75);
  hRoofShape.lineTo(2.15, 0);
  hRoofShape.closePath();
  const hRoofGeo = track(new THREE.ExtrudeGeometry(hRoofShape, { depth: 5.9, bevelEnabled: false }));
  hRoofGeo.rotateY(Math.PI / 2);
  hRoofGeo.translate(-2.95, 0, 0);
  const hRoof = new THREE.Mesh(hRoofGeo, tileRoofMat);
  hRoof.position.y = 2.86;
  hRoof.castShadow = true;
  hRoof.receiveShadow = true;
  house.add(hRoof);

  // Stone chimney stack
  const hChimney = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 1.4, 0.55)), brickMat);
  hChimney.position.set(-1.45, 4.15, -0.3);
  hChimney.castShadow = true;
  house.add(hChimney);

  // Dormer window overlooking the courtyard (+X / +Z facing)
  const dormer = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.9, 0.95)), plasterMat);
  dormer.position.set(0.4, 3.42, 1.15);
  house.add(dormer);
  const dormerRoof = new THREE.Mesh(track(new THREE.ConeGeometry(0.82, 0.52, 4)), tileRoofMat);
  dormerRoof.rotation.y = Math.PI / 4;
  dormerRoof.position.set(0.4, 4.1, 1.15);
  house.add(dormerRoof);
  const dormerWin = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.52, 0.1)), farmWindowMat);
  dormerWin.position.set(0.4, 3.4, 1.62);
  house.add(dormerWin);

  // Warm windows + blue provincial shutters on front & back facades
  const winGeo = track(new THREE.BoxGeometry(0.56, 0.68, 0.08));
  const shutterGeo = track(new THREE.BoxGeometry(0.24, 0.68, 0.07));
  for (const wx of [-1.7, 0.0, 1.7]) {
    for (const sideZ of [-1, 1]) {
      const fz = sideZ * 1.81;
      // Upper floor windows
      const wHi = new THREE.Mesh(winGeo, farmWindowMat);
      wHi.position.set(wx, 2.25, fz);
      house.add(wHi);
      for (const sOff of [-0.4, 0.4]) {
        const sh = new THREE.Mesh(shutterGeo, shutterBlueMat);
        sh.position.set(wx + sOff, 2.25, fz);
        house.add(sh);
      }
      // Ground floor windows (skip center front where front door sits)
      if (!(sideZ === 1 && wx === 0)) {
        const wLo = new THREE.Mesh(winGeo, farmWindowMat);
        wLo.position.set(wx, 0.95, fz);
        house.add(wLo);
      }
    }
  }

  // Timber front door + porch awning
  const hDoor = new THREE.Mesh(track(new THREE.BoxGeometry(0.76, 1.25, 0.1)), darkTimberMat);
  hDoor.position.set(0, 0.78, 1.82);
  house.add(hDoor);
  const porchRoof = new THREE.Mesh(track(new THREE.BoxGeometry(1.75, 0.1, 0.9)), tileRoofMat);
  porchRoof.position.set(0, 1.68, 2.2);
  porchRoof.rotation.x = 0.24;
  house.add(porchRoof);
  for (const px of [-0.72, 0.72]) {
    const pPost = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, 1.5, 0.1)), darkTimberMat);
    pPost.position.set(px, 0.85, 2.52);
    house.add(pPost);
  }
  group.add(house);

  // =========================================================================
  // 3. GRANDE GRANGE / ÉTABLE (COWSHED BARN) & GRAIN SILO
  // =========================================================================
  const barn = new THREE.Group();
  const bx = -29.3;
  const bz = 21.0;
  const by = getTerrainHeight(bx, bz);
  barn.position.set(bx, by, bz);
  barn.rotation.y = -0.18;

  const bPlinth = new THREE.Mesh(track(new THREE.BoxGeometry(5.9, 1.2, 4.0)), stoneWallMat);
  bPlinth.position.y = -0.3;
  barn.add(bPlinth);

  const bStoneBase = new THREE.Mesh(track(new THREE.BoxGeometry(5.7, 1.35, 3.8)), stoneWallMat);
  bStoneBase.position.y = 0.8;
  bStoneBase.castShadow = true;
  bStoneBase.receiveShadow = true;
  barn.add(bStoneBase);

  const bTimberUpper = new THREE.Mesh(track(new THREE.BoxGeometry(5.65, 1.75, 3.75)), barnPlankMat);
  bTimberUpper.position.y = 2.35;
  bTimberUpper.castShadow = true;
  bTimberUpper.receiveShadow = true;
  barn.add(bTimberUpper);

  // Steep barn gable roof
  const bRoofShape = new THREE.Shape();
  bRoofShape.moveTo(-2.25, 0);
  bRoofShape.lineTo(0, 1.95);
  bRoofShape.lineTo(2.25, 0);
  bRoofShape.closePath();
  const bRoofGeo = track(new THREE.ExtrudeGeometry(bRoofShape, { depth: 6.2, bevelEnabled: false }));
  bRoofGeo.rotateY(Math.PI / 2);
  bRoofGeo.translate(-3.1, 0, 0);
  const bRoof = new THREE.Mesh(bRoofGeo, slateRoofMat);
  bRoof.position.y = 3.2;
  bRoof.castShadow = true;
  bRoof.receiveShadow = true;
  barn.add(bRoof);

  // Wide wooden double barn doors facing the courtyard (-Z) with cross-bracing
  const barnDoorBg = new THREE.Mesh(
    track(new THREE.BoxGeometry(2.0, 2.1, 0.12)),
    darkTimberMat
  );
  barnDoorBg.position.set(-0.4, 1.2, -1.91);
  barn.add(barnDoorBg);

  const hayloftWin = new THREE.Mesh(track(new THREE.BoxGeometry(1.05, 0.82, 0.12)), farmWindowMat);
  hayloftWin.position.set(-0.4, 2.75, -1.91);
  barn.add(hayloftWin);

  // Warm stable windows along courtyard facade
  for (const sx of [1.4, 2.25]) {
    const sw = new THREE.Mesh(track(new THREE.BoxGeometry(0.56, 0.52, 0.1)), farmWindowMat);
    sw.position.set(sx, 1.2, -1.91);
    barn.add(sw);
  }

  // Glowing courtyard lantern mounted over barn doors
  const barnLamp = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 10, 10)), yardLampMat);
  barnLamp.position.set(-0.4, 2.38, -2.08);
  barn.add(barnLamp);

  group.add(barn);

  // Tall Cylindrical Grain Silo beside the barn (-25.9, 22.0)
  const silo = new THREE.Group();
  const siloX = -25.9;
  const siloZ = 22.0;
  silo.position.set(siloX, getTerrainHeight(siloX, siloZ), siloZ);

  const siloTower = new THREE.Mesh(track(new THREE.CylinderGeometry(1.15, 1.2, 5.2, 16)), siloConcreteMat);
  siloTower.position.y = 2.5;
  siloTower.castShadow = true;
  siloTower.receiveShadow = true;
  silo.add(siloTower);

  const siloDome = new THREE.Mesh(
    track(new THREE.SphereGeometry(1.17, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    galvanizedMat
  );
  siloDome.position.y = 5.1;
  siloDome.castShadow = true;
  silo.add(siloDome);

  // Steel reinforcement hoops + vertical feed chute
  for (const hyRing of [1.2, 2.4, 3.6, 4.7]) {
    const hoop = new THREE.Mesh(track(new THREE.TorusGeometry(1.19, 0.04, 6, 20)), galvanizedMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = hyRing;
    silo.add(hoop);
  }
  const chute = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 4.6, 0.34)), galvanizedMat);
  chute.position.set(-1.18, 2.6, 0);
  silo.add(chute);
  group.add(silo);

  // Courtyard vintage lamp post beside farmhouse terrace
  const ironMat = track(new THREE.MeshStandardMaterial({ color: 0x262c33, roughness: 0.48, metalness: 0.68 }));
  const yardPole = new THREE.Group();
  yardPole.position.set(-38.0, yardY, 15.8);
  const ypMast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.065, 2.3, 8)), ironMat);
  ypMast.position.y = 1.15;
  yardPole.add(ypMast);
  const ypGlobe = new THREE.Mesh(track(new THREE.SphereGeometry(0.16, 10, 10)), yardLampMat);
  ypGlobe.position.y = 2.34;
  yardPole.add(ypGlobe);
  const ypCap = new THREE.Mesh(track(new THREE.ConeGeometry(0.24, 0.14, 8)), ironMat);
  ypCap.position.y = 2.48;
  yardPole.add(ypCap);
  group.add(yardPole);

  // =========================================================================
  // 4. MINIATURE RED FARM TRACTOR + HAY TRAILER IN COURTYARD
  // =========================================================================
  const tractorRig = new THREE.Group();
  const tx = -30.2;
  const tz = 15.0;
  tractorRig.position.set(tx, getTerrainHeight(tx, tz) + 0.05, tz);
  tractorRig.rotation.y = -0.85;

  const tractorRedMat = track(new THREE.MeshStandardMaterial({ color: 0xc83228, roughness: 0.35, metalness: 0.25 }));
  const tractorYellowMat = track(new THREE.MeshStandardMaterial({ color: 0xe0b238, roughness: 0.4, metalness: 0.2 }));
  const tireMat = track(new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.88 }));

  // Tractor chassis + hood
  const tChassis = new THREE.Mesh(track(new THREE.BoxGeometry(0.86, 0.32, 1.55)), ironMat);
  tChassis.position.y = 0.44;
  tractorRig.add(tChassis);
  const tHood = new THREE.Mesh(track(new THREE.BoxGeometry(0.76, 0.52, 0.98)), tractorRedMat);
  tHood.position.set(0, 0.78, 0.32);
  tHood.castShadow = true;
  tractorRig.add(tHood);
  const tExhaust = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.06, 0.65, 8)), ironMat);
  tExhaust.position.set(0.28, 1.22, 0.56);
  tractorRig.add(tExhaust);
  // Open roll-cage cab roof
  const tCabRoof = new THREE.Mesh(track(new THREE.BoxGeometry(0.86, 0.08, 0.76)), tractorRedMat);
  tCabRoof.position.set(0, 1.48, -0.32);
  tractorRig.add(tCabRoof);
  for (const [px, pz] of [
    [-0.36, -0.64],
    [0.36, -0.64],
    [-0.36, 0.0],
    [0.36, 0.0],
  ]) {
    const strut = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.78, 0.05)), ironMat);
    strut.position.set(px, 1.08, pz);
    tractorRig.add(strut);
  }
  // Big rear wheels + smaller front wheels with yellow hubs
  const rearWheelGeo = track(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14));
  rearWheelGeo.rotateZ(Math.PI / 2);
  const rearHubGeo = track(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 10));
  rearHubGeo.rotateZ(Math.PI / 2);
  const frontWheelGeo = track(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 12));
  frontWheelGeo.rotateZ(Math.PI / 2);
  for (const sx of [-0.52, 0.52]) {
    const rw = new THREE.Mesh(rearWheelGeo, tireMat);
    rw.position.set(sx, 0.42, -0.45);
    rw.castShadow = true;
    tractorRig.add(rw);
    const rh = new THREE.Mesh(rearHubGeo, tractorYellowMat);
    rh.position.set(sx, 0.42, -0.45);
    tractorRig.add(rh);
  }
  for (const sx of [-0.46, 0.46]) {
    const fw = new THREE.Mesh(frontWheelGeo, tireMat);
    fw.position.set(sx, 0.26, 0.58);
    tractorRig.add(fw);
  }
  // Tractor headlights
  for (const lx of [-0.26, 0.26]) {
    const hl = new THREE.Mesh(track(new THREE.SphereGeometry(0.075, 8, 8)), tractorHeadlightMat);
    hl.position.set(lx, 0.78, 0.84);
    tractorRig.add(hl);
  }

  // Coupled wooden hay trailer behind tractor
  const trailer = new THREE.Group();
  trailer.position.set(0, 0, -2.25);
  const trTongue = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, 0.08, 0.85)), ironMat);
  trTongue.position.set(0, 0.34, 1.15);
  trailer.add(trTongue);
  const trDeck = new THREE.Mesh(track(new THREE.BoxGeometry(1.18, 0.14, 1.9)), barnPlankMat);
  trDeck.position.y = 0.42;
  trDeck.castShadow = true;
  trailer.add(trDeck);
  for (const sx of [-0.55, 0.55]) {
    const tw = new THREE.Mesh(frontWheelGeo, tireMat);
    tw.position.set(sx, 0.26, -0.2);
    trailer.add(tw);
  }
  const baleGeo = track(new THREE.CylinderGeometry(0.34, 0.34, 0.56, 12));
  baleGeo.rotateZ(Math.PI / 2);
  for (const [bxB, byB, bzB] of [
    [-0.28, 0.78, -0.42],
    [0.28, 0.78, -0.42],
    [-0.28, 0.78, 0.38],
    [0.28, 0.78, 0.38],
    [0, 1.24, -0.02],
  ] as Array<[number, number, number]>) {
    const bale = new THREE.Mesh(baleGeo, hayMat);
    bale.position.set(bxB, byB, bzB);
    bale.castShadow = true;
    trailer.add(bale);
  }
  tractorRig.add(trailer);
  group.add(tractorRig);

  // =========================================================================
  // 5. GOLDEN CROP FIELD (CHAMP DE BLÉ) ON SOUTH-WEST FLANK
  // =========================================================================
  const fieldGroup = new THREE.Group();
  const fieldCenterX = -41.1;
  const fieldCenterZ = 24.0;
  const fieldY = getTerrainHeight(fieldCenterX, fieldCenterZ) + 0.04;
  const soilBase = new THREE.Mesh(track(new THREE.BoxGeometry(6.4, 0.1, 5.2)), soilMat);
  soilBase.position.set(fieldCenterX, fieldY, fieldCenterZ);
  soilBase.receiveShadow = true;
  fieldGroup.add(soilBase);

  const furrowGeo = track(new THREE.BoxGeometry(5.8, 0.24, 0.34));
  for (let row = 0; row < 7; row++) {
    const fz = fieldCenterZ - 2.05 + row * 0.68;
    const furrow = new THREE.Mesh(furrowGeo, cropMat);
    furrow.position.set(fieldCenterX, fieldY + 0.14, fz);
    furrow.castShadow = true;
    fieldGroup.add(furrow);
  }
  group.add(fieldGroup);

  // =========================================================================
  // 6. GRAND PRÉ AUX VACHES (LARGE FENCED MEADOW + TROUGH + 14 COWS)
  // =========================================================================
  const meadowGroup = new THREE.Group();
  const { minX, maxX, minZ, maxZ } = GRAND_MEADOW_BOUNDS;
  // Perimeter fence with an open farm gate facing the farmyard lane at x in [-35.8, -33.4], z = maxZ
  const fenceSegments: Array<[[number, number], [number, number]]> = [
    [[minX + 0.6, minZ + 0.4], [maxX - 0.5, minZ + 0.4]],
    [[maxX - 0.5, minZ + 0.4], [maxX - 0.5, maxZ - 0.4]],
    [[maxX - 0.5, maxZ - 0.4], [-33.3, maxZ - 0.4]],
    [[-35.9, maxZ - 0.4], [minX + 0.6, maxZ - 0.4]],
    [[minX + 0.6, maxZ - 0.4], [minX + 0.6, minZ + 0.4]],
  ];

  const postGeo = track(new THREE.BoxGeometry(0.14, 0.85, 0.14));
  const railGeo = track(new THREE.BoxGeometry(1, 0.09, 0.065));

  for (const [[x1, z1], [x2, z2]] of fenceSegments) {
    const segLen = Math.hypot(x2 - x1, z2 - z1);
    const subCount = Math.max(2, Math.round(segLen / 1.75));
    for (let s = 0; s <= subCount; s++) {
      const f = s / subCount;
      const px = x1 + (x2 - x1) * f;
      const pz = z1 + (z2 - z1) * f;
      const py = getTerrainHeight(px, pz);
      const post = new THREE.Mesh(postGeo, fenceWoodMat);
      post.position.set(px, py + 0.4, pz);
      post.castShadow = true;
      meadowGroup.add(post);

      if (s < subCount) {
        const fMid = (s + 0.5) / subCount;
        const mx = x1 + (x2 - x1) * fMid;
        const mz = z1 + (z2 - z1) * fMid;
        const my = getTerrainHeight(mx, mz);
        const ang = Math.atan2(z2 - z1, x2 - x1);
        const subLen = segLen / subCount;
        for (const ry of [0.32, 0.62]) {
          const rail = new THREE.Mesh(railGeo, fenceWoodMat);
          rail.scale.x = subLen;
          rail.position.set(mx, my + ry, mz);
          rail.rotation.y = -ang;
          meadowGroup.add(rail);
        }
      }
    }
  }

  // Open wooden meadow farm gate swung ajar at (-35.9, maxZ - 0.4)
  const gateGroup = new THREE.Group();
  const gateY = getTerrainHeight(-35.9, maxZ - 0.4);
  gateGroup.position.set(-35.9, gateY, maxZ - 0.4);
  gateGroup.rotation.y = 0.68; // Swung gracefully open into meadow
  for (const gy of [0.28, 0.52, 0.76]) {
    const bar = new THREE.Mesh(track(new THREE.BoxGeometry(2.3, 0.08, 0.07)), darkTimberMat);
    bar.position.set(1.15, gy, 0);
    gateGroup.add(bar);
  }
  const gateDiag = new THREE.Mesh(track(new THREE.BoxGeometry(2.35, 0.07, 0.06)), darkTimberMat);
  gateDiag.position.set(1.15, 0.52, 0);
  gateDiag.rotation.z = 0.24;
  gateGroup.add(gateDiag);
  meadowGroup.add(gateGroup);

  // Stone Watering Trough (Abreuvoir) filled with clear water at (-31.2, 8.2)
  const trough = new THREE.Group();
  const trX = -31.2;
  const trZ = 8.2;
  trough.position.set(trX, getTerrainHeight(trX, trZ), trZ);
  trough.rotation.y = 0.35;
  const trBody = new THREE.Mesh(track(new THREE.BoxGeometry(2.2, 0.56, 0.92)), stoneWallMat);
  trBody.position.y = 0.28;
  trBody.castShadow = true;
  trough.add(trBody);
  const trWater = new THREE.Mesh(track(new THREE.BoxGeometry(1.9, 0.1, 0.68)), waterMat);
  trWater.position.y = 0.52;
  trough.add(trWater);
  meadowGroup.add(trough);

  // Covered Wooden Hay Feeder Rack (Râtelier) + extra round hay bales in meadow
  const feeder = new THREE.Group();
  const fX = -39.5;
  const fZ = 5.4;
  feeder.position.set(fX, getTerrainHeight(fX, fZ), fZ);
  feeder.rotation.y = -0.25;
  const fBase = new THREE.Mesh(track(new THREE.BoxGeometry(1.9, 0.68, 1.05)), fenceWoodMat);
  fBase.position.y = 0.42;
  feeder.add(fBase);
  const fHay = new THREE.Mesh(track(new THREE.BoxGeometry(1.68, 0.46, 0.86)), hayMat);
  fHay.position.y = 0.84;
  feeder.add(fHay);
  const fRoof = new THREE.Mesh(track(new THREE.BoxGeometry(2.2, 0.1, 1.45)), tileRoofMat);
  fRoof.position.y = 1.56;
  fRoof.castShadow = true;
  feeder.add(fRoof);
  for (const [px, pz] of [
    [-0.86, -0.45],
    [0.86, -0.45],
    [-0.86, 0.45],
    [0.86, 0.45],
  ]) {
    const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, 1.52, 0.1)), darkTimberMat);
    leg.position.set(px, 0.76, pz);
    feeder.add(leg);
  }
  meadowGroup.add(feeder);

  // Scattered round hay bales in the meadow corner
  for (const [hxB, hzB, rot] of [
    [-41.2, 8.6, 0.5],
    [-40.4, 9.4, -0.8],
    [-41.5, 9.6, 1.2],
    [-29.4, 0.2, 0.3],
    [-30.1, -0.6, -0.5],
  ] as Array<[number, number, number]>) {
    const b = new THREE.Mesh(baleGeo, hayMat);
    b.position.set(hxB, getTerrainHeight(hxB, hzB) + 0.34, hzB);
    b.rotation.y = rot;
    b.castShadow = true;
    meadowGroup.add(b);
  }

  // =========================================================================
  // 7. HERD OF 14 COMPOSITE MINIATURE COWS (HOLSTEIN & MONTBÉLIARDE)
  // =========================================================================
  const cowWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.82 }));
  const cowBlackMat = track(new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.85 }));
  const cowBrownMat = track(new THREE.MeshStandardMaterial({ color: 0x8b4f2b, roughness: 0.84 }));
  const cowSnoutMat = track(new THREE.MeshStandardMaterial({ color: 0xdca596, roughness: 0.78 }));
  const cowHornMat = track(new THREE.MeshStandardMaterial({ color: 0xe3d6b4, roughness: 0.65 }));

  const cowBodyGeo = track(new THREE.BoxGeometry(0.92, 0.48, 0.44));
  const cowSpotAGeo = track(new THREE.BoxGeometry(0.34, 0.32, 0.46));
  const cowSpotBGeo = track(new THREE.BoxGeometry(0.28, 0.26, 0.46));
  const cowNeckGeo = track(new THREE.BoxGeometry(0.26, 0.28, 0.26));
  const cowHeadGeo = track(new THREE.BoxGeometry(0.32, 0.26, 0.26));
  const cowSnoutGeo = track(new THREE.BoxGeometry(0.12, 0.16, 0.2));
  const cowEarGeo = track(new THREE.BoxGeometry(0.06, 0.08, 0.14));
  const cowHornGeo = track(new THREE.ConeGeometry(0.032, 0.14, 6));
  const cowLegGeo = track(new THREE.BoxGeometry(0.1, 0.34, 0.1));
  const cowTailGeo = track(new THREE.BoxGeometry(0.05, 0.34, 0.05));

  const animatedCows: AnimatedCow[] = [];

  const buildDetailedCow = (
    x: number,
    z: number,
    rotY: number,
    scale: number,
    isBrownBreed: boolean,
    grazing: boolean,
    phase: number
  ): THREE.Group => {
    const cow = new THREE.Group();
    cow.position.set(x, getTerrainHeight(x, z), z);
    cow.rotation.y = rotY;
    cow.scale.setScalar(scale);

    const patchMat = isBrownBreed ? cowBrownMat : cowBlackMat;

    // Torso & characteristic dairy patches
    const body = new THREE.Mesh(cowBodyGeo, cowWhiteMat);
    body.position.y = 0.52;
    body.castShadow = true;
    body.receiveShadow = true;
    cow.add(body);

    const spotA = new THREE.Mesh(cowSpotAGeo, patchMat);
    spotA.position.set(0.08, 0.56, 0);
    cow.add(spotA);

    const spotB = new THREE.Mesh(cowSpotBGeo, patchMat);
    spotB.position.set(-0.28, 0.5, 0);
    cow.add(spotB);

    // Tail
    const tail = new THREE.Mesh(cowTailGeo, patchMat);
    tail.position.set(-0.48, 0.44, 0);
    tail.rotation.z = -0.22;
    cow.add(tail);

    // Articulated neck + head + snout + ears + horns
    const headGroup = new THREE.Group();
    headGroup.position.set(0.42, 0.58, 0);
    const basePitch = grazing ? -0.68 : 0.05;
    headGroup.rotation.z = basePitch;

    const neck = new THREE.Mesh(cowNeckGeo, patchMat);
    neck.position.set(0.08, 0.04, 0);
    headGroup.add(neck);

    const head = new THREE.Mesh(cowHeadGeo, isBrownBreed ? cowWhiteMat : patchMat);
    head.position.set(0.24, 0.08, 0);
    head.castShadow = true;
    headGroup.add(head);

    const snout = new THREE.Mesh(cowSnoutGeo, cowSnoutMat);
    snout.position.set(0.41, 0.02, 0);
    headGroup.add(snout);

    for (const ez of [-0.16, 0.16]) {
      const ear = new THREE.Mesh(cowEarGeo, patchMat);
      ear.position.set(0.18, 0.16, ez);
      headGroup.add(ear);
      const horn = new THREE.Mesh(cowHornGeo, cowHornMat);
      horn.position.set(0.22, 0.24, ez * 0.65);
      horn.rotation.x = ez > 0 ? 0.35 : -0.35;
      headGroup.add(horn);
    }
    cow.add(headGroup);

    // 4 legs grounded cleanly at y = 0
    for (const [lx, lz] of [
      [-0.31, -0.14],
      [-0.31, 0.14],
      [0.31, -0.14],
      [0.31, 0.14],
    ]) {
      const leg = new THREE.Mesh(cowLegGeo, patchMat);
      leg.position.set(lx, 0.17, lz);
      leg.castShadow = true;
      cow.add(leg);
    }

    animatedCows.push({ headGroup, basePitch, phase, grazing });
    return cow;
  };

  const cowSpecs: Array<[number, number, number, number, boolean, boolean]> = [
    // [x, z, rotY, scale, isBrownBreed, grazing]
    [-38.2, 2.2, 0.5, 1.05, false, true],
    [-36.0, 3.8, -1.2, 1.0, false, false],
    [-34.2, 1.6, 2.1, 1.08, true, true],
    [-31.6, 3.4, -0.6, 0.96, false, true],
    [-30.0, 6.2, 2.6, 1.04, true, false],
    [-32.8, 7.6, 0.4, 1.0, false, true],
    [-35.4, 6.6, -2.1, 0.92, true, true],
    [-37.8, 7.8, 1.4, 1.06, false, false],
    [-40.4, 3.4, -0.3, 1.02, false, true],
    [-41.0, 0.2, 0.9, 1.0, true, true],
    [-37.5, -1.2, -1.7, 1.05, false, false],
    [-33.8, -1.6, 2.8, 0.98, false, true],
    [-30.6, -0.4, -2.5, 1.04, true, true],
    [-35.8, 8.9, 1.9, 0.82, false, true], // Young calf near mother
  ];

  cowSpecs.forEach(([cx, cz, rot, sc, brown, graz], idx) => {
    meadowGroup.add(buildDetailedCow(cx, cz, rot, sc, brown, graz, idx * 0.95));
  });

  group.add(meadowGroup);

  return {
    group,
    updateFarmLife: (elapsed: number) => {
      for (let i = 0; i < animatedCows.length; i++) {
        const c = animatedCows[i];
        const sway = c.grazing
          ? Math.sin(elapsed * 1.4 + c.phase) * 0.1
          : Math.sin(elapsed * 0.7 + c.phase) * 0.04;
        c.headGroup.rotation.z = c.basePitch + sway;
      }
    },
    setNightFactor: (nightFactor: number) => {
      farmWindowMat.emissiveIntensity = 0.08 + nightFactor * 2.05;
      yardLampMat.emissiveIntensity = 0.18 + nightFactor * 2.6;
      tractorHeadlightMat.emissiveIntensity = 0.3 + nightFactor * 2.4;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
