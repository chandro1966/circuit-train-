import * as THREE from 'three';
import {
  ALPINE_FREIGHT_CONTROL_POINTS,
  BOARD_D,
  BOARD_W,
  RIVER_CENTER_POINTS,
  SIDING_SEGMENT_POINTS,
  VALLEY_MAIN_CONTROL_POINTS,
  WATER_LEVEL,
  distanceToPolyline2D,
  getRiverDepthAt,
  getTerrainHeight,
} from '../sim/railwayMath';
import {
  FARM_ROUNDABOUT_CENTER,
  ROAD_CENTERLINE_POINTS,
  VILLAGE_ROUNDABOUT_CENTER,
} from '../sim/roadNetwork';
import type { ProceduralTexturePack } from './textures';

export interface TerrainBuildResult {
  group: THREE.Group;
  updateWater: (dt: number) => void;
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Builds the exhibition model railway table plinth, sculpted multi-elevation terrain,
 * animated mountain river, western pastures with fences/barn/cows/sheep, and InstancedMesh forests.
 */
export function buildTerrainAndNature(textures: ProceduralTexturePack): TerrainBuildResult {
  const group = new THREE.Group();
  group.name = 'TerrainAndNature';
  const disposables: Array<{ dispose: () => void }> = [];
  const trackDisposables = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // =========================================================================
  // 1. EXHIBITION TABLE PLINTH & STUDIO GALLERY BACKDROP FLOOR
  // =========================================================================
  const halfW = BOARD_W * 0.5;
  const halfD = BOARD_D * 0.5;
  const fasciaH = 3.2;
  const fasciaThick = 0.72;

  const walnutMat = trackDisposables(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.walnutMap,
      roughness: 0.52,
      metalness: 0.08,
    })
  );
  const darkBaseMat = trackDisposables(
    new THREE.MeshStandardMaterial({
      color: 0x1b1e23,
      roughness: 0.85,
      metalness: 0.1,
    })
  );
  const brassMat = trackDisposables(
    new THREE.MeshStandardMaterial({
      color: 0xd1a854,
      roughness: 0.28,
      metalness: 0.88,
    })
  );

  // Under-board structural sub-base
  const underBaseGeo = trackDisposables(new THREE.BoxGeometry(BOARD_W + 0.2, 2.2, BOARD_D + 0.2));
  const underBase = new THREE.Mesh(underBaseGeo, darkBaseMat);
  underBase.position.set(0, -2.55, 0);
  underBase.receiveShadow = true;
  group.add(underBase);

  // Four precision walnut fascia rim walls framing the diorama
  const frontBackGeo = trackDisposables(
    new THREE.BoxGeometry(BOARD_W + fasciaThick * 2, fasciaH, fasciaThick)
  );
  const leftRightGeo = trackDisposables(new THREE.BoxGeometry(fasciaThick, fasciaH, BOARD_D));

  const frontWall = new THREE.Mesh(frontBackGeo, walnutMat);
  frontWall.position.set(0, -1.2, halfD + fasciaThick * 0.5);
  frontWall.castShadow = true;
  frontWall.receiveShadow = true;
  group.add(frontWall);

  const backWall = new THREE.Mesh(frontBackGeo, walnutMat);
  backWall.position.set(0, -1.2, -(halfD + fasciaThick * 0.5));
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  const leftWall = new THREE.Mesh(leftRightGeo, walnutMat);
  leftWall.position.set(-(halfW + fasciaThick * 0.5), -1.2, 0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  const rightWall = new THREE.Mesh(leftRightGeo, walnutMat);
  rightWall.position.set(halfW + fasciaThick * 0.5, -1.2, 0);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  group.add(rightWall);

  // Brass corner brackets + exhibition nameplate on front fascia
  const bracketGeo = trackDisposables(new THREE.BoxGeometry(1.4, fasciaH + 0.08, 1.4));
  const corners: Array<[number, number]> = [
    [-halfW - fasciaThick * 0.35, halfD + fasciaThick * 0.35],
    [halfW + fasciaThick * 0.35, halfD + fasciaThick * 0.35],
    [-halfW - fasciaThick * 0.35, -halfD - fasciaThick * 0.35],
    [halfW + fasciaThick * 0.35, -halfD - fasciaThick * 0.35],
  ];
  for (const [cx, cz] of corners) {
    const b = new THREE.Mesh(bracketGeo, brassMat);
    b.position.set(cx, -1.2, cz);
    group.add(b);
  }

  // Brass plaque centered on front fascia
  const plaqueGeo = trackDisposables(new THREE.BoxGeometry(7.2, 0.9, 0.14));
  const plaque = new THREE.Mesh(plaqueGeo, brassMat);
  plaque.position.set(0, -1.25, halfD + fasciaThick + 0.06);
  group.add(plaque);

  // Sturdy exhibition table legs descending to studio gallery floor
  const legGeo = trackDisposables(new THREE.CylinderGeometry(0.65, 0.52, 12.0, 12));
  const legPositions: Array<[number, number]> = [
    [-halfW + 3.5, halfD - 3.5],
    [halfW - 3.5, halfD - 3.5],
    [-halfW + 3.5, -halfD + 3.5],
    [halfW - 3.5, -halfD + 3.5],
  ];
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, darkBaseMat);
    leg.position.set(lx, -9.4, lz);
    group.add(leg);
  }

  // Broad studio floor plane far below so the table stands solidly in an exhibition hall
  const studioFloorGeo = trackDisposables(new THREE.CircleGeometry(360, 48));
  studioFloorGeo.rotateX(-Math.PI / 2);
  const studioFloorMat = trackDisposables(
    new THREE.MeshStandardMaterial({
      color: 0x2a313b,
      roughness: 0.94,
      metalness: 0.02,
    })
  );
  const studioFloor = new THREE.Mesh(studioFloorGeo, studioFloorMat);
  studioFloor.position.y = -15.4;
  studioFloor.receiveShadow = true;
  group.add(studioFloor);

  // =========================================================================
  // 2. SCULPTED MULTI-ELEVATION TERRAIN MESH (VERTEX COLORED FLOCK + ROCK)
  // =========================================================================
  const segX = 168;
  const segZ = 114;
  const terrainGeo = trackDisposables(new THREE.PlaneGeometry(BOARD_W, BOARD_D, segX, segZ));
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getTerrainHeight(x, z);
    posAttr.setY(i, y);
  }
  terrainGeo.computeVertexNormals();
  const normAttr = terrainGeo.attributes.normal as THREE.BufferAttribute;

  const grassLow = new THREE.Color(0x527d3b);
  const grassBright = new THREE.Color(0x6b9444);
  const pastureColor = new THREE.Color(0x7ca249);
  const rockLight = new THREE.Color(0x7d7a72);
  const rockDark = new THREE.Color(0x56544f);
  const snowHint = new THREE.Color(0xc8cdc8);
  const riverBedColor = new THREE.Color(0x5c5243);
  const villageGround = new THREE.Color(0x6a8647);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const ny = normAttr.getY(i);
    const noise = Math.sin(x * 0.45) * Math.cos(z * 0.45) * 0.5 + 0.5;

    if (y < -0.25) {
      // Riverbed pebbles & wet banks
      tmpColor.copy(riverBedColor).lerp(grassLow, Math.max(0, (y + 1.4) / 1.2) * 0.4);
    } else if (ny < 0.87 || y > 4.2) {
      // Exposed alpine granite rock strata on cliffs, mountain flanks, and upper peaks
      const slopeRock = Math.max(0, (0.88 - ny) * 3.8);
      const heightRock = Math.max(0, (y - 3.8) * 0.24);
      const rockMix = Math.min(1, slopeRock + heightRock);
      const strata = 0.5 + 0.5 * Math.sin(y * 2.4 + x * 0.28 + z * 0.18);
      const rCol = tmpColor.copy(rockDark).lerp(rockLight, strata * 0.78 + noise * 0.22);
      if (y > 10.6 && ny > 0.55) {
        rCol.lerp(snowHint, Math.min(0.72, (y - 10.6) * 0.32));
      }
      const baseGrass = grassLow.clone().lerp(grassBright, noise);
      tmpColor.copy(baseGrass).lerp(rCol, rockMix);
    } else {
      // Valley grass, inner pasture & new western Grand Pré vibrant meadow variation
      const inInnerPasture = x < -8 && x > -23 && z > -2 && z < 10;
      const inGrandMeadow = x <= -27.2 && x >= -44.0 && z >= -4.5 && z <= 12.2;
      tmpColor
        .copy(grassLow)
        .lerp(inInnerPasture || inGrandMeadow ? pastureColor : grassBright, 0.4 + noise * 0.55);
      if (x > 5 && x < 28 && z > 0 && z < 11) {
        tmpColor.lerp(villageGround, 0.45);
      }
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const terrainMat = trackDisposables(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    })
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  group.add(terrainMesh);

  // Side skirts sealing the terrain edges cleanly down into the walnut frame
  const skirtMat = trackDisposables(
    new THREE.MeshStandardMaterial({ color: 0x433b32, roughness: 0.95, side: THREE.DoubleSide })
  );
  const buildEdgeSkirt = (points: Array<{ x: number; z: number }>) => {
    const verts: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const ya = getTerrainHeight(a.x, a.z);
      const yb = getTerrainHeight(b.x, b.z);
      const yBot = -2.0;
      verts.push(a.x, ya, a.z, b.x, yb, b.z, b.x, yBot, b.z);
      verts.push(a.x, ya, a.z, b.x, yBot, b.z, a.x, yBot, a.z);
    }
    const geo = trackDisposables(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, skirtMat);
    group.add(mesh);
  };

  const sampleEdge = (
    steps: number,
    fn: (t: number) => { x: number; z: number }
  ): Array<{ x: number; z: number }> => {
    const arr: Array<{ x: number; z: number }> = [];
    for (let i = 0; i <= steps; i++) arr.push(fn(i / steps));
    return arr;
  };
  buildEdgeSkirt(sampleEdge(64, (t) => ({ x: -halfW + t * BOARD_W, z: -halfD })));
  buildEdgeSkirt(sampleEdge(64, (t) => ({ x: halfW - t * BOARD_W, z: halfD })));
  buildEdgeSkirt(sampleEdge(44, (t) => ({ x: -halfW, z: halfD - t * BOARD_D })));
  buildEdgeSkirt(sampleEdge(44, (t) => ({ x: halfW, z: -halfD + t * BOARD_D })));

  // =========================================================================
  // 3. ANIMATED MOUNTAIN RIVER RIBBON & BOULDERS
  // =========================================================================
  const riverCurve = new THREE.CatmullRomCurve3(
    RIVER_CENTER_POINTS.map((p) => new THREE.Vector3(p.x, WATER_LEVEL, p.z))
  );
  const riverSteps = 90;
  const rPositions: number[] = [];
  const rUvs: number[] = [];
  const rIndices: number[] = [];

  for (let i = 0; i <= riverSteps; i++) {
    const t = i / riverSteps;
    const pt = riverCurve.getPointAt(t);
    const tan = riverCurve.getTangentAt(t);
    const perpX = -tan.z;
    const perpZ = tan.x;
    const hw = 2.6 - t * 0.5;

    rPositions.push(pt.x - perpX * hw, WATER_LEVEL, pt.z - perpZ * hw);
    rPositions.push(pt.x + perpX * hw, WATER_LEVEL, pt.z + perpZ * hw);
    rUvs.push(0, t * 8, 1, t * 8);

    if (i < riverSteps) {
      const base = i * 2;
      rIndices.push(base, base + 1, base + 2);
      rIndices.push(base + 1, base + 3, base + 2);
    }
  }
  const riverGeo = trackDisposables(new THREE.BufferGeometry());
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPositions, 3));
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUvs, 2));
  riverGeo.setIndex(rIndices);
  riverGeo.computeVertexNormals();

  const waterMat = trackDisposables(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.waterMap,
      roughness: 0.16,
      metalness: 0.22,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );
  const riverMesh = new THREE.Mesh(riverGeo, waterMat);
  riverMesh.receiveShadow = true;
  group.add(riverMesh);

  // Riverbank rocks & alpine boulders via InstancedMesh
  const rockGeo = trackDisposables(new THREE.DodecahedronGeometry(0.45, 0));
  const rockMat = trackDisposables(
    new THREE.MeshStandardMaterial({
      color: 0x848078,
      roughness: 0.9,
      metalness: 0.04,
    })
  );
  const rockRand = seededRand(77);
  const rockTransforms: Array<{ pos: THREE.Vector3; scale: THREE.Vector3; rot: THREE.Euler; tint: number }> = [];
  for (let i = 0; i < 95; i++) {
    const t = rockRand();
    const pt = riverCurve.getPointAt(t);
    const tan = riverCurve.getTangentAt(t);
    const side = rockRand() > 0.5 ? 1 : -1;
    const dist = 1.6 + rockRand() * 1.4;
    const rx = pt.x + -tan.z * side * dist;
    const rz = pt.z + tan.x * side * dist;
    if (Math.abs(rx) > halfW - 1.5 || Math.abs(rz) > halfD - 1.5) continue;
    const ry = getTerrainHeight(rx, rz);
    rockTransforms.push({
      pos: new THREE.Vector3(rx, ry + 0.08, rz),
      scale: new THREE.Vector3(0.6 + rockRand() * 1.2, 0.45 + rockRand() * 0.7, 0.6 + rockRand() * 1.1),
      rot: new THREE.Euler(rockRand() * Math.PI, rockRand() * Math.PI, rockRand() * Math.PI),
      tint: 0.78 + rockRand() * 0.36,
    });
  }
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockTransforms.length);
  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  rockTransforms.forEach((rt, idx) => {
    dummy.position.copy(rt.pos);
    dummy.rotation.copy(rt.rot);
    dummy.scale.copy(rt.scale);
    dummy.updateMatrix();
    rockInst.setMatrixAt(idx, dummy.matrix);
    cTmp.setRGB(rt.tint * 0.62, rt.tint * 0.6, rt.tint * 0.56);
    rockInst.setColorAt(idx, cTmp);
  });
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;
  group.add(rockInst);

  // =========================================================================
  // 4. PASTURES: FENCES, WOODEN HAY BARN, HAY BALES, COWS & SHEEP
  // =========================================================================
  const pastureGroup = new THREE.Group();
  const fenceWoodMat = trackDisposables(
    new THREE.MeshStandardMaterial({ color: 0x7c5b3e, roughness: 0.9, metalness: 0.02 })
  );
  const fenceLoop: Array<[number, number]> = [
    [-21.2, 1.4],
    [-16.4, 0.4],
    [-12.4, 2.0],
    [-13.5, 5.4],
    [-17.8, 6.2],
    [-21.5, 4.4],
  ];
  const postGeo = trackDisposables(new THREE.BoxGeometry(0.12, 0.75, 0.12));
  const railGeo = trackDisposables(new THREE.BoxGeometry(1, 0.08, 0.06));
  for (let i = 0; i < fenceLoop.length; i++) {
    const [x1, z1] = fenceLoop[i];
    const [x2, z2] = fenceLoop[(i + 1) % fenceLoop.length];
    const segLen = Math.hypot(x2 - x1, z2 - z1);
    const subCount = Math.max(2, Math.round(segLen / 1.55));
    for (let s = 0; s < subCount; s++) {
      const f0 = s / subCount;
      const f1 = (s + 1) / subCount;
      const px = x1 + (x2 - x1) * f0;
      const pz = z1 + (z2 - z1) * f0;
      const py = getTerrainHeight(px, pz);
      const post = new THREE.Mesh(postGeo, fenceWoodMat);
      post.position.set(px, py + 0.35, pz);
      pastureGroup.add(post);

      const mx = x1 + (x2 - x1) * ((f0 + f1) * 0.5);
      const mz = z1 + (z2 - z1) * ((f0 + f1) * 0.5);
      const my = getTerrainHeight(mx, mz);
      const ang = Math.atan2(z2 - z1, x2 - x1);
      const subLen = segLen / subCount;
      for (const railY of [0.28, 0.54]) {
        const rail = new THREE.Mesh(railGeo, fenceWoodMat);
        rail.scale.x = subLen;
        rail.position.set(mx, my + railY, mz);
        rail.rotation.y = -ang;
        pastureGroup.add(rail);
      }
    }
  }

  // Small rustic wooden hay barn at pasture edge (-19.6, 5.2)
  const barn = new THREE.Group();
  const barnBaseY = getTerrainHeight(-19.5, 5.0);
  barn.position.set(-19.5, barnBaseY, 5.0);
  barn.rotation.y = 0.32;
  const barnWallMat = trackDisposables(
    new THREE.MeshStandardMaterial({ color: 0x7b4c32, roughness: 0.88 })
  );
  const barnRoofMat = trackDisposables(
    new THREE.MeshStandardMaterial({ color: 0x8e4232, roughness: 0.75 })
  );
  const barnBody = new THREE.Mesh(trackDisposables(new THREE.BoxGeometry(2.6, 1.55, 1.85)), barnWallMat);
  barnBody.position.y = 0.775;
  barnBody.castShadow = true;
  barnBody.receiveShadow = true;
  barn.add(barnBody);
  const barnRoofGeo = trackDisposables(new THREE.ConeGeometry(2.0, 0.95, 4));
  barnRoofGeo.rotateY(Math.PI / 4);
  const barnRoof = new THREE.Mesh(barnRoofGeo, barnRoofMat);
  barnRoof.scale.set(1.06, 1, 0.78);
  barnRoof.position.y = 2.02;
  barnRoof.castShadow = true;
  barn.add(barnRoof);
  const barnDoor = new THREE.Mesh(
    trackDisposables(new THREE.BoxGeometry(0.85, 1.15, 0.08)),
    trackDisposables(new THREE.MeshStandardMaterial({ color: 0x3b2517, roughness: 0.9 }))
  );
  barnDoor.position.set(0, 0.58, 0.93);
  barn.add(barnDoor);
  pastureGroup.add(barn);

  // Golden hay bales near barn
  const hayMat = trackDisposables(new THREE.MeshStandardMaterial({ color: 0xd4b258, roughness: 0.94 }));
  const hayGeo = trackDisposables(new THREE.CylinderGeometry(0.32, 0.32, 0.52, 12));
  hayGeo.rotateZ(Math.PI / 2);
  for (const [hx, hz, rot] of [
    [-17.2, 4.8, 0.4],
    [-16.5, 5.1, 1.1],
    [-17.0, 5.4, -0.3],
  ] as Array<[number, number, number]>) {
    const hay = new THREE.Mesh(hayGeo, hayMat);
    hay.position.set(hx, getTerrainHeight(hx, hz) + 0.3, hz);
    hay.rotation.y = rot;
    hay.castShadow = true;
    pastureGroup.add(hay);
  }

  // Composite miniature spotted cows (multi-part Groups)
  const cowWhiteMat = trackDisposables(new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.82 }));
  const cowSpotMat = trackDisposables(new THREE.MeshStandardMaterial({ color: 0x262320, roughness: 0.85 }));
  const cowBodyGeo = trackDisposables(new THREE.BoxGeometry(0.68, 0.36, 0.32));
  const cowHeadGeo = trackDisposables(new THREE.BoxGeometry(0.24, 0.22, 0.22));
  const cowLegGeo = trackDisposables(new THREE.BoxGeometry(0.08, 0.24, 0.08));
  const cowSpotGeo = trackDisposables(new THREE.BoxGeometry(0.24, 0.22, 0.34));

  const buildCow = (x: number, z: number, rotY: number) => {
    const cow = new THREE.Group();
    cow.position.set(x, getTerrainHeight(x, z), z);
    cow.rotation.y = rotY;
    const body = new THREE.Mesh(cowBodyGeo, cowWhiteMat);
    body.position.y = 0.38;
    body.castShadow = true;
    cow.add(body);
    const spot = new THREE.Mesh(cowSpotGeo, cowSpotMat);
    spot.position.set(0.05, 0.4, 0);
    cow.add(spot);
    const head = new THREE.Mesh(cowHeadGeo, cowSpotMat);
    head.position.set(0.42, 0.44, 0);
    cow.add(head);
    for (const [lx, lz] of [
      [-0.22, -0.1],
      [-0.22, 0.1],
      [0.22, -0.1],
      [0.22, 0.1],
    ]) {
      const leg = new THREE.Mesh(cowLegGeo, cowSpotMat);
      leg.position.set(lx, 0.12, lz);
      cow.add(leg);
    }
    return cow;
  };
  for (const [cx, cz, cr] of [
    [-18.6, 2.2, 0.6],
    [-16.4, 2.7, -1.1],
    [-15.0, 3.6, 2.2],
    [-17.9, 3.8, 0.2],
    [-14.2, 2.0, -0.4],
  ] as Array<[number, number, number]>) {
    pastureGroup.add(buildCow(cx, cz, cr));
  }

  // Composite miniature sheep (multi-part fluffy body + dark face & legs)
  const sheepWoolMat = trackDisposables(new THREE.MeshStandardMaterial({ color: 0xf4f0e4, roughness: 0.95 }));
  const sheepHeadMat = trackDisposables(new THREE.MeshStandardMaterial({ color: 0x35312c, roughness: 0.85 }));
  const sheepBodyGeo = trackDisposables(new THREE.DodecahedronGeometry(0.24, 1));
  const sheepHeadGeo = trackDisposables(new THREE.BoxGeometry(0.14, 0.14, 0.13));
  const sheepLegGeo = trackDisposables(new THREE.BoxGeometry(0.05, 0.16, 0.05));

  const buildSheep = (x: number, z: number, rotY: number) => {
    const sh = new THREE.Group();
    sh.position.set(x, getTerrainHeight(x, z), z);
    sh.rotation.y = rotY;
    const wool = new THREE.Mesh(sheepBodyGeo, sheepWoolMat);
    wool.scale.set(1.25, 0.95, 0.92);
    wool.position.y = 0.26;
    wool.castShadow = true;
    sh.add(wool);
    const head = new THREE.Mesh(sheepHeadGeo, sheepHeadMat);
    head.position.set(0.28, 0.28, 0);
    sh.add(head);
    for (const [lx, lz] of [
      [-0.12, -0.07],
      [-0.12, 0.07],
      [0.12, -0.07],
      [0.12, 0.07],
    ]) {
      const leg = new THREE.Mesh(sheepLegGeo, sheepHeadMat);
      leg.position.set(lx, 0.08, lz);
      sh.add(leg);
    }
    return sh;
  };
  for (const [sx, sz, sr] of [
    [-19.8, 2.9, 1.3],
    [-20.3, 3.6, 0.4],
    [-19.3, 3.8, -0.8],
    [-15.7, 4.4, 2.5],
    [-14.8, 4.7, 1.8],
    [-13.8, 4.1, -1.9],
  ] as Array<[number, number, number]>) {
    pastureGroup.add(buildSheep(sx, sz, sr));
  }
  group.add(pastureGroup);

  // =========================================================================
  // 5. INSTANCED CONIFER & DECIDUOUS FORESTS
  // =========================================================================
  const treeRand = seededRand(909);
  const coniferSpots: Array<{ x: number; y: number; z: number; scale: number; rot: number; tint: number }> = [];
  const broadleafSpots: Array<{ x: number; y: number; z: number; scale: number; rot: number; tint: number }> = [];

  const isClearForTree = (x: number, z: number): boolean => {
    if (Math.abs(x) > halfW - 1.4 || Math.abs(z) > halfD - 1.4) return false;
    // Keep river bed clear
    if (getRiverDepthAt(x, z) > 0.12) return false;
    // Keep Valley Main track & siding clear
    if (distanceToPolyline2D(x, z, VALLEY_MAIN_CONTROL_POINTS, true) < 2.5) return false;
    if (distanceToPolyline2D(x, z, SIDING_SEGMENT_POINTS, false) < 2.5) return false;
    // Keep entire connected Alpine Viaduct, East Ramp & Southern Descent clear (allow trees right above deep tunnels)
    const h = getTerrainHeight(x, z);
    const distAlpine = distanceToPolyline2D(x, z, ALPINE_FREIGHT_CONTROL_POINTS, false);
    if (distAlpine < 2.75 && h < 7.4) return false;
    // Keep village square, houses, station & forecourt clear
    if (x > 5.5 && x < 23.0 && z > -1.0 && z < 11.0) return false;
    if (x > -18.5 && x < 18.5 && z > 8.0 && z < 21.5) return false;
    // Keep wide departmental road, both roundabouts, level crossing & Station Parking bay clear
    if (distanceToPolyline2D(x, z, ROAD_CENTERLINE_POINTS, false) < 2.85) return false;
    if (Math.hypot(x - VILLAGE_ROUNDABOUT_CENTER.x, z - VILLAGE_ROUNDABOUT_CENTER.z) < 3.8) return false;
    if (Math.hypot(x - FARM_ROUNDABOUT_CENTER.x, z - FARM_ROUNDABOUT_CENTER.z) < 3.8) return false;
    if (x > -10.5 && x < 10.5 && z > 18.8 && z < 30.8) return false;
    // Keep western inner pasture enclosure open for cows & sheep
    if (x > -22.0 && x < -11.8 && z > 0.0 && z < 6.8) return false;
    // Keep Western Farmstead, Grand Pré aux Vaches, and Crop Field clear of random forest trees
    if (x < -25.8 && z > -4.8 && z < 29.6) return false;
    // Keep hilltop chapel platform clear
    if (Math.hypot(x - 16.6, z - -7.2) < 3.4) return false;
    return true;
  };

  // Place conifers predominantly on mountain slopes, foothills & outer borders across doubled plateau
  for (let attempt = 0; attempt < 2200 && coniferSpots.length < 385; attempt++) {
    const x = (treeRand() - 0.5) * (BOARD_W - 2.6);
    const z = (treeRand() - 0.5) * (BOARD_D - 2.6);
    if (!isClearForTree(x, z)) continue;
    const y = getTerrainHeight(x, z);
    // Prefer elevated slopes and forest fringes
    if (y < 0.25 && z > 2 && x > -26 && x < 31 && treeRand() > 0.2) continue;
    if (y > 12.4) continue; // Keep very highest crag tips bare granite
    coniferSpots.push({
      x,
      y,
      z,
      scale: 0.78 + treeRand() * 0.65,
      rot: treeRand() * Math.PI * 2,
      tint: treeRand(),
    });
  }

  // Place broadleaf deciduous trees across valley edges, village gardens, farm perimeter & countryside
  for (let attempt = 0; attempt < 1100 && broadleafSpots.length < 130; attempt++) {
    const x = (treeRand() - 0.5) * (BOARD_W - 3.0);
    const z = -10.0 + treeRand() * (halfD + 8.5);
    if (!isClearForTree(x, z)) continue;
    const y = getTerrainHeight(x, z);
    if (y > 4.4 || y < -0.15) continue;
    broadleafSpots.push({
      x,
      y,
      z,
      scale: 0.8 + treeRand() * 0.54,
      rot: treeRand() * Math.PI * 2,
      tint: treeRand(),
    });
  }

  // Build InstancedMesh multi-tiered conifers (trunk + 3 stacked tiered foliage layers = 4 draw calls total!)
  const trunkMat = trackDisposables(new THREE.MeshStandardMaterial({ color: 0x513825, roughness: 0.94 }));
  const pineMat = trackDisposables(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }));

  const cTrunkGeo = trackDisposables(new THREE.CylinderGeometry(0.11, 0.16, 0.8, 6));
  cTrunkGeo.translate(0, 0.4, 0);
  const cCone1Geo = trackDisposables(new THREE.ConeGeometry(0.95, 1.55, 7));
  cCone1Geo.translate(0, 1.35, 0);
  const cCone2Geo = trackDisposables(new THREE.ConeGeometry(0.75, 1.4, 7));
  cCone2Geo.translate(0, 2.2, 0);
  const cCone3Geo = trackDisposables(new THREE.ConeGeometry(0.5, 1.15, 7));
  cCone3Geo.translate(0, 2.95, 0);

  const cCount = coniferSpots.length;
  const cTrunks = new THREE.InstancedMesh(cTrunkGeo, trunkMat, cCount);
  const cTier1 = new THREE.InstancedMesh(cCone1Geo, pineMat, cCount);
  const cTier2 = new THREE.InstancedMesh(cCone2Geo, pineMat, cCount);
  const cTier3 = new THREE.InstancedMesh(cCone3Geo, pineMat, cCount);

  const pineA = new THREE.Color(0x214a2b);
  const pineB = new THREE.Color(0x2f6338);
  const pineC = new THREE.Color(0x1b3c27);

  coniferSpots.forEach((sp, i) => {
    dummy.position.set(sp.x, sp.y - 0.12, sp.z);
    dummy.rotation.set(0, sp.rot, 0);
    dummy.scale.set(sp.scale, sp.scale * (0.95 + sp.tint * 0.22), sp.scale);
    dummy.updateMatrix();

    cTrunks.setMatrixAt(i, dummy.matrix);
    cTier1.setMatrixAt(i, dummy.matrix);
    cTier2.setMatrixAt(i, dummy.matrix);
    cTier3.setMatrixAt(i, dummy.matrix);

    cTmp.copy(pineA).lerp(sp.tint > 0.5 ? pineB : pineC, Math.abs(sp.tint - 0.5) * 1.8);
    cTier1.setColorAt(i, cTmp);
    cTier2.setColorAt(i, cTmp.clone().multiplyScalar(1.07));
    cTier3.setColorAt(i, cTmp.clone().multiplyScalar(1.14));
  });

  for (const m of [cTrunks, cTier1, cTier2, cTier3]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // Build InstancedMesh broadleaf deciduous trees (trunk + 2-lobe organic foliage crown)
  const bTrunkGeo = trackDisposables(new THREE.CylinderGeometry(0.12, 0.18, 1.15, 6));
  bTrunkGeo.translate(0, 0.58, 0);
  const bCrown1Geo = trackDisposables(new THREE.DodecahedronGeometry(0.88, 1));
  bCrown1Geo.translate(0, 1.72, 0);
  const bCrown2Geo = trackDisposables(new THREE.DodecahedronGeometry(0.64, 1));
  bCrown2Geo.translate(0.32, 2.02, 0.2);

  const bLeafMat = trackDisposables(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 }));
  const bCount = broadleafSpots.length;
  const bTrunks = new THREE.InstancedMesh(bTrunkGeo, trunkMat, bCount);
  const bCrown1 = new THREE.InstancedMesh(bCrown1Geo, bLeafMat, bCount);
  const bCrown2 = new THREE.InstancedMesh(bCrown2Geo, bLeafMat, bCount);

  const leafA = new THREE.Color(0x4c7e35);
  const leafB = new THREE.Color(0x6e983c);
  const leafC = new THREE.Color(0x8a9237);

  broadleafSpots.forEach((sp, i) => {
    dummy.position.set(sp.x, sp.y - 0.1, sp.z);
    dummy.rotation.set(0, sp.rot, 0);
    dummy.scale.setScalar(sp.scale);
    dummy.updateMatrix();
    bTrunks.setMatrixAt(i, dummy.matrix);
    bCrown1.setMatrixAt(i, dummy.matrix);
    bCrown2.setMatrixAt(i, dummy.matrix);

    cTmp.copy(leafA).lerp(sp.tint > 0.65 ? leafC : leafB, sp.tint);
    bCrown1.setColorAt(i, cTmp);
    bCrown2.setColorAt(i, cTmp.clone().multiplyScalar(1.08));
  });

  for (const m of [bTrunks, bCrown1, bCrown2]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  return {
    group,
    updateWater: (dt: number) => {
      textures.waterMap.offset.y -= dt * 0.28;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
