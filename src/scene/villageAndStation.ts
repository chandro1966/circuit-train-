import * as THREE from 'three';
import { getTerrainHeight, wrapDistance } from '../sim/railwayMath';
import {
  FARM_ROUNDABOUT_CENTER,
  RIVER_BRIDGE_CENTER,
  RIVER_BRIDGE_DECK_Y,
  RIVER_BRIDGE_HALF_SPAN,
  ROAD_HALF_WIDTH,
  VILLAGE_ROUNDABOUT_CENTER,
  buildRoadNetworkCurves,
  getRoadElevationAt,
  stepRoadTraffic,
  type RoadVehicleState,
} from '../sim/roadNetwork';
import type { ProceduralTexturePack } from './textures';

export interface VillageAndStationResult {
  group: THREE.Group;
  updateCarsAndPeople: (dt: number, elapsed: number, isCrossingClosed: boolean) => void;
  setNightFactor: (nightFactor: number) => void;
  dispose: () => void;
}

interface RoadVehicleActor {
  mesh: THREE.Group;
  state: RoadVehicleState;
  halfWheelbase: number;
}

/**
 * Builds the Main Station (Gare de Val-d'Arc) with platforms, signal box, waiting passengers,
 * the half-timbered European village, the hilltop chapel, streetlamps, and paved roads with animated cars.
 */
export function buildVillageAndStation(textures: ProceduralTexturePack): VillageAndStationResult {
  const group = new THREE.Group();
  group.name = 'VillageAndStation';

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Materials with night-controllable emissives
  const warmWindowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b4d63,
      emissive: 0xffc870,
      emissiveIntensity: 0.08,
      roughness: 0.18,
      metalness: 0.3,
    })
  );
  const stationWindowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3a4a5e,
      emissive: 0xffd584,
      emissiveIntensity: 0.12,
      roughness: 0.16,
      metalness: 0.35,
    })
  );
  const chapelGlassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x5c7ca8,
      emissive: 0xffc266,
      emissiveIntensity: 0.15,
      roughness: 0.2,
    })
  );
  const lampGlobeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfaf0d8,
      emissive: 0xffd68c,
      emissiveIntensity: 0.18,
      roughness: 0.25,
    })
  );
  const carHeadlightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfff8e2,
      emissive: 0xfff2c2,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    })
  );
  const carTaillightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0xff2828,
      emissiveIntensity: 0.4,
      roughness: 0.25,
    })
  );

  // Common architectural materials
  const slateRoofMat = track(new THREE.MeshStandardMaterial({ color: 0x38414c, roughness: 0.72, metalness: 0.1 }));
  const terracottaRoofMat = track(new THREE.MeshStandardMaterial({ color: 0x9c4532, roughness: 0.78 }));
  const tileRoofAltMat = track(new THREE.MeshStandardMaterial({ color: 0x823b2c, roughness: 0.8 }));
  const timberMat = track(new THREE.MeshStandardMaterial({ color: 0x432b1c, roughness: 0.88 }));
  const concreteMat = track(new THREE.MeshStandardMaterial({ color: 0xb7b2a6, roughness: 0.88 }));
  const yellowSafetyMat = track(new THREE.MeshStandardMaterial({ color: 0xdca834, roughness: 0.7 }));
  const brickMat = track(new THREE.MeshStandardMaterial({ color: 0x944b3d, roughness: 0.86 }));
  const limestoneMat = track(new THREE.MeshStandardMaterial({ color: 0xded5c4, roughness: 0.82 }));
  const ironMat = track(new THREE.MeshStandardMaterial({ color: 0x262c33, roughness: 0.45, metalness: 0.7 }));

  // =========================================================================
  // 1. GARE PRINCIPALE ("GARE DE VAL-D'ARC") & PLATFORMS (QUAIS)
  // =========================================================================
  const stationGroup = new THREE.Group();
  stationGroup.name = 'MainStation';

  // Quai 1 (South Main Platform between main track z=13.5 and station hall z=17.1)
  const quai1 = new THREE.Mesh(track(new THREE.BoxGeometry(17.5, 0.42, 2.2)), concreteMat);
  quai1.position.set(0.0, 0.21, 15.3);
  quai1.receiveShadow = true;
  quai1.castShadow = true;
  stationGroup.add(quai1);

  const quai1Line = new THREE.Mesh(track(new THREE.BoxGeometry(17.4, 0.03, 0.14)), yellowSafetyMat);
  quai1Line.position.set(0.0, 0.43, 14.34);
  stationGroup.add(quai1Line);

  // Quai 2 (Island Platform between Main Track z=13.5 and Siding Track z=10.2)
  const quai2 = new THREE.Mesh(track(new THREE.BoxGeometry(11.2, 0.4, 1.32)), concreteMat);
  quai2.position.set(0.0, 0.2, 11.85);
  quai2.receiveShadow = true;
  quai2.castShadow = true;
  stationGroup.add(quai2);

  // Main Station Building (Composite classic French regional station)
  const bldg = new THREE.Group();
  bldg.position.set(0.0, 0.42, 17.55);

  // Central grand pavilion
  const centerBody = new THREE.Mesh(track(new THREE.BoxGeometry(5.6, 3.1, 2.9)), limestoneMat);
  centerBody.position.set(0, 1.55, 0);
  centerBody.castShadow = true;
  centerBody.receiveShadow = true;
  bldg.add(centerBody);

  // Side wings (East & West)
  for (const sx of [-4.6, 4.6]) {
    const wing = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 2.25, 2.5)), limestoneMat);
    wing.position.set(sx, 1.125, 0.1);
    wing.castShadow = true;
    wing.receiveShadow = true;
    bldg.add(wing);

    // Brick corner quoins / plinth base
    const wingBase = new THREE.Mesh(track(new THREE.BoxGeometry(3.86, 0.45, 2.56)), brickMat);
    wingBase.position.set(sx, 0.225, 0.1);
    bldg.add(wingBase);

    // Pitched slate wing roof
    const wRoofShape = new THREE.Shape();
    wRoofShape.moveTo(-1.38, 0);
    wRoofShape.lineTo(0, 1.05);
    wRoofShape.lineTo(1.38, 0);
    wRoofShape.closePath();
    const wRoofGeo = track(new THREE.ExtrudeGeometry(wRoofShape, { depth: 4.0, bevelEnabled: false }));
    wRoofGeo.rotateY(Math.PI / 2);
    wRoofGeo.translate(-2.0, 0, 0);
    const wRoof = new THREE.Mesh(wRoofGeo, slateRoofMat);
    wRoof.position.set(sx, 2.22, 0.1);
    wRoof.castShadow = true;
    bldg.add(wRoof);

    // Illuminated wing windows (platform & street sides)
    for (const wx of [-1.05, 0, 1.05]) {
      const winF = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 0.82, 0.08)), stationWindowMat);
      winF.position.set(sx + wx, 1.25, -1.16);
      bldg.add(winF);
      const winB = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 0.82, 0.08)), stationWindowMat);
      winB.position.set(sx + wx, 1.25, 1.36);
      bldg.add(winB);
    }
  }

  // Central steep mansard slate roof
  const cRoofShape = new THREE.Shape();
  cRoofShape.moveTo(-1.62, 0);
  cRoofShape.lineTo(-0.85, 1.42);
  cRoofShape.lineTo(0.85, 1.42);
  cRoofShape.lineTo(1.62, 0);
  cRoofShape.closePath();
  const cRoofGeo = track(new THREE.ExtrudeGeometry(cRoofShape, { depth: 5.9, bevelEnabled: false }));
  cRoofGeo.rotateY(Math.PI / 2);
  cRoofGeo.translate(-2.95, 0, 0);
  const cRoof = new THREE.Mesh(cRoofGeo, slateRoofMat);
  cRoof.position.set(0, 3.05, 0);
  cRoof.castShadow = true;
  bldg.add(cRoof);

  // Clock gable facing the tracks
  const clockGable = new THREE.Mesh(track(new THREE.BoxGeometry(1.4, 1.25, 0.5)), limestoneMat);
  clockGable.position.set(0, 3.55, -1.32);
  bldg.add(clockGable);
  const clockFace = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16)),
    track(new THREE.MeshStandardMaterial({ color: 0xf7f2e4, emissive: 0xffe4aa, emissiveIntensity: 0.35 }))
  );
  clockFace.rotation.x = Math.PI / 2;
  clockFace.position.set(0, 3.6, -1.58);
  bldg.add(clockFace);

  // Central arched entrance doors & upper windows
  for (const cx of [-1.6, 0, 1.6]) {
    const winLow = new THREE.Mesh(track(new THREE.BoxGeometry(0.76, 1.15, 0.1)), stationWindowMat);
    winLow.position.set(cx, 0.92, -1.46);
    bldg.add(winLow);
    const winHi = new THREE.Mesh(track(new THREE.BoxGeometry(0.68, 0.85, 0.1)), stationWindowMat);
    winHi.position.set(cx, 2.32, -1.46);
    bldg.add(winHi);
  }

  // Station Nameplate Sign ("GARE DE VAL-D'ARC")
  const signMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.stationSignMap,
      roughness: 0.4,
    })
  );
  const signBoard = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 0.68, 0.12)), signMat);
  signBoard.position.set(0, 1.85, -1.52);
  bldg.add(signBoard);

  // Platform canopy awning over Quai 1
  const canopyRoof = new THREE.Mesh(
    track(new THREE.BoxGeometry(11.6, 0.1, 1.85)),
    track(new THREE.MeshStandardMaterial({ color: 0x3b4856, roughness: 0.45, metalness: 0.45 }))
  );
  canopyRoof.position.set(0, 1.72, -2.25);
  canopyRoof.rotation.x = 0.12;
  canopyRoof.castShadow = true;
  bldg.add(canopyRoof);

  const pillarGeo = track(new THREE.CylinderGeometry(0.06, 0.075, 1.65, 8));
  for (const px of [-5.2, -2.6, 0, 2.6, 5.2]) {
    const pillar = new THREE.Mesh(pillarGeo, ironMat);
    pillar.position.set(px, 0.82, -2.95);
    bldg.add(pillar);
  }

  stationGroup.add(bldg);

  // Platform benches
  const benchMat = track(new THREE.MeshStandardMaterial({ color: 0x6f4b2d, roughness: 0.82 }));
  for (const [bx, bz] of [
    [-5.8, 15.6],
    [5.8, 15.6],
    [-2.5, 11.85],
    [2.5, 11.85],
  ]) {
    const bench = new THREE.Group();
    bench.position.set(bx, 0.42, bz);
    const seat = new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 0.08, 0.34)), benchMat);
    seat.position.y = 0.24;
    bench.add(seat);
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 0.28, 0.06)), benchMat);
    back.position.set(0, 0.4, 0.15);
    bench.add(back);
    stationGroup.add(bench);
  }

  // =========================================================================
  // 2. POSTE D'AIGUILLAGE (SIGNAL BOX) BESIDE WEST TURNOUT
  // =========================================================================
  const sigBox = new THREE.Group();
  sigBox.position.set(-11.8, 0.0, 16.25);
  const sbLower = new THREE.Mesh(track(new THREE.BoxGeometry(2.5, 1.4, 1.9)), brickMat);
  sbLower.position.y = 0.7;
  sbLower.castShadow = true;
  sbLower.receiveShadow = true;
  sigBox.add(sbLower);

  const sbUpper = new THREE.Mesh(track(new THREE.BoxGeometry(2.68, 1.15, 2.05)), limestoneMat);
  sbUpper.position.y = 1.98;
  sbUpper.castShadow = true;
  sigBox.add(sbUpper);

  // Panoramic glazed signal cabin window band
  const sbGlass = new THREE.Mesh(track(new THREE.BoxGeometry(2.74, 0.72, 2.11)), stationWindowMat);
  sbGlass.position.y = 2.04;
  sigBox.add(sbGlass);

  const sbRoofGeo = track(new THREE.ConeGeometry(2.15, 0.92, 4));
  sbRoofGeo.rotateY(Math.PI / 4);
  const sbRoof = new THREE.Mesh(sbRoofGeo, slateRoofMat);
  sbRoof.scale.set(1.06, 1, 0.85);
  sbRoof.position.y = 3.0;
  sbRoof.castShadow = true;
  sigBox.add(sbRoof);
  stationGroup.add(sigBox);

  // =========================================================================
  // 3. MINIATURE STATION PASSENGERS & VILLAGE RESIDENTS (ANIMATED SWAY)
  // =========================================================================
  const personHeadGeo = track(new THREE.SphereGeometry(0.11, 8, 8));
  const personTorsoGeo = track(new THREE.CylinderGeometry(0.11, 0.14, 0.36, 8));
  const personLegsGeo = track(new THREE.CylinderGeometry(0.1, 0.08, 0.28, 8));
  const skinMat = track(new THREE.MeshStandardMaterial({ color: 0xe9bfa0, roughness: 0.75 }));
  const coatColors = [0x2c4b75, 0x9b3634, 0x3b694a, 0xc98b32, 0x5c4668, 0x3d4854];
  const coatMats = coatColors.map((c) =>
    track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }))
  );
  const pantsMat = track(new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.85 }));

  const people: Array<{ mesh: THREE.Group; baseY: number; phase: number }> = [];
  const peopleSpots: Array<[number, number, number, number]> = [
    [-4.2, 0.42, 14.95, 0.3],
    [-3.5, 0.42, 15.1, -0.5],
    [-0.8, 0.42, 14.75, 0.1],
    [1.6, 0.42, 14.85, -0.2],
    [3.8, 0.42, 15.0, 0.7],
    [-1.4, 0.4, 11.75, 2.8],
    [1.1, 0.4, 11.9, -2.5],
    [10.4, 0.02, 5.4, 1.4],
    [11.0, 0.02, 5.7, -1.8],
    [16.2, 0.02, 6.2, 0.6],
    [-2.4, 0.08, 21.4, 0.15],
    [2.1, 0.08, 21.2, -0.35],
  ];

  peopleSpots.forEach(([px, py, pz, rot], idx) => {
    const p = new THREE.Group();
    p.position.set(px, py, pz);
    p.rotation.y = rot;
    const legs = new THREE.Mesh(personLegsGeo, pantsMat);
    legs.position.y = 0.14;
    p.add(legs);
    const torso = new THREE.Mesh(personTorsoGeo, coatMats[idx % coatMats.length]);
    torso.position.y = 0.44;
    torso.castShadow = true;
    p.add(torso);
    const head = new THREE.Mesh(personHeadGeo, skinMat);
    head.position.y = 0.72;
    p.add(head);
    stationGroup.add(p);
    people.push({ mesh: p, baseY: py, phase: idx * 1.1 });
  });

  group.add(stationGroup);

  // =========================================================================
  // 4. HALF-TIMBERED EUROPEAN VILLAGE (MAISONS À COLOMBAGES)
  // =========================================================================
  const buildHalfTimberHouse = (
    x: number,
    z: number,
    rotY: number,
    w: number,
    h: number,
    d: number,
    wallHex: number,
    roofMat: THREE.Material,
    hasChimney: boolean
  ) => {
    const house = new THREE.Group();
    const baseY = getTerrainHeight(x, z);
    house.position.set(x, baseY, z);
    house.rotation.y = rotY;

    // Stone foundation plinth extending below ground so slopes never expose gaps
    const plinth = new THREE.Mesh(
      track(new THREE.BoxGeometry(w + 0.16, 0.8, d + 0.16)),
      concreteMat
    );
    plinth.position.y = -0.22;
    house.add(plinth);

    // Main plaster body
    const wallMat = track(new THREE.MeshStandardMaterial({ color: wallHex, roughness: 0.85 }));
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), wallMat);
    body.position.y = h * 0.5 + 0.14;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // Half-timber (colombages) horizontal belt & corner posts
    const belt = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.06, 0.11, d + 0.06)), timberMat);
    belt.position.y = h * 0.55 + 0.14;
    house.add(belt);
    const eavesBeam = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08)), timberMat);
    eavesBeam.position.y = h + 0.1;
    house.add(eavesBeam);

    const postGeo = track(new THREE.BoxGeometry(0.11, h, 0.11));
    for (const cx of [-w * 0.5, 0, w * 0.5]) {
      for (const cz of [-d * 0.5, d * 0.5]) {
        const post = new THREE.Mesh(postGeo, timberMat);
        post.position.set(cx, h * 0.5 + 0.14, cz);
        house.add(post);
      }
    }

    // Pitched gabled roof
    const roofH = Math.min(1.65, d * 0.58);
    const rShape = new THREE.Shape();
    rShape.moveTo(-(d * 0.5 + 0.24), 0);
    rShape.lineTo(0, roofH);
    rShape.lineTo(d * 0.5 + 0.24, 0);
    rShape.closePath();
    const rGeo = track(new THREE.ExtrudeGeometry(rShape, { depth: w + 0.36, bevelEnabled: false }));
    rGeo.rotateY(Math.PI / 2);
    rGeo.translate(-(w * 0.5 + 0.18), 0, 0);
    const roof = new THREE.Mesh(rGeo, roofMat);
    roof.position.y = h + 0.12;
    roof.castShadow = true;
    roof.receiveShadow = true;
    house.add(roof);

    // Chimney
    if (hasChimney) {
      const chim = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.95, 0.32)), brickMat);
      chim.position.set(w * 0.24, h + roofH * 0.68, -d * 0.16);
      chim.castShadow = true;
      house.add(chim);
    }

    // Warm glowing windows on front & back facades
    const winCols = w > 2.8 ? [-w * 0.3, 0, w * 0.3] : [-w * 0.24, w * 0.24];
    const winGeo = track(new THREE.BoxGeometry(0.42, 0.52, 0.08));
    for (const wx of winCols) {
      for (const fz of [-d * 0.5 - 0.02, d * 0.5 + 0.02]) {
        const win1 = new THREE.Mesh(winGeo, warmWindowMat);
        win1.position.set(wx, h * 0.35 + 0.14, fz);
        house.add(win1);
        if (h > 2.0) {
          const win2 = new THREE.Mesh(winGeo, warmWindowMat);
          win2.position.set(wx, h * 0.78 + 0.14, fz);
          house.add(win2);
        }
      }
    }

    // Wooden front door
    const door = new THREE.Mesh(track(new THREE.BoxGeometry(0.46, 0.82, 0.09)), timberMat);
    door.position.set(0, 0.55, d * 0.5 + 0.03);
    house.add(door);

    group.add(house);
  };

  // Curated half-timbered village cluster framing the Place du Village Roundabout cleanly
  buildHalfTimberHouse(8.7, 3.8, 0.12, 2.9, 2.25, 2.2, 0xefe3cb, terracottaRoofMat, true);
  buildHalfTimberHouse(16.6, 7.6, -0.22, 3.2, 2.45, 2.3, 0xe8c99b, slateRoofMat, true);
  buildHalfTimberHouse(12.2, 8.1, 0.08, 2.7, 2.1, 2.1, 0xdfbeac, tileRoofAltMat, false);
  buildHalfTimberHouse(7.8, 7.6, 0.35, 2.6, 2.2, 2.0, 0xd4dec9, terracottaRoofMat, true);
  buildHalfTimberHouse(18.8, 5.5, -0.45, 2.5, 2.0, 2.1, 0xf2e7d2, tileRoofAltMat, true);
  buildHalfTimberHouse(10.4, -1.3, -0.1, 3.1, 2.35, 2.1, 0xe9d3b0, slateRoofMat, true);
  buildHalfTimberHouse(16.1, -1.6, 0.18, 2.7, 2.05, 2.0, 0xe5c8b5, terracottaRoofMat, false);
  buildHalfTimberHouse(20.6, 8.2, -0.35, 2.8, 2.15, 2.1, 0xede2ca, slateRoofMat, true);

  // Classic stone village fountain centered cleanly inside the Place du Village Roundabout
  const fountain = new THREE.Group();
  fountain.position.set(
    VILLAGE_ROUNDABOUT_CENTER.x,
    getRoadElevationAt(VILLAGE_ROUNDABOUT_CENTER.x, VILLAGE_ROUNDABOUT_CENTER.z) + 0.12,
    VILLAGE_ROUNDABOUT_CENTER.z
  );
  const basin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.76, 0.84, 0.36, 14)), concreteMat);
  basin.position.y = 0.18;
  basin.castShadow = true;
  fountain.add(basin);
  const fWater = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 14)),
    track(new THREE.MeshStandardMaterial({ color: 0x3f8da4, roughness: 0.15, metalness: 0.2 }))
  );
  fWater.position.y = 0.34;
  fountain.add(fWater);
  const obelisk = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.2, 0.96, 8)), concreteMat);
  obelisk.position.y = 0.64;
  obelisk.castShadow = true;
  fountain.add(obelisk);
  group.add(fountain);

  // =========================================================================
  // 5. HILLTOP CHAPEL (CHAPELLE SAINT-ROCH) ON EASTERN KNOLL (16.6, -7.2)
  // =========================================================================
  const chapel = new THREE.Group();
  const chX = 16.6;
  const chZ = -7.2;
  const chY = getTerrainHeight(chX, chZ);
  chapel.position.set(chX, chY, chZ);
  chapel.rotation.y = -0.45;

  const chapelPlinth = new THREE.Mesh(
    track(new THREE.BoxGeometry(3.4, 3.8, 4.6)),
    track(new THREE.MeshStandardMaterial({ color: 0x8f887c, map: textures.stoneMap, roughness: 0.88 }))
  );
  chapelPlinth.position.y = -1.72;
  chapelPlinth.castShadow = true;
  chapelPlinth.receiveShadow = true;
  chapel.add(chapelPlinth);

  const nave = new THREE.Mesh(track(new THREE.BoxGeometry(2.3, 1.9, 3.3)), limestoneMat);
  nave.position.set(0, 1.05, 0.25);
  nave.castShadow = true;
  nave.receiveShadow = true;
  chapel.add(nave);

  // Pitched chapel nave roof
  const chRoofShape = new THREE.Shape();
  chRoofShape.moveTo(-1.35, 0);
  chRoofShape.lineTo(0, 1.25);
  chRoofShape.lineTo(1.35, 0);
  chRoofShape.closePath();
  const chRoofGeo = track(new THREE.ExtrudeGeometry(chRoofShape, { depth: 3.5, bevelEnabled: false }));
  chRoofGeo.translate(0, 0, -1.75);
  const chRoof = new THREE.Mesh(chRoofGeo, slateRoofMat);
  chRoof.position.set(0, 1.98, 0.25);
  chRoof.castShadow = true;
  chapel.add(chRoof);

  // Tall bell tower & spire
  const tower = new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 3.6, 1.15)), limestoneMat);
  tower.position.set(0, 1.9, -1.35);
  tower.castShadow = true;
  chapel.add(tower);

  const spire = new THREE.Mesh(track(new THREE.ConeGeometry(0.82, 2.15, 4)), slateRoofMat);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, 4.75, -1.35);
  spire.castShadow = true;
  chapel.add(spire);

  // Brass spire cross
  const brassMat = track(new THREE.MeshStandardMaterial({ color: 0xdab254, roughness: 0.3, metalness: 0.85 }));
  const crossV = new THREE.Mesh(track(new THREE.BoxGeometry(0.07, 0.55, 0.07)), brassMat);
  crossV.position.set(0, 6.02, -1.35);
  chapel.add(crossV);
  const crossH = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.07, 0.07)), brassMat);
  crossH.position.set(0, 6.12, -1.35);
  chapel.add(crossH);

  // Glowing arched stained-glass windows along both sides of nave
  const stainGeo = track(new THREE.BoxGeometry(0.08, 0.88, 0.42));
  for (const sx of [-1.16, 1.16]) {
    for (const sz of [-0.45, 0.45, 1.25]) {
      const w = new THREE.Mesh(stainGeo, chapelGlassMat);
      w.position.set(sx, 1.12, sz);
      chapel.add(w);
    }
  }
  const roseWin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.36, 0.36, 0.09, 14)), chapelGlassMat);
  roseWin.rotation.x = Math.PI / 2;
  roseWin.position.set(0, 1.45, 1.92);
  chapel.add(roseWin);

  group.add(chapel);

  // =========================================================================
  // 6. VINTAGE STREETLAMPS & PLATFORM LAMPS (WARM NIGHT GLOW)
  // =========================================================================
  const lampPostGeo = track(new THREE.CylinderGeometry(0.04, 0.06, 1.85, 7));
  const lampHeadGeo = track(new THREE.SphereGeometry(0.14, 10, 10));
  const lampCapGeo = track(new THREE.ConeGeometry(0.2, 0.14, 8));

  const lampCoords: Array<[number, number, number]> = [
    // Station platforms
    [-7.2, 0.42, 14.9],
    [-2.4, 0.42, 14.9],
    [2.4, 0.42, 14.9],
    [7.2, 0.42, 14.9],
    [-3.6, 0.4, 11.85],
    [3.6, 0.4, 11.85],
    // Village square & Place du Village Roundabout
    [10.8, 0.02, 4.9],
    [17.8, 0.02, 4.1],
    [21.6, 0.02, 4.1],
    [21.6, 0.02, 0.5],
    [17.6, 0.02, 0.5],
    [11.2, 0.02, 0.2],
    // Eastern departmental road & curves
    [28.5, 0.02, 4.1],
    [38.4, 0.02, 4.2],
    [42.2, 0.02, 11.2],
    [41.4, 0.02, 20.6],
    [34.2, 0.02, 26.8],
    // Avenue, Parking & Parvis de la Gare de Val-d'Arc
    [21.5, 0.02, 26.9],
    [11.5, 0.02, 26.9],
    [5.8, 0.02, 26.9],
    [-5.8, 0.02, 26.9],
    [-13.5, 0.02, 26.9],
    [-4.8, 0.04, 21.8],
    [4.8, 0.04, 21.8],
    // Stone River Bridge approaches & Western Farm Road
    [-19.2, getTerrainHeight(-19.2, 26.1), 26.1],
    [-27.6, getTerrainHeight(-27.6, 25.9), 25.9],
    [-33.2, getTerrainHeight(-33.2, 25.4), 25.4],
    [-33.6, getTerrainHeight(-33.6, 20.2), 20.2],
    // Chapel terrace
    [15.4, getTerrainHeight(15.4, -5.8), -5.8],
  ];

  for (const [lx, ly, lz] of lampCoords) {
    const lGroup = new THREE.Group();
    lGroup.position.set(lx, ly, lz);
    const pole = new THREE.Mesh(lampPostGeo, ironMat);
    pole.position.y = 0.925;
    lGroup.add(pole);
    const globe = new THREE.Mesh(lampHeadGeo, lampGlobeMat);
    globe.position.y = 1.88;
    lGroup.add(globe);
    const cap = new THREE.Mesh(lampCapGeo, ironMat);
    cap.position.y = 2.02;
    lGroup.add(cap);
    group.add(lGroup);
  }

  // =========================================================================
  // 7. WIDE 2-LANE DEPARTMENTAL ROAD, ROUNDABOUTS, RIVER BRIDGE & STATION PARKING
  // =========================================================================
  const { centerCurve, vehicleLoopCurve } = buildRoadNetworkCurves();

  // 7A. Main Swept 2-Lane Asphalt Ribbon with Crisp Dashed Centerline
  const roadSamples = 280;
  const roadPts = centerCurve.getSpacedPoints(roadSamples);
  const rPos: number[] = [];
  const rUvs: number[] = [];
  const rIdx: number[] = [];
  const rUp = new THREE.Vector3(0, 1, 0);
  const rTan = new THREE.Vector3();
  const rRight = new THREE.Vector3();
  const halfRoadW = ROAD_HALF_WIDTH;
  let roadAccum = 0;

  for (let i = 0; i <= roadSamples; i++) {
    const p = roadPts[i];
    if (i > 0) roadAccum += p.distanceTo(roadPts[i - 1]);
    if (i === 0) {
      rTan.subVectors(roadPts[1], roadPts[0]).normalize();
    } else if (i === roadSamples) {
      rTan.subVectors(roadPts[roadSamples], roadPts[roadSamples - 1]).normalize();
    } else {
      rTan.subVectors(roadPts[i + 1], roadPts[i - 1]).normalize();
    }
    rRight.crossVectors(rTan, rUp).normalize();

    const lx = p.x - rRight.x * halfRoadW;
    const lz = p.z - rRight.z * halfRoadW;
    const rx = p.x + rRight.x * halfRoadW;
    const rz = p.z + rRight.z * halfRoadW;
    const yL = getRoadElevationAt(lx, lz);
    const yR = getRoadElevationAt(rx, rz);

    rPos.push(lx, yL, lz);
    rPos.push(rx, yR, rz);
    // Crisp dashed white centerline scaled cleanly along the 137u plateau road
    rUvs.push(0, roadAccum * 0.015, 1, roadAccum * 0.015);

    if (i < roadSamples) {
      const base = i * 2;
      rIdx.push(base, base + 1, base + 2);
      rIdx.push(base + 1, base + 3, base + 2);
    }
  }
  const roadGeo = track(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUvs, 2));
  roadGeo.setIndex(rIdx);
  roadGeo.computeVertexNormals();

  const roadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.roadMap,
      roughness: 0.86,
      metalness: 0.04,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // Plain asphalt material for roundabouts, parking bay & bridge shoulders
  const plainAsphaltMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x45494f,
      roughness: 0.88,
      metalness: 0.04,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const roadStripeMat = track(new THREE.MeshStandardMaterial({ color: 0xeae6da, roughness: 0.7 }));
  const stoneBridgeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.stoneMap,
      bumpMap: textures.stoneBump,
      bumpScale: 0.12,
      roughness: 0.86,
      metalness: 0.04,
    })
  );
  const stoneTrimMat = track(new THREE.MeshStandardMaterial({ color: 0xb1aa9c, roughness: 0.82 }));
  const guardrailSteelMat = track(
    new THREE.MeshStandardMaterial({ color: 0xbac2ca, roughness: 0.42, metalness: 0.65 })
  );
  const greenIslandMat = track(new THREE.MeshStandardMaterial({ color: 0x5c853f, roughness: 0.92 }));

  // 7B. Paved Circular Roundabouts (Place du Village & Cour de la Ferme)
  const buildRoundabout = (cx: number, cz: number, withFarmSignpost: boolean) => {
    const rbGroup = new THREE.Group();
    const ry = getRoadElevationAt(cx, cz);

    // Asphalt ring (inner r=0.98, outer r=2.74)
    const ringGeo = track(new THREE.RingGeometry(0.98, 2.74, 40));
    ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(ringGeo, plainAsphaltMat);
    ringMesh.position.set(cx, ry + 0.004, cz);
    ringMesh.receiveShadow = true;
    rbGroup.add(ringMesh);

    // Subtle dashed circular guide line around roundabout lane center (r=1.86)
    const dashCount = 16;
    const dashGeo = track(new THREE.BoxGeometry(0.38, 0.014, 0.08));
    for (let d = 0; d < dashCount; d++) {
      const ang = (d / dashCount) * Math.PI * 2;
      const dash = new THREE.Mesh(dashGeo, roadStripeMat);
      dash.position.set(cx + Math.cos(ang) * 1.86, ry + 0.012, cz + Math.sin(ang) * 1.86);
      dash.rotation.y = -ang + Math.PI / 2;
      rbGroup.add(dash);
    }

    // Outer stone border rim
    const outerRim = new THREE.Mesh(track(new THREE.TorusGeometry(2.76, 0.06, 6, 40)), concreteMat);
    outerRim.rotation.x = Math.PI / 2;
    outerRim.position.set(cx, ry + 0.025, cz);
    rbGroup.add(outerRim);

    // Raised stone-curbed center island
    const islandStone = new THREE.Mesh(
      track(new THREE.CylinderGeometry(1.02, 1.08, 0.14, 24)),
      stoneTrimMat
    );
    islandStone.position.set(cx, ry + 0.07, cz);
    islandStone.receiveShadow = true;
    rbGroup.add(islandStone);

    const islandTurf = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.88, 0.9, 0.05, 20)),
      greenIslandMat
    );
    islandTurf.position.set(cx, ry + 0.15, cz);
    rbGroup.add(islandTurf);

    if (withFarmSignpost) {
      // Rustic timber signpost + warm lantern on the Farm Courtyard Roundabout
      const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.075, 1.9, 8)), timberMat);
      post.position.set(cx, ry + 1.05, cz);
      post.castShadow = true;
      rbGroup.add(post);

      const armA = new THREE.Mesh(track(new THREE.BoxGeometry(0.92, 0.16, 0.06)), limestoneMat);
      armA.position.set(cx + 0.36, ry + 1.58, cz);
      armA.rotation.y = -0.25;
      rbGroup.add(armA);

      const armB = new THREE.Mesh(track(new THREE.BoxGeometry(0.85, 0.16, 0.06)), limestoneMat);
      armB.position.set(cx - 0.34, ry + 1.36, cz + 0.12);
      armB.rotation.y = 0.65;
      rbGroup.add(armB);

      const topGlobe = new THREE.Mesh(lampHeadGeo, lampGlobeMat);
      topGlobe.position.set(cx, ry + 2.02, cz);
      rbGroup.add(topGlobe);
      const topCap = new THREE.Mesh(lampCapGeo, ironMat);
      topCap.position.set(cx, ry + 2.15, cz);
      rbGroup.add(topCap);
    }

    group.add(rbGroup);
  };

  buildRoundabout(VILLAGE_ROUNDABOUT_CENTER.x, VILLAGE_ROUNDABOUT_CENTER.z, false);
  buildRoundabout(FARM_ROUNDABOUT_CENTER.x, FARM_ROUNDABOUT_CENTER.z, true);

  // 7C. DRESSED-STONE ARCHED ROAD BRIDGE OVER RIVER + GUARDRAILS (PONT ROUTIER EN PIERRE)
  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'StoneRoadRiverBridge';
  const brX = RIVER_BRIDGE_CENTER.x;
  const brZ = RIVER_BRIDGE_CENTER.z;
  const brSpan = RIVER_BRIDGE_HALF_SPAN * 2 + 0.8; // 7.2u full masonry span
  const brW = ROAD_HALF_WIDTH * 2 + 0.56; // 3.2u total masonry deck width

  // Arched masonry spandrel extruded across the road width
  const archHalf = brSpan * 0.5;
  const archR = 2.35;
  const bridgeBaseY = -1.75;
  const deckUnderY = RIVER_BRIDGE_DECK_Y - 0.06;
  const spandrelH = deckUnderY - bridgeBaseY;

  const brShape = new THREE.Shape();
  brShape.moveTo(-archHalf, 0);
  brShape.lineTo(-archHalf, spandrelH);
  brShape.lineTo(archHalf, spandrelH);
  brShape.lineTo(archHalf, 0);
  brShape.lineTo(archR, 0);
  brShape.lineTo(archR, 0.55);
  brShape.absarc(0, 0.55, archR, 0, Math.PI, false);
  brShape.lineTo(-archR, 0);
  brShape.lineTo(-archHalf, 0);

  const brGeo = track(
    new THREE.ExtrudeGeometry(brShape, { depth: brW, bevelEnabled: false, curveSegments: 18 })
  );
  brGeo.translate(0, 0, -brW * 0.5);
  const brMasonry = new THREE.Mesh(brGeo, stoneBridgeMat);
  brMasonry.position.set(brX, bridgeBaseY, brZ);
  brMasonry.rotation.y = 0.055; // Aligned cleanly with gentle river crossing angle
  brMasonry.castShadow = true;
  brMasonry.receiveShadow = true;
  bridgeGroup.add(brMasonry);

  // Low dressed-stone parapets + coping capstones along both bridge sides
  const parapetLen = brSpan + 0.6;
  const parapetGeo = track(new THREE.BoxGeometry(parapetLen, 0.52, 0.24));
  const copingGeo = track(new THREE.BoxGeometry(parapetLen + 0.16, 0.1, 0.34));
  const pillarCapGeo = track(new THREE.BoxGeometry(0.42, 0.68, 0.38));

  const brDeckAlign = new THREE.Group();
  brDeckAlign.position.set(brX, RIVER_BRIDGE_DECK_Y, brZ);
  brDeckAlign.rotation.y = 0.055;

  for (const sideZ of [-(ROAD_HALF_WIDTH + 0.16), ROAD_HALF_WIDTH + 0.16]) {
    const parapet = new THREE.Mesh(parapetGeo, stoneBridgeMat);
    parapet.position.set(0, 0.22, sideZ);
    parapet.castShadow = true;
    parapet.receiveShadow = true;
    brDeckAlign.add(parapet);

    const coping = new THREE.Mesh(copingGeo, stoneTrimMat);
    coping.position.set(0, 0.51, sideZ);
    brDeckAlign.add(coping);

    for (const endX of [-parapetLen * 0.5, parapetLen * 0.5]) {
      const endPillar = new THREE.Mesh(pillarCapGeo, stoneTrimMat);
      endPillar.position.set(endX, 0.28, sideZ);
      endPillar.castShadow = true;
      brDeckAlign.add(endPillar);
    }
  }
  bridgeGroup.add(brDeckAlign);

  // Metallic roadside guardrails (Glissières de sécurité) flanking both river bridge approaches
  const railPostGeo = track(new THREE.BoxGeometry(0.08, 0.46, 0.08));
  const buildGuardrailRun = (xStart: number, xEnd: number, sideSign: number) => {
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const gx = xStart + (xEnd - xStart) * f;
      const gz = brZ + (gx - brX) * -0.055 + sideSign * (ROAD_HALF_WIDTH + 0.24);
      const gy = getRoadElevationAt(gx, gz);
      const post = new THREE.Mesh(railPostGeo, ironMat);
      post.position.set(gx, gy + 0.21, gz);
      post.castShadow = true;
      bridgeGroup.add(post);

      if (s < steps) {
        const fNext = (s + 1) / steps;
        const nx = xStart + (xEnd - xStart) * fNext;
        const nz = brZ + (nx - brX) * -0.055 + sideSign * (ROAD_HALF_WIDTH + 0.24);
        const ny = getRoadElevationAt(nx, nz);
        const dx = nx - gx;
        const dy = ny - gy;
        const dz = nz - gz;
        const segLen = Math.hypot(dx, dy, dz) + 0.04;
        const beam = new THREE.Mesh(
          track(new THREE.BoxGeometry(segLen, 0.14, 0.06)),
          guardrailSteelMat
        );
        beam.position.set((gx + nx) * 0.5, (gy + ny) * 0.5 + 0.34, (gz + nz) * 0.5);
        beam.rotation.y = -Math.atan2(dz, dx);
        beam.rotation.z = Math.atan2(dy, Math.hypot(dx, dz));
        beam.castShadow = true;
        bridgeGroup.add(beam);
      }
    }
  };
  for (const sideSign of [-1, 1]) {
    buildGuardrailRun(brX + 3.85, brX + 7.6, sideSign);
    buildGuardrailRun(brX - 7.6, brX - 3.85, sideSign);
  }
  group.add(bridgeGroup);

  // 7D. PARVIS, PARKING & ZONE D'ARRÊT DE LA GARE DE VAL-D'ARC + PASSERELLE PIÉTONNE
  const stationFrontGroup = new THREE.Group();
  stationFrontGroup.name = 'StationParvisAndParking';

  // Stone paved Station Parvis Plaza directly behind the station hall (z in [19.1, 23.4])
  const parvisPad = new THREE.Mesh(track(new THREE.BoxGeometry(15.2, 0.1, 4.2)), concreteMat);
  parvisPad.position.set(0, 0.05, 21.2);
  parvisPad.receiveShadow = true;
  stationFrontGroup.add(parvisPad);

  // Decorative low flower planters flanking station hall street entrance
  const hedgeMat = track(new THREE.MeshStandardMaterial({ color: 0x3b6b34, roughness: 0.9 }));
  for (const px of [-5.2, 5.2]) {
    const planter = new THREE.Mesh(track(new THREE.BoxGeometry(2.8, 0.24, 0.72)), stoneTrimMat);
    planter.position.set(px, 0.16, 22.8);
    stationFrontGroup.add(planter);
    const shrub = new THREE.Mesh(track(new THREE.BoxGeometry(2.5, 0.34, 0.5)), hedgeMat);
    shrub.position.set(px, 0.36, 22.8);
    shrub.castShadow = true;
    stationFrontGroup.add(shrub);
  }

  // Roadside Parking & Drop-Off Lay-By along north side of Avenue de la Gare (z in [26.68, 27.65])
  const parkingY = getRoadElevationAt(0, 28.95) - 0.004;
  const parkingApron = new THREE.Mesh(track(new THREE.PlaneGeometry(16.6, 1.35)), plainAsphaltMat);
  parkingApron.rotation.x = -Math.PI / 2;
  parkingApron.position.set(0, parkingY, 27.25);
  parkingApron.receiveShadow = true;
  stationFrontGroup.add(parkingApron);

  // Crisp white parking stall stripes along north parking shoulder (completely off active traffic lanes)
  const stallLineGeo = track(new THREE.BoxGeometry(0.08, 0.015, 0.92));
  for (const sx of [-7.4, -5.0, -2.6, 3.8, 6.2, 8.2]) {
    const lineN = new THREE.Mesh(stallLineGeo, roadStripeMat);
    lineN.position.set(sx, parkingY + 0.012, 27.14);
    stationFrontGroup.add(lineN);
  }
  // Yellow drop-off zone marking right in front of the bus shelter & footbridge access
  const dropOffStripe = new THREE.Mesh(
    track(new THREE.BoxGeometry(4.8, 0.016, 0.1)),
    yellowSafetyMat
  );
  dropOffStripe.position.set(0.2, parkingY + 0.013, 27.54);
  stationFrontGroup.add(dropOffStripe);

  // Blue "P" Parking Sign beside the Station Lay-By
  const pSignGroup = new THREE.Group();
  pSignGroup.position.set(-8.1, parkingY, 26.85);
  const pPole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.04, 1.35, 6)), ironMat);
  pPole.position.y = 0.68;
  pSignGroup.add(pPole);
  const pBoard = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.46, 0.46, 0.06)),
    track(new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4 }))
  );
  pBoard.position.y = 1.32;
  pSignGroup.add(pBoard);
  const pLetter = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.26, 0.08)), roadStripeMat);
  pLetter.position.y = 1.32;
  pSignGroup.add(pLetter);
  stationFrontGroup.add(pSignGroup);

  // Covered Station Drop-Off / Bus Shelter (Abribus de la Gare) at (-3.8, 26.95)
  const shelter = new THREE.Group();
  shelter.position.set(-3.8, parkingY, 26.92);
  const shBack = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.9, 1.08, 0.08)),
    track(new THREE.MeshStandardMaterial({ color: 0x3b4d5e, roughness: 0.45, metalness: 0.4 }))
  );
  shBack.position.set(0, 0.56, -0.24);
  shelter.add(shBack);
  const shRoof = new THREE.Mesh(track(new THREE.BoxGeometry(2.05, 0.08, 0.72)), slateRoofMat);
  shRoof.position.set(0, 1.14, 0.04);
  shRoof.castShadow = true;
  shelter.add(shRoof);
  for (const sx of [-0.88, 0.88]) {
    const shPost = new THREE.Mesh(track(new THREE.BoxGeometry(0.065, 1.12, 0.065)), ironMat);
    shPost.position.set(sx, 0.56, 0.3);
    shelter.add(shPost);
  }
  const shBench = new THREE.Mesh(track(new THREE.BoxGeometry(1.35, 0.08, 0.24)), benchMat);
  shBench.position.set(0, 0.34, -0.06);
  shelter.add(shBench);
  stationFrontGroup.add(shelter);

  // Pedestrian Iron Footbridge (Passerelle piétonne de la Gare) cleanly arching over southern Alpine track (y=0.79)
  // Deck at y=3.18 clears all locomotives/wagons with >2.3u headroom!
  const footbridge = new THREE.Group();
  footbridge.position.set(0.0, 0.0, 25.45);
  const fbSteelMat = track(
    new THREE.MeshStandardMaterial({ color: 0x47555e, roughness: 0.45, metalness: 0.65 })
  );
  const fbDeck = new THREE.Mesh(track(new THREE.BoxGeometry(1.26, 0.14, 3.6)), fbSteelMat);
  fbDeck.position.set(0, 3.18, 0);
  fbDeck.castShadow = true;
  footbridge.add(fbDeck);
  for (const fx of [-0.6, 0.6]) {
    const sideRail = new THREE.Mesh(track(new THREE.BoxGeometry(0.07, 0.56, 3.6)), fbSteelMat);
    sideRail.position.set(fx, 3.52, 0);
    footbridge.add(sideRail);
    // Four vertical support columns seated cleanly outside track ballast (z = ±1.72)
    for (const fz of [-1.72, 1.72]) {
      const col = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 3.22, 0.14)), fbSteelMat);
      col.position.set(fx, 1.61, fz);
      col.castShadow = true;
      footbridge.add(col);
    }
  }
  // North stair descending smoothly onto Station Parvis (local z = -1.80 -> -4.20, y = 3.18 -> 0.08)
  const buildFootbridgeStair = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    width: number
  ) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const stairGrp = new THREE.Group();
    stairGrp.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
    stairGrp.rotation.order = 'YXZ';
    stairGrp.rotation.y = Math.atan2(dx, dz);
    stairGrp.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
    const ramp = new THREE.Mesh(track(new THREE.BoxGeometry(width, 0.14, len)), fbSteelMat);
    ramp.castShadow = true;
    stairGrp.add(ramp);
    for (const rx of [-width * 0.48, width * 0.48]) {
      const rail = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.48, len)), fbSteelMat);
      rail.position.set(rx, 0.28, 0);
      stairGrp.add(rail);
    }
    footbridge.add(stairGrp);
  };
  // North stair landing onto Station Parvis (z = 25.45 - 4.2 = 21.25)
  buildFootbridgeStair(0, 3.18, -1.78, 0, 0.12, -4.18, 1.12);
  // South stair descending neatly along z = 27.15 (local +1.70) onto the Station Drop-Off Lay-By
  buildFootbridgeStair(0.58, 3.18, 1.66, 3.35, 0.12, 1.66, 0.78);
  stationFrontGroup.add(footbridge);

  group.add(stationFrontGroup);

  // =========================================================================
  // 8. VARIED MINIATURE VEHICLES (6 ANIMATED BIDIRECTIONAL + 2 PARKED AT STATION)
  // =========================================================================
  const carWheelGeo = track(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10));
  carWheelGeo.rotateZ(Math.PI / 2);
  const tireMat = track(new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.85 }));
  const carGlassMat = track(
    new THREE.MeshStandardMaterial({ color: 0x263547, roughness: 0.14, metalness: 0.45 })
  );
  const shadowDiscGeo = track(new THREE.PlaneGeometry(1.1, 1.75));
  shadowDiscGeo.rotateX(-Math.PI / 2);
  const shadowDiscMat = track(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.44,
    })
  );
  const crateWoodMat = track(new THREE.MeshStandardMaterial({ color: 0xa47449, roughness: 0.88 }));
  const tractorYellowMat = track(
    new THREE.MeshStandardMaterial({ color: 0xe0b238, roughness: 0.38, metalness: 0.22 })
  );

  type VehicleKind = 'car' | 'van' | 'pickup' | 'tractor';

  const buildMiniatureVehicle = (bodyHex: number, kind: VehicleKind): THREE.Group => {
    const veh = new THREE.Group();
    const paintMat = track(
      new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.32, metalness: 0.25 })
    );

    const sh = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
    sh.position.y = 0.025;
    veh.add(sh);

    if (kind === 'tractor') {
      // Animated miniature Red Farm Tractor cruising the plateau road
      const tChassis = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.24, 1.18)), ironMat);
      tChassis.position.y = 0.34;
      veh.add(tChassis);
      const tHood = new THREE.Mesh(track(new THREE.BoxGeometry(0.54, 0.38, 0.72)), paintMat);
      tHood.position.set(0, 0.58, 0.24);
      tHood.castShadow = true;
      veh.add(tHood);
      const tExhaust = new THREE.Mesh(track(new THREE.CylinderGeometry(0.036, 0.042, 0.48, 8)), ironMat);
      tExhaust.position.set(0.2, 0.9, 0.42);
      veh.add(tExhaust);
      const tRoof = new THREE.Mesh(track(new THREE.BoxGeometry(0.64, 0.06, 0.56)), paintMat);
      tRoof.position.set(0, 1.08, -0.24);
      veh.add(tRoof);
      for (const [px, pz] of [
        [-0.27, -0.48],
        [0.27, -0.48],
        [-0.27, 0.0],
        [0.27, 0.0],
      ]) {
        const strut = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.58, 0.04)), ironMat);
        strut.position.set(px, 0.78, pz);
        veh.add(strut);
      }
      const rWheelGeo = track(new THREE.CylinderGeometry(0.31, 0.31, 0.19, 12));
      rWheelGeo.rotateZ(Math.PI / 2);
      const rHubGeo = track(new THREE.CylinderGeometry(0.16, 0.16, 0.21, 10));
      rHubGeo.rotateZ(Math.PI / 2);
      const fWheelGeo = track(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 10));
      fWheelGeo.rotateZ(Math.PI / 2);
      for (const sx of [-0.38, 0.38]) {
        const rw = new THREE.Mesh(rWheelGeo, tireMat);
        rw.position.set(sx, 0.31, -0.34);
        rw.castShadow = true;
        veh.add(rw);
        const rh = new THREE.Mesh(rHubGeo, tractorYellowMat);
        rh.position.set(sx, 0.31, -0.34);
        veh.add(rh);
      }
      for (const sx of [-0.34, 0.34]) {
        const fw = new THREE.Mesh(fWheelGeo, tireMat);
        fw.position.set(sx, 0.19, 0.42);
        veh.add(fw);
      }
      const hlGeo = track(new THREE.BoxGeometry(0.11, 0.08, 0.05));
      for (const lx of [-0.18, 0.18]) {
        const hl = new THREE.Mesh(hlGeo, carHeadlightMat);
        hl.position.set(lx, 0.56, 0.62);
        veh.add(hl);
        const tl = new THREE.Mesh(hlGeo, carTaillightMat);
        tl.position.set(lx, 0.44, -0.6);
        veh.add(tl);
      }
      return veh;
    }

    // Car, Delivery Van, or Utility Pickup
    const bodyLen = kind === 'van' ? 1.56 : kind === 'pickup' ? 1.52 : 1.36;
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.72, 0.3, bodyLen)), paintMat);
    body.position.y = 0.26;
    body.castShadow = true;
    veh.add(body);

    if (kind === 'van') {
      // Taller box delivery van cargo body + cab windshield
      const cargo = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.44, 1.24)), paintMat);
      cargo.position.set(0, 0.6, -0.1);
      cargo.castShadow = true;
      veh.add(cargo);
      const windshield = new THREE.Mesh(track(new THREE.BoxGeometry(0.64, 0.28, 0.12)), carGlassMat);
      windshield.position.set(0, 0.56, 0.52);
      veh.add(windshield);
      const sideStripe = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.72, 0.08, 1.18)),
        track(new THREE.MeshStandardMaterial({ color: 0x2b5a84, roughness: 0.45 }))
      );
      sideStripe.position.set(0, 0.44, -0.1);
      veh.add(sideStripe);
    } else if (kind === 'pickup') {
      // Forward cab + open cargo bed carrying timber crates
      const cab = new THREE.Mesh(track(new THREE.BoxGeometry(0.66, 0.3, 0.56)), paintMat);
      cab.position.set(0, 0.54, 0.22);
      cab.castShadow = true;
      veh.add(cab);
      const glass = new THREE.Mesh(track(new THREE.BoxGeometry(0.68, 0.2, 0.46)), carGlassMat);
      glass.position.set(0, 0.54, 0.24);
      veh.add(glass);
      const crateA = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.26, 0.34)), crateWoodMat);
      crateA.position.set(0, 0.5, -0.36);
      crateA.castShadow = true;
      veh.add(crateA);
      const crateB = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.2, 0.26)), crateWoodMat);
      crateB.position.set(0.06, 0.72, -0.34);
      veh.add(crateB);
    } else {
      // Classic passenger car cabin greenhouse
      const cab = new THREE.Mesh(track(new THREE.BoxGeometry(0.64, 0.25, 0.7)), paintMat);
      cab.position.set(0, 0.53, -0.04);
      cab.castShadow = true;
      veh.add(cab);
      const glass = new THREE.Mesh(track(new THREE.BoxGeometry(0.66, 0.18, 0.62)), carGlassMat);
      glass.position.set(0, 0.52, -0.04);
      veh.add(glass);
    }

    for (const [wx, wz] of [
      [-0.35, 0.42],
      [0.35, 0.42],
      [-0.35, -0.42],
      [0.35, -0.42],
    ]) {
      const wheel = new THREE.Mesh(carWheelGeo, tireMat);
      wheel.position.set(wx, 0.14, wz);
      veh.add(wheel);
    }

    const hlGeo = track(new THREE.BoxGeometry(0.14, 0.085, 0.05));
    for (const lx of [-0.23, 0.23]) {
      const hl = new THREE.Mesh(hlGeo, carHeadlightMat);
      hl.position.set(lx, 0.27, bodyLen * 0.5 + 0.02);
      veh.add(hl);
      const tl = new THREE.Mesh(hlGeo, carTaillightMat);
      tl.position.set(lx, 0.27, -(bodyLen * 0.5 + 0.02));
      veh.add(tl);
    }

    return veh;
  };

  // Add 2 static parked miniature cars cleanly tucked into the dedicated Station Parking stalls
  const parkedCarA = buildMiniatureVehicle(0x6b7f94, 'car');
  parkedCarA.position.set(-6.2, parkingY + 0.01, 27.14);
  parkedCarA.rotation.y = Math.PI / 2;
  stationFrontGroup.add(parkedCarA);

  const parkedCarB = buildMiniatureVehicle(0xb84a39, 'car');
  parkedCarB.position.set(5.0, parkingY + 0.01, 27.14);
  parkedCarB.rotation.y = -Math.PI / 2;
  stationFrontGroup.add(parkedCarB);

  // 6 Varied Animated Vehicles circulating in BOTH directions across the entire plateau
  const roadLoopLen = vehicleLoopCurve.getLength();
  const vehicleSpecs: Array<{
    id: string;
    color: number;
    kind: VehicleKind;
    offsetFrac: number;
    speed: number;
    length: number;
    halfWheelbase: number;
  }> = [
    { id: 'car-red', color: 0xc93b33, kind: 'car', offsetFrac: 0.06, speed: 4.2, length: 1.4, halfWheelbase: 0.44 },
    { id: 'van-delivery', color: 0xf1ead8, kind: 'van', offsetFrac: 0.22, speed: 3.7, length: 1.6, halfWheelbase: 0.48 },
    { id: 'car-blue', color: 0x2c5686, kind: 'car', offsetFrac: 0.37, speed: 4.35, length: 1.4, halfWheelbase: 0.44 },
    { id: 'tractor-farm', color: 0xc83228, kind: 'tractor', offsetFrac: 0.53, speed: 2.55, length: 1.35, halfWheelbase: 0.4 },
    { id: 'pickup-rural', color: 0x537356, kind: 'pickup', offsetFrac: 0.71, speed: 3.9, length: 1.55, halfWheelbase: 0.46 },
    { id: 'car-mustard', color: 0xdca532, kind: 'car', offsetFrac: 0.87, speed: 4.15, length: 1.4, halfWheelbase: 0.44 },
  ];

  const vehicleActors: RoadVehicleActor[] = vehicleSpecs.map((spec) => {
    const mesh = buildMiniatureVehicle(spec.color, spec.kind);
    group.add(mesh);
    return {
      mesh,
      halfWheelbase: spec.halfWheelbase,
      state: {
        id: spec.id,
        dist: spec.offsetFrac * roadLoopLen,
        speed: spec.speed,
        maxSpeed: spec.speed,
        length: spec.length,
      },
    };
  });
  const vehicleStates: RoadVehicleState[] = vehicleActors.map((a) => a.state);

  // Reusable scratch objects (zero per-frame allocations)
  const _frontPos = new THREE.Vector3();
  const _rearPos = new THREE.Vector3();
  const _midPos = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _xAxis = new THREE.Vector3();
  const _yAxis = new THREE.Vector3();
  const _upVec = new THREE.Vector3(0, 1, 0);
  const _basisMat = new THREE.Matrix4();

  const placeVehicleOnRoad = (actor: RoadVehicleActor) => {
    const d = actor.state.dist;
    const uFront = wrapDistance(d + actor.halfWheelbase, roadLoopLen) / roadLoopLen;
    const uRear = wrapDistance(d - actor.halfWheelbase, roadLoopLen) / roadLoopLen;

    vehicleLoopCurve.getPointAt(uFront, _frontPos);
    vehicleLoopCurve.getPointAt(uRear, _rearPos);
    _frontPos.y = getRoadElevationAt(_frontPos.x, _frontPos.z);
    _rearPos.y = getRoadElevationAt(_rearPos.x, _rearPos.z);

    _midPos.addVectors(_frontPos, _rearPos).multiplyScalar(0.5);
    _fwd.subVectors(_frontPos, _rearPos);
    if (_fwd.lengthSq() < 1e-6) {
      vehicleLoopCurve.getTangentAt(wrapDistance(d, roadLoopLen) / roadLoopLen, _fwd);
    }
    _fwd.normalize();

    // Right-handed basis (det = +1): X = Up × Forward, Y = Forward × X, Z = Forward
    _xAxis.crossVectors(_upVec, _fwd).normalize();
    _yAxis.crossVectors(_fwd, _xAxis).normalize();
    _basisMat.makeBasis(_xAxis, _yAxis, _fwd);

    actor.mesh.position.copy(_midPos);
    actor.mesh.quaternion.setFromRotationMatrix(_basisMat);
  };

  // Place all 6 vehicles cleanly on frame 0
  vehicleActors.forEach(placeVehicleOnRoad);

  return {
    group,
    updateCarsAndPeople: (dt: number, elapsed: number, isCrossingClosed: boolean) => {
      // Gently animate waiting passengers on platform & station parvis
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        p.mesh.position.y = p.baseY + Math.abs(Math.sin(elapsed * 2.2 + p.phase)) * 0.018;
      }

      // Step bidirectional traffic with two-way level crossing stop & safe same-lane spacing
      stepRoadTraffic(vehicleStates, vehicleLoopCurve, roadLoopLen, dt, isCrossingClosed);

      for (let i = 0; i < vehicleActors.length; i++) {
        placeVehicleOnRoad(vehicleActors[i]);
      }
    },
    setNightFactor: (nightFactor: number) => {
      warmWindowMat.emissiveIntensity = 0.06 + nightFactor * 1.95;
      stationWindowMat.emissiveIntensity = 0.1 + nightFactor * 2.1;
      chapelGlassMat.emissiveIntensity = 0.12 + nightFactor * 1.85;
      lampGlobeMat.emissiveIntensity = 0.15 + nightFactor * 2.6;
      carHeadlightMat.emissiveIntensity = 0.35 + nightFactor * 2.8;
      carTaillightMat.emissiveIntensity = 0.35 + nightFactor * 2.1;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
