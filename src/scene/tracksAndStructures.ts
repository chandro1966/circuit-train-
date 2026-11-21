import * as THREE from 'three';
import {
  DEAD_END_SPUR_POINTS,
  EAST_JUNCTION_POS,
  EAST_OVERPASS_POS,
  EAST_TURNOUT_POS,
  LEVEL_CROSSING_POS,
  LOOP_ALPINE_POINTS,
  LOOP_VALLEY_POINTS,
  SIDING_SEGMENT_POINTS,
  TRUNK_MAIN_POINTS,
  TRUNK_SIDING_POINTS,
  VALLEY_RAIL_Y,
  WEST_JUNCTION_POS,
  WEST_TURNOUT_POS,
  distanceToPolyline2D,
  getTerrainHeight,
} from '../sim/railwayMath';
import { ROAD_CENTERLINE_POINTS } from '../sim/roadNetwork';
import type { LoopId, SegmentId, SignalAspect, SwitchRoute } from '../sim/types';
import type { ProceduralTexturePack } from './textures';

export interface TracksAndStructuresResult {
  group: THREE.Group;
  curves: Record<SegmentId, THREE.CatmullRomCurve3>;
  updateTurnoutVisual: (
    stationRoute: SwitchRoute,
    westSwitchTarget: LoopId,
    eastSwitchTarget: LoopId,
    signalValleyAspect: SignalAspect,
    signalAlpineAspect: SignalAspect,
    signalExitAspect: SignalAspect,
    dt: number
  ) => void;
  updateCrossingVisual: (barrierAngle: number, isClosed: boolean, elapsed: number) => void;
  setNightFactor: (nightFactor: number) => void;
  dispose: () => void;
}

const RAIL_GAUGE = 0.92;
const HALF_GAUGE = RAIL_GAUGE * 0.5;

/**
 * Helper to sweep a 2D cross-section profile along a CatmullRomCurve3 to create
 * continuous, crisp ballast roadbeds or gleaming steel rails with zero gaps.
 */
function buildSweptRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  samples: number,
  closed: boolean,
  profile: Array<[number, number]>,
  uvScaleV = 0.35
): THREE.BufferGeometry {
  const pts = curve.getSpacedPoints(samples);
  const segCount = samples;
  const ringLen = profile.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3();
  const right = new THREE.Vector3();
  let accumLen = 0;

  for (let i = 0; i <= segCount; i++) {
    const idx = closed ? i % samples : i;
    const p = pts[idx];
    if (i > 0) {
      const prev = pts[closed ? (i - 1) % samples : i - 1];
      accumLen += p.distanceTo(prev);
    }

    if (!closed && i === 0) {
      tan.subVectors(pts[1], pts[0]).normalize();
    } else if (!closed && i === segCount) {
      tan.subVectors(pts[samples], pts[samples - 1]).normalize();
    } else {
      const pPrev = pts[closed ? (idx - 1 + samples) % samples : idx - 1];
      const pNext = pts[closed ? (idx + 1) % samples : idx + 1];
      tan.subVectors(pNext, pPrev).normalize();
    }

    right.crossVectors(tan, up).normalize();

    for (let j = 0; j < ringLen; j++) {
      const [lat, vert] = profile[j];
      positions.push(p.x + right.x * lat, p.y + vert, p.z + right.z * lat);
      uvs.push(j / (ringLen - 1), accumLen * uvScaleV);
    }

    if (i < segCount) {
      const rowA = i * ringLen;
      const rowB = (i + 1) * ringLen;
      for (let j = 0; j < ringLen - 1; j++) {
        const a = rowA + j;
        const b = rowA + j + 1;
        const c = rowB + j;
        const d = rowB + j + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface ThreeAspectSignalRig {
  redMat: THREE.MeshStandardMaterial;
  amberMat: THREE.MeshStandardMaterial;
  greenMat: THREE.MeshStandardMaterial;
}

export function buildTracksAndStructures(textures: ProceduralTexturePack): TracksAndStructuresResult {
  const group = new THREE.Group();
  group.name = 'TracksAndStructures';

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Authoritative interconnected 3D rail curves (open C1-continuous graph segments)
  const curves: Record<SegmentId, THREE.CatmullRomCurve3> = {
    trunk_main: new THREE.CatmullRomCurve3(
      TRUNK_MAIN_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      false,
      'centripetal',
      0.5
    ),
    trunk_siding: new THREE.CatmullRomCurve3(
      TRUNK_SIDING_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      false,
      'centripetal',
      0.5
    ),
    loop_valley: new THREE.CatmullRomCurve3(
      LOOP_VALLEY_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      false,
      'centripetal',
      0.5
    ),
    loop_alpine: new THREE.CatmullRomCurve3(
      LOOP_ALPINE_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      false,
      'centripetal',
      0.5
    ),
  };

  const sidingVisualCurve = new THREE.CatmullRomCurve3(
    SIDING_SEGMENT_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    false,
    'centripetal',
    0.5
  );
  const spurCurve = new THREE.CatmullRomCurve3(
    DEAD_END_SPUR_POINTS.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    false,
    'centripetal',
    0.5
  );

  // Shared materials
  const ballastMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.ballastMap,
      bumpMap: textures.ballastBump,
      bumpScale: 0.08,
      roughness: 0.94,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  const sleeperMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x4b3626,
      roughness: 0.9,
      metalness: 0.04,
    })
  );
  const railMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xcfd6de,
      roughness: 0.24,
      metalness: 0.88,
    })
  );
  const stoneMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.stoneMap,
      bumpMap: textures.stoneBump,
      bumpScale: 0.14,
      roughness: 0.86,
      metalness: 0.04,
    })
  );
  const stoneTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xa7a093,
      roughness: 0.82,
      metalness: 0.04,
    })
  );
  const trussSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3f4e52,
      roughness: 0.42,
      metalness: 0.68,
    })
  );
  const darkTunnelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0c0e12,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    })
  );
  const redSafetyMat = track(new THREE.MeshStandardMaterial({ color: 0xc92c28, roughness: 0.45 }));
  const whiteSafetyMat = track(new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }));
  const signalHousingMat = track(new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.55 }));

  // =========================================================================
  // 1. CONTINUOUS BALLAST, INSTANCED SLEEPERS & TWIN STEEL RAILS
  // =========================================================================
  const ballastProfile: Array<[number, number]> = [
    [-1.12, -0.34],
    [-0.78, -0.14],
    [0.78, -0.14],
    [1.12, -0.34],
  ];
  const makeRailProfile = (offset: number): Array<[number, number]> => [
    [offset - 0.045, -0.09],
    [offset - 0.045, 0.03],
    [offset + 0.045, 0.03],
    [offset + 0.045, -0.09],
  ];

  const sleeperMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const rotMat = new THREE.Matrix4();

  const buildTrackOnCurve = (curve: THREE.CatmullRomCurve3, samples: number, sleeperSpacing = 0.58) => {
    const ballastGeo = track(buildSweptRibbonGeometry(curve, samples, false, ballastProfile, 0.55));
    const ballastMesh = new THREE.Mesh(ballastGeo, ballastMat);
    ballastMesh.receiveShadow = true;
    group.add(ballastMesh);

    for (const side of [-HALF_GAUGE, HALF_GAUGE]) {
      const railGeo = track(buildSweptRibbonGeometry(curve, samples, false, makeRailProfile(side), 0.2));
      const railMesh = new THREE.Mesh(railGeo, railMat);
      railMesh.castShadow = true;
      railMesh.receiveShadow = true;
      group.add(railMesh);
    }

    const totalLen = curve.getLength();
    const sleeperCount = Math.max(4, Math.floor(totalLen / sleeperSpacing));
    for (let i = 0; i <= sleeperCount; i++) {
      const u = i / sleeperCount;
      const pos = curve.getPointAt(u);
      const tan = curve.getTangentAt(u).normalize();
      // Right-handed basis (det = +1)
      xAxis.crossVectors(upVec, tan).normalize();
      yAxis.crossVectors(tan, xAxis).normalize();
      rotMat.makeBasis(xAxis, yAxis, tan);

      dummy.position.set(pos.x, pos.y - 0.115, pos.z);
      dummy.quaternion.setFromRotationMatrix(rotMat);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      sleeperMatrices.push(dummy.matrix.clone());
    }
  };

  // Build all connected segments + station siding + goods spur
  buildTrackOnCurve(curves.trunk_main, 64, 0.56);
  buildTrackOnCurve(curves.loop_valley, 240, 0.58);
  buildTrackOnCurve(curves.loop_alpine, 520, 0.62);
  buildTrackOnCurve(sidingVisualCurve, 64, 0.58);
  buildTrackOnCurve(spurCurve, 34, 0.62);

  // Single InstancedMesh for all wooden sleepers across the entire interconnected layout
  const sleeperGeo = track(new THREE.BoxGeometry(1.42, 0.08, 0.2));
  const sleeperInst = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperMatrices.length);
  sleeperInst.receiveShadow = true;
  sleeperMatrices.forEach((m, i) => sleeperInst.setMatrixAt(i, m));
  sleeperInst.instanceMatrix.needsUpdate = true;
  group.add(sleeperInst);

  // Buffer stop + parked vintage boxcar on the dead-end goods spur
  const spurEnd = spurCurve.getPointAt(1);
  const spurTan = spurCurve.getTangentAt(1);
  const bufferStop = new THREE.Group();
  bufferStop.position.set(spurEnd.x, spurEnd.y, spurEnd.z);
  bufferStop.rotation.y = Math.atan2(spurTan.x, spurTan.z);
  const bufFrame = new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 0.55, 0.14)), redSafetyMat);
  bufFrame.position.set(0, 0.34, 0);
  bufferStop.add(bufFrame);
  const bufStripe = new THREE.Mesh(track(new THREE.BoxGeometry(0.95, 0.16, 0.16)), whiteSafetyMat);
  bufStripe.position.set(0, 0.36, 0);
  bufferStop.add(bufStripe);
  for (const sx of [-0.46, 0.46]) {
    const strut = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.68, 0.08)), trussSteelMat);
    strut.position.set(sx, 0.25, -0.22);
    strut.rotation.x = 0.55;
    bufferStop.add(strut);
  }
  group.add(bufferStop);

  // Static parked freight boxcar near the buffer stop
  const parkedPt = spurCurve.getPointAt(0.7);
  const parkedTan = spurCurve.getTangentAt(0.7);
  const parkedBoxcar = new THREE.Group();
  parkedBoxcar.position.set(parkedPt.x, parkedPt.y, parkedPt.z);
  parkedBoxcar.rotation.y = Math.atan2(parkedTan.x, parkedTan.z);
  const pBody = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.22, 1.05, 2.55)),
    track(new THREE.MeshStandardMaterial({ color: 0x7c3e2c, roughness: 0.82 }))
  );
  pBody.position.y = 0.85;
  pBody.castShadow = true;
  pBody.receiveShadow = true;
  parkedBoxcar.add(pBody);
  const pRoof = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.3, 0.16, 2.65)),
    track(new THREE.MeshStandardMaterial({ color: 0x454a50, roughness: 0.72 }))
  );
  pRoof.position.y = 1.44;
  pRoof.castShadow = true;
  parkedBoxcar.add(pRoof);
  const pChassis = new THREE.Mesh(track(new THREE.BoxGeometry(1.12, 0.24, 2.6)), trussSteelMat);
  pChassis.position.y = 0.26;
  parkedBoxcar.add(pChassis);
  group.add(parkedBoxcar);

  // =========================================================================
  // 2. CURVED STONE ARCH VIADUCT (GRAND VIADUC EN ARC DE PIERRE)
  // =========================================================================
  const viaductGroup = new THREE.Group();
  viaductGroup.name = 'CurvedStoneViaduct';

  const viaductSamples: THREE.Vector3[] = [];
  const totalAlpineSamples = 600;
  for (let i = 0; i <= totalAlpineSamples; i++) {
    const p = curves.loop_alpine.getPointAt(i / totalAlpineSamples);
    if (p.y > 5.15 && p.z > -7.2 && p.z < -2.2 && p.x > -15.4 && p.x < 15.6) {
      viaductSamples.push(p);
    }
  }
  viaductSamples.sort((a, b) => a.x - b.x);

  if (viaductSamples.length >= 6) {
    const vCurve = new THREE.CatmullRomCurve3(viaductSamples, false, 'centripetal', 0.5);

    const deckProfile: Array<[number, number]> = [
      [-1.32, -0.58],
      [-1.32, 0.28],
      [-1.12, 0.28],
      [-1.12, -0.18],
      [1.12, -0.18],
      [1.12, 0.28],
      [1.32, 0.28],
      [1.32, -0.58],
    ];
    const deckGeo = track(buildSweptRibbonGeometry(vCurve, 64, false, deckProfile, 0.4));
    const deckMesh = new THREE.Mesh(deckGeo, stoneMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    viaductGroup.add(deckMesh);

    const copingProfileL: Array<[number, number]> = [
      [-1.38, 0.28],
      [-1.38, 0.36],
      [-1.08, 0.36],
      [-1.08, 0.28],
    ];
    const copingProfileR: Array<[number, number]> = [
      [1.08, 0.28],
      [1.08, 0.36],
      [1.38, 0.36],
      [1.38, 0.28],
    ];
    for (const prof of [copingProfileL, copingProfileR]) {
      const cGeo = track(buildSweptRibbonGeometry(vCurve, 64, false, prof, 0.35));
      const cMesh = new THREE.Mesh(cGeo, stoneTrimMat);
      cMesh.castShadow = true;
      viaductGroup.add(cMesh);
    }

    const numArches = 6;
    for (let i = 0; i <= numArches; i++) {
      const u = i / numArches;
      const pt = vCurve.getPointAt(u);
      const tan = vCurve.getTangentAt(u).normalize();
      const angle = Math.atan2(tan.x, tan.z);
      const groundY = Math.min(getTerrainHeight(pt.x, pt.z) - 1.2, -2.0);
      const pierH = pt.y - 0.52 - groundY;

      const pierHolder = new THREE.Group();
      pierHolder.position.set(pt.x, 0, pt.z);
      pierHolder.rotation.y = angle;

      const pier = new THREE.Mesh(track(new THREE.BoxGeometry(2.45, pierH, 0.92)), stoneMat);
      pier.position.y = groundY + pierH * 0.5;
      pier.castShadow = true;
      pier.receiveShadow = true;
      pierHolder.add(pier);

      const foot = new THREE.Mesh(track(new THREE.BoxGeometry(2.75, 0.85, 1.18)), stoneTrimMat);
      foot.position.y = groundY + 0.55;
      pierHolder.add(foot);

      const refuge = new THREE.Mesh(track(new THREE.BoxGeometry(2.58, 0.55, 0.72)), stoneTrimMat);
      refuge.position.y = pt.y + 0.04;
      pierHolder.add(refuge);

      viaductGroup.add(pierHolder);

      if (i < numArches) {
        const ptNext = vCurve.getPointAt((i + 1) / numArches);
        const span = pt.distanceTo(ptNext);
        const mid = pt.clone().add(ptNext).multiplyScalar(0.5);
        const dir = ptNext.clone().sub(pt).normalize();
        const spanAngle = Math.atan2(dir.x, dir.z);

        const archR = Math.max(0.8, span * 0.41);
        const archShape = new THREE.Shape();
        const halfSpan = span * 0.5;
        const archH = archR + 0.65;
        archShape.moveTo(-halfSpan, 0);
        archShape.lineTo(-halfSpan, archH);
        archShape.lineTo(halfSpan, archH);
        archShape.lineTo(halfSpan, 0);
        archShape.lineTo(archR, 0);
        archShape.absarc(0, 0, archR, 0, Math.PI, false);
        archShape.lineTo(-halfSpan, 0);

        const archGeo = track(
          new THREE.ExtrudeGeometry(archShape, {
            depth: 2.12,
            bevelEnabled: false,
            curveSegments: 14,
          })
        );
        archGeo.translate(0, 0, -1.06);
        archGeo.rotateY(Math.PI / 2);

        const archMesh = new THREE.Mesh(archGeo, stoneMat);
        archMesh.position.set(mid.x, mid.y - archH - 0.16, mid.z);
        archMesh.rotation.y = spanAngle;
        archMesh.castShadow = true;
        archMesh.receiveShadow = true;
        viaductGroup.add(archMesh);
      }
    }
  }
  group.add(viaductGroup);

  // =========================================================================
  // 2B. STONE RAMP PIERS & STEEL PLATE-GIRDER OVERPASS (PONT-RAIL EST)
  // =========================================================================
  const rampSupportGroup = new THREE.Group();
  rampSupportGroup.name = 'AlpineRampSupports';
  const alpineLen = curves.loop_alpine.getLength();
  const rampPierCount = Math.floor(alpineLen / 4.2);

  for (let i = 1; i < rampPierCount; i++) {
    const u = i / rampPierCount;
    const pt = curves.loop_alpine.getPointAt(u);
    const groundY = getTerrainHeight(pt.x, pt.z);
    const clearance = pt.y - groundY;

    // Skip flat ground, deep inside tunnels, the main curved stone viaduct, and the overpass bridge opening
    if (clearance < 0.42) continue;
    if (pt.x > -16.5 && pt.x < 16.5 && pt.z > -8.5 && pt.z < -1.8) continue;
    if (Math.hypot(pt.x - EAST_OVERPASS_POS.x, pt.z - EAST_OVERPASS_POS.z) < 3.6) continue;
    // Never place a ramp support pier on or next to the lower valley track or the departmental road underpasses
    if (distanceToPolyline2D(pt.x, pt.z, LOOP_VALLEY_POINTS, false) < 2.6) continue;
    if (distanceToPolyline2D(pt.x, pt.z, ROAD_CENTERLINE_POINTS, false) < 2.65) continue;
    // Skip high north alpine ledge (already sits on carved rock shelf)
    if (pt.z < -16.5 && pt.x > -14.5 && pt.x < 15.5) continue;

    const tan = curves.loop_alpine.getTangentAt(u).normalize();
    const pierH = clearance + 0.7;
    const pier = new THREE.Mesh(track(new THREE.BoxGeometry(2.15, pierH, 0.78)), stoneMat);
    pier.position.set(pt.x, groundY - 0.55 + pierH * 0.5, pt.z);
    pier.rotation.y = Math.atan2(tan.x, tan.z);
    pier.castShadow = true;
    pier.receiveShadow = true;
    rampSupportGroup.add(pier);

    // Dressed stone cap under the track roadbed
    const cap = new THREE.Mesh(track(new THREE.BoxGeometry(2.3, 0.22, 0.96)), stoneTrimMat);
    cap.position.set(pt.x, pt.y - 0.28, pt.z);
    cap.rotation.y = Math.atan2(tan.x, tan.z);
    rampSupportGroup.add(cap);
  }

  // Steel Plate-Girder Overpass Bridge at EAST_OVERPASS_POS (descending Alpine track crosses 2.89u above climbing ramp!)
  const findClosestUOnRange = (
    curve: THREE.CatmullRomCurve3,
    tx: number,
    tz: number,
    minU = 0,
    maxU = 1
  ): number => {
    let bestU = minU;
    let bestD = Infinity;
    const steps = 320;
    for (let i = 0; i <= steps; i++) {
      const u = minU + (maxU - minU) * (i / steps);
      const p = curve.getPointAt(u);
      const d = (p.x - tx) ** 2 + (p.z - tz) ** 2;
      if (d < bestD) {
        bestD = d;
        bestU = u;
      }
    }
    return bestU;
  };

  const overpassU = findClosestUOnRange(curves.loop_alpine, EAST_OVERPASS_POS.x, EAST_OVERPASS_POS.z, 0.65, 0.92);
  const opPt = curves.loop_alpine.getPointAt(overpassU);
  const opTan = curves.loop_alpine.getTangentAt(overpassU).normalize();
  const overpassGroup = new THREE.Group();
  overpassGroup.position.copy(opPt);
  overpassGroup.rotation.y = Math.atan2(opTan.x, opTan.z);

  const opSpan = 7.4;
  // Twin dark steel side plate girders
  const girderGeo = track(new THREE.BoxGeometry(0.18, 0.82, opSpan));
  for (const gx of [-1.05, 1.05]) {
    const girder = new THREE.Mesh(girderGeo, trussSteelMat);
    girder.position.set(gx, 0.14, 0);
    girder.castShadow = true;
    overpassGroup.add(girder);
  }
  // Underside deck plate
  const opDeck = new THREE.Mesh(track(new THREE.BoxGeometry(2.2, 0.18, opSpan)), trussSteelMat);
  opDeck.position.set(0, -0.22, 0);
  overpassGroup.add(opDeck);
  // Twin dressed-stone abutments straddling the lower track cleanly
  const opAbutGeo = track(new THREE.BoxGeometry(2.6, 3.6, 1.25));
  for (const az of [-opSpan * 0.5 - 0.5, opSpan * 0.5 + 0.5]) {
    const abut = new THREE.Mesh(opAbutGeo, stoneMat);
    abut.position.set(0, -1.95, az);
    abut.castShadow = true;
    abut.receiveShadow = true;
    overpassGroup.add(abut);
  }
  rampSupportGroup.add(overpassGroup);
  group.add(rampSupportGroup);

  // =========================================================================
  // 3. STEEL TRUSS BRIDGE (PONT MÉTALLIQUE EN TREILLIS) OVER NORTH RIVER
  // =========================================================================
  const trussGroup = new THREE.Group();
  trussGroup.name = 'SteelTrussBridge';
  const bridgeCenterX = -3.5;
  const bridgeZ = -14.4;
  const bridgeSpan = 12.2;
  const bridgeW = 2.08;
  const bridgeH = 2.35;

  trussGroup.position.set(bridgeCenterX, VALLEY_RAIL_Y, bridgeZ);

  const abutGeo = track(new THREE.BoxGeometry(1.75, 3.0, 2.7));
  for (const sx of [-bridgeSpan * 0.5 - 0.6, bridgeSpan * 0.5 + 0.6]) {
    const abut = new THREE.Mesh(abutGeo, stoneMat);
    abut.position.set(sx, -1.55, 0);
    abut.castShadow = true;
    abut.receiveShadow = true;
    trussGroup.add(abut);
  }

  const mainChordGeo = track(new THREE.BoxGeometry(bridgeSpan, 0.2, 0.18));
  const topChordGeo = track(new THREE.BoxGeometry(bridgeSpan - 2.0, 0.18, 0.18));
  for (const sz of [-bridgeW * 0.5, bridgeW * 0.5]) {
    const botChord = new THREE.Mesh(mainChordGeo, trussSteelMat);
    botChord.position.set(0, -0.22, sz);
    botChord.castShadow = true;
    trussGroup.add(botChord);

    const topChord = new THREE.Mesh(topChordGeo, trussSteelMat);
    topChord.position.set(0, bridgeH, sz);
    topChord.castShadow = true;
    trussGroup.add(topChord);
  }

  const bays = 6;
  const bayLen = bridgeSpan / bays;
  const vertGeo = track(new THREE.BoxGeometry(0.14, bridgeH + 0.2, 0.14));
  const diagLen = Math.hypot(bayLen, bridgeH + 0.15);
  const diagGeo = track(new THREE.BoxGeometry(0.13, diagLen, 0.12));
  const crossTopGeo = track(new THREE.BoxGeometry(0.14, 0.14, bridgeW));
  const crossBotGeo = track(new THREE.BoxGeometry(0.18, 0.16, bridgeW + 0.1));

  for (let b = 0; b <= bays; b++) {
    const bx = -bridgeSpan * 0.5 + b * bayLen;
    const cBot = new THREE.Mesh(crossBotGeo, trussSteelMat);
    cBot.position.set(bx, -0.22, 0);
    trussGroup.add(cBot);

    if (b > 0 && b < bays) {
      for (const sz of [-bridgeW * 0.5, bridgeW * 0.5]) {
        const post = new THREE.Mesh(vertGeo, trussSteelMat);
        post.position.set(bx, bridgeH * 0.5 - 0.1, sz);
        post.castShadow = true;
        trussGroup.add(post);
      }
      const cTop = new THREE.Mesh(crossTopGeo, trussSteelMat);
      cTop.position.set(bx, bridgeH, 0);
      trussGroup.add(cTop);
    }

    if (b < bays) {
      const mx = bx + bayLen * 0.5;
      const diagAngle = Math.atan2(bayLen, bridgeH + 0.15);
      const sign = b === 0 ? -1 : b === bays - 1 ? 1 : b % 2 === 0 ? -1 : 1;
      for (const sz of [-bridgeW * 0.5, bridgeW * 0.5]) {
        const diag = new THREE.Mesh(diagGeo, trussSteelMat);
        diag.position.set(mx, bridgeH * 0.5 - 0.1, sz);
        diag.rotation.z = sign * diagAngle;
        diag.castShadow = true;
        trussGroup.add(diag);
      }
    }
  }
  group.add(trussGroup);

  // =========================================================================
  // 4. DRESSED-STONE TUNNEL PORTALS (LOWER & ALPINE MOUNTAIN MASSIFS)
  // =========================================================================
  const buildTunnelPortal = (curve: THREE.CatmullRomCurve3, u: number, flipFacing = false) => {
    const pt = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).normalize();
    if (flipFacing) tan.negate();

    const portal = new THREE.Group();
    portal.position.set(pt.x, pt.y - 0.25, pt.z);
    portal.rotation.y = Math.atan2(tan.x, tan.z);

    const pW = 3.2;
    const pH = 3.1;
    const archR = 1.05;
    const shape = new THREE.Shape();
    shape.moveTo(-pW * 0.5, 0);
    shape.lineTo(-pW * 0.5, pH);
    shape.lineTo(pW * 0.5, pH);
    shape.lineTo(pW * 0.5, 0);
    shape.lineTo(archR, 0);
    shape.lineTo(archR, 1.35);
    shape.absarc(0, 1.35, archR, 0, Math.PI, false);
    shape.lineTo(-archR, 0);
    shape.lineTo(-pW * 0.5, 0);

    const facadeGeo = track(
      new THREE.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04 })
    );
    facadeGeo.translate(0, 0, -0.36);
    const facade = new THREE.Mesh(facadeGeo, stoneMat);
    facade.castShadow = true;
    facade.receiveShadow = true;
    portal.add(facade);

    const cornice = new THREE.Mesh(track(new THREE.BoxGeometry(pW + 0.3, 0.24, 0.92)), stoneTrimMat);
    cornice.position.set(0, pH + 0.1, 0);
    portal.add(cornice);

    const keystone = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.42, 0.88)), stoneTrimMat);
    keystone.position.set(0, 2.48, 0.02);
    portal.add(keystone);

    const linerGeo = track(new THREE.CylinderGeometry(archR * 1.0, archR * 1.0, 1.5, 12, 1, true, 0, Math.PI));
    linerGeo.rotateZ(Math.PI / 2);
    linerGeo.rotateY(Math.PI / 2);
    const liner = new THREE.Mesh(linerGeo, darkTunnelMat);
    liner.position.set(0, 1.32, -0.82);
    portal.add(liner);

    const backPlate = new THREE.Mesh(track(new THREE.PlaneGeometry(archR * 2, 2.5)), darkTunnelMat);
    backPlate.position.set(0, 1.25, -1.52);
    portal.add(backPlate);

    group.add(portal);
  };

  // Alpine tunnel portals on loop_alpine (West & East viaduct portals, North shelf portals, East hillside exit tucked in rock)
  buildTunnelPortal(curves.loop_alpine, findClosestUOnRange(curves.loop_alpine, 15.6, -3.2, 0.55, 0.72), true);
  buildTunnelPortal(curves.loop_alpine, findClosestUOnRange(curves.loop_alpine, 14.5, -17.6, 0.25, 0.45), false);
  buildTunnelPortal(curves.loop_alpine, findClosestUOnRange(curves.loop_alpine, -13.6, -17.3, 0.35, 0.55), true);
  buildTunnelPortal(curves.loop_alpine, findClosestUOnRange(curves.loop_alpine, -16.8, -3.1, 0.45, 0.62), false);
  buildTunnelPortal(curves.loop_alpine, findClosestUOnRange(curves.loop_alpine, 23.0, -4.1, 0.62, 0.76), false);

  // Lower valley tunnel portals on loop_valley
  buildTunnelPortal(curves.loop_valley, findClosestUOnRange(curves.loop_valley, 23.6, -8.5, 0.1, 0.45), true);
  buildTunnelPortal(curves.loop_valley, findClosestUOnRange(curves.loop_valley, 12.2, -14.5, 0.2, 0.55), false);
  buildTunnelPortal(curves.loop_valley, findClosestUOnRange(curves.loop_valley, -20.5, -12.6, 0.5, 0.85), true);
  buildTunnelPortal(curves.loop_valley, findClosestUOnRange(curves.loop_valley, -24.8, -5.0, 0.6, 0.95), false);

  // =========================================================================
  // 5. ANIMATED JUNCTION TURNOUTS (J_WEST, J_EAST), SIDING TURNOUTS & 3-ASPECT BLOCK SIGNALS
  // =========================================================================
  const sidingBlades: THREE.Mesh[] = [];
  const sidingLanternMats: THREE.MeshStandardMaterial[] = [];

  const buildStationSidingTurnout = (x: number, z: number, sideDir: number) => {
    const swGroup = new THREE.Group();
    swGroup.position.set(x, VALLEY_RAIL_Y, z);

    const bladeGeo = track(new THREE.BoxGeometry(2.1, 0.08, 0.08));
    bladeGeo.translate(sideDir * 1.05, 0, 0);
    const blade = new THREE.Mesh(bladeGeo, railMat);
    blade.position.set(-sideDir * 0.9, -0.02, -0.36);
    swGroup.add(blade);
    sidingBlades.push(blade);

    const standBase = new THREE.Mesh(track(new THREE.BoxGeometry(0.4, 0.14, 0.4)), trussSteelMat);
    standBase.position.set(0, -0.14, 1.02);
    swGroup.add(standBase);

    const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.038, 0.048, 0.85, 8)), trussSteelMat);
    mast.position.set(0, 0.3, 1.02);
    swGroup.add(mast);

    const lanternMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 1.3,
        roughness: 0.3,
      })
    );
    sidingLanternMats.push(lanternMat);
    const lantern = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.24, 0.24)), lanternMat);
    lantern.position.set(0, 0.8, 1.02);
    swGroup.add(lantern);

    group.add(swGroup);
  };

  buildStationSidingTurnout(WEST_TURNOUT_POS.x, WEST_TURNOUT_POS.z, 1);
  buildStationSidingTurnout(EAST_TURNOUT_POS.x, EAST_TURNOUT_POS.z, -1);

  // Prominent Junction Turnout Assemblies at J_WEST (-15.0, 13.5) and J_EAST (+15.0, 13.5)
  const buildJunctionTurnout = (x: number, z: number, bladeDir: number) => {
    const jGroup = new THREE.Group();
    jGroup.position.set(x, VALLEY_RAIL_Y, z);

    // Pair of animated steel switch tongue blades linking the main rails to the diverging loop
    const bladeGeo = track(new THREE.BoxGeometry(2.6, 0.09, 0.09));
    bladeGeo.translate(bladeDir * 1.3, 0, 0);
    const blade = new THREE.Mesh(bladeGeo, railMat);
    blade.position.set(-bladeDir * 0.4, -0.015, 0.0);
    jGroup.add(blade);

    // Concrete tie-rod motor box + tall glowing direction indicator mast
    const motorBox = new THREE.Mesh(track(new THREE.BoxGeometry(0.68, 0.26, 0.56)), trussSteelMat);
    motorBox.position.set(0, -0.1, 1.25);
    motorBox.castShadow = true;
    jGroup.add(motorBox);

    const tieRod = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.06, 1.25)), railMat);
    tieRod.position.set(0, -0.08, 0.55);
    jGroup.add(tieRod);

    const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.06, 1.35, 8)), trussSteelMat);
    mast.position.set(0, 0.62, 1.25);
    jGroup.add(mast);

    const lanternMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 1.6,
        roughness: 0.25,
      })
    );
    const lantern = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.36, 0.36)), lanternMat);
    lantern.position.set(0, 1.38, 1.25);
    jGroup.add(lantern);

    group.add(jGroup);
    return { blade, lanternMat };
  };

  const westJunction = buildJunctionTurnout(WEST_JUNCTION_POS.x, WEST_JUNCTION_POS.z, -1);
  const eastJunction = buildJunctionTurnout(EAST_JUNCTION_POS.x, EAST_JUNCTION_POS.z, 1);

  // Tall 3-Aspect Railway Block Signals (Vert / Ambre / Rouge)
  const buildBlockSignal = (x: number, z: number, facingAngle: number): ThreeAspectSignalRig => {
    const sGroup = new THREE.Group();
    const gy = Math.max(0, getTerrainHeight(x, z));
    sGroup.position.set(x, gy, z);
    sGroup.rotation.y = facingAngle;

    const base = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.28, 0.42)), stoneTrimMat);
    base.position.y = 0.14;
    sGroup.add(base);

    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.068, 2.75, 8)), trussSteelMat);
    pole.position.y = 1.48;
    pole.castShadow = true;
    sGroup.add(pole);

    const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 1.06, 0.22)), signalHousingMat);
    head.position.set(0, 2.68, 0.04);
    head.castShadow = true;
    sGroup.add(head);

    // White border visor rim for clear visibility from overview camera
    const rim = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 1.12, 0.06)), whiteSafetyMat);
    rim.position.set(0, 2.68, -0.05);
    sGroup.add(rim);

    const makeLens = (hex: number, ly: number) => {
      const mat = track(
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 0.1,
          roughness: 0.2,
        })
      );
      const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.11, 10, 10)), mat);
      bulb.position.set(0, ly, 0.15);
      sGroup.add(bulb);
      return mat;
    };

    const redMat = makeLens(0xef4444, 3.0);
    const amberMat = makeLens(0xf59e0b, 2.68);
    const greenMat = makeLens(0x22c55e, 2.36);

    group.add(sGroup);
    return { redMat, amberMat, greenMat };
  };

  // Signal A: Guards Boucle A approach right before J_WEST (faces approaching trains from north-west)
  const signalValley = buildBlockSignal(-21.2, 10.6, -0.75);
  // Signal B: Guards Boucle B approach right before J_WEST (faces approaching trains from south-west)
  const signalAlpine = buildBlockSignal(-17.8, 17.8, 0.55);
  // Signal Exit: Guards J_EAST station departure on the shared trunk
  const signalExit = buildBlockSignal(13.6, 14.9, -Math.PI / 2);

  // =========================================================================
  // 6. ANIMATED LEVEL CROSSING (PASSAGE À NIVEAU) AT (24.8, 2.3)
  // =========================================================================
  const crossingGroup = new THREE.Group();
  crossingGroup.name = 'LevelCrossing';
  crossingGroup.position.set(LEVEL_CROSSING_POS.x, 0.04, LEVEL_CROSSING_POS.z);

  const plankDeck = new THREE.Mesh(
    track(new THREE.BoxGeometry(2.35, 0.26, 3.6)),
    track(new THREE.MeshStandardMaterial({ color: 0x5d574f, roughness: 0.9 }))
  );
  plankDeck.position.set(0, 0.13, 0);
  plankDeck.receiveShadow = true;
  crossingGroup.add(plankDeck);

  const rampGeo = track(new THREE.BoxGeometry(1.15, 0.2, 3.5));
  const rampMat = track(new THREE.MeshStandardMaterial({ color: 0x45494f, roughness: 0.88 }));
  const westRamp = new THREE.Mesh(rampGeo, rampMat);
  westRamp.position.set(-1.55, 0.09, 0);
  westRamp.rotation.z = 0.08;
  crossingGroup.add(westRamp);

  const eastRamp = new THREE.Mesh(rampGeo, rampMat);
  eastRamp.position.set(1.55, 0.09, 0);
  eastRamp.rotation.z = -0.08;
  crossingGroup.add(eastRamp);

  const barrierPivots: THREE.Group[] = [];
  const flashLightMatsA: THREE.MeshStandardMaterial[] = [];
  const flashLightMatsB: THREE.MeshStandardMaterial[] = [];

  const buildCrossingGateAssembly = (sideX: number, sideZ: number, armDirZ: number) => {
    const postGroup = new THREE.Group();
    postGroup.position.set(sideX, 0, sideZ);

    const pedestal = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.95, 0.42)), trussSteelMat);
    pedestal.position.y = 0.48;
    pedestal.castShadow = true;
    postGroup.add(pedestal);

    const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.065, 2.55, 8)), whiteSafetyMat);
    mast.position.set(0, 1.28, -armDirZ * 0.26);
    mast.castShadow = true;
    postGroup.add(mast);

    const crossBarGeo = track(new THREE.BoxGeometry(0.08, 0.92, 0.14));
    const crossA = new THREE.Mesh(crossBarGeo, redSafetyMat);
    crossA.position.set(0, 2.25, -armDirZ * 0.26);
    crossA.rotation.x = Math.PI / 4;
    postGroup.add(crossA);
    const crossB = new THREE.Mesh(crossBarGeo, whiteSafetyMat);
    crossB.position.set(0, 2.25, -armDirZ * 0.26);
    crossB.rotation.x = -Math.PI / 4;
    postGroup.add(crossB);

    const lampBack = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.14, 0.34, 0.62)),
      signalHousingMat
    );
    lampBack.position.set(0, 1.65, -armDirZ * 0.26);
    postGroup.add(lampBack);

    const matA = track(
      new THREE.MeshStandardMaterial({
        color: 0x551111,
        emissive: 0xff1e1e,
        emissiveIntensity: 0,
        roughness: 0.25,
      })
    );
    const matB = track(
      new THREE.MeshStandardMaterial({
        color: 0x551111,
        emissive: 0xff1e1e,
        emissiveIntensity: 0,
        roughness: 0.25,
      })
    );
    flashLightMatsA.push(matA);
    flashLightMatsB.push(matB);

    const bulbGeo = track(new THREE.SphereGeometry(0.095, 10, 10));
    const bulb1 = new THREE.Mesh(bulbGeo, matA);
    bulb1.position.set(sideX > 0 ? 0.08 : -0.08, 1.65, -armDirZ * 0.26 - 0.16);
    postGroup.add(bulb1);
    const bulb2 = new THREE.Mesh(bulbGeo, matB);
    bulb2.position.set(sideX > 0 ? 0.08 : -0.08, 1.65, -armDirZ * 0.26 + 0.16);
    postGroup.add(bulb2);

    const pivot = new THREE.Group();
    pivot.position.set(0, 0.86, 0);
    const counter = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.52, 0.22)), trussSteelMat);
    counter.position.set(0, -0.32, 0);
    pivot.add(counter);

    const segCount = 6;
    const armLen = 3.25;
    const segLen = armLen / segCount;
    for (let s = 0; s < segCount; s++) {
      const seg = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.09, segLen, 0.09)),
        s % 2 === 0 ? redSafetyMat : whiteSafetyMat
      );
      seg.position.set(0, segLen * (s + 0.5), 0);
      seg.castShadow = true;
      pivot.add(seg);
    }
    pivot.userData.armDirZ = armDirZ;
    postGroup.add(pivot);
    barrierPivots.push(pivot);

    crossingGroup.add(postGroup);
  };

  buildCrossingGateAssembly(-1.72, 1.88, -1);
  buildCrossingGateAssembly(1.72, -1.88, 1);
  group.add(crossingGroup);

  // Smooth blade animation states
  let sidingBladeLerp = 0;
  let westJunctionLerp = 0;
  let eastJunctionLerp = 0;
  let nightBoost = 0;

  const applySignalAspect = (rig: ThreeAspectSignalRig, aspect: SignalAspect) => {
    const on = 2.1 + nightBoost * 1.8;
    const off = 0.06;
    rig.redMat.emissiveIntensity = aspect === 'red' ? on : off;
    rig.amberMat.emissiveIntensity = aspect === 'amber' ? on : off;
    rig.greenMat.emissiveIntensity = aspect === 'green' ? on : off;
  };

  return {
    group,
    curves,
    updateTurnoutVisual: (
      stationRoute: SwitchRoute,
      westSwitchTarget: LoopId,
      eastSwitchTarget: LoopId,
      signalValleyAspect: SignalAspect,
      signalAlpineAspect: SignalAspect,
      signalExitAspect: SignalAspect,
      dt: number
    ) => {
      const rate = Math.min(1, dt * 8);
      // Station siding blades
      sidingBladeLerp += ((stationRoute === 'siding' ? 1 : 0) - sidingBladeLerp) * rate;
      if (sidingBlades[0]) sidingBlades[0].rotation.y = sidingBladeLerp * 0.22;
      if (sidingBlades[1]) sidingBlades[1].rotation.y = -sidingBladeLerp * 0.22;

      const sidingColor = stationRoute === 'siding' ? 0xf59e0b : 0x22c55e;
      for (const mat of sidingLanternMats) {
        mat.color.setHex(sidingColor);
        mat.emissive.setHex(sidingColor);
        mat.emissiveIntensity = 1.1 + nightBoost * 1.4;
      }

      // West Junction turnout blades (0 = Boucle A / valley north-west, 1 = Boucle B / alpine south-west)
      westJunctionLerp += ((westSwitchTarget === 'alpine' ? 1 : 0) - westJunctionLerp) * rate;
      westJunction.blade.rotation.y = (westJunctionLerp - 0.5) * 0.34;
      const wColor = westSwitchTarget === 'alpine' ? 0xf59e0b : 0x22c55e;
      westJunction.lanternMat.color.setHex(wColor);
      westJunction.lanternMat.emissive.setHex(wColor);
      westJunction.lanternMat.emissiveIntensity = 1.35 + nightBoost * 1.5;

      // East Junction turnout blades (0 = Boucle A / valley north-east, 1 = Boucle B / alpine south-east)
      eastJunctionLerp += ((eastSwitchTarget === 'alpine' ? 1 : 0) - eastJunctionLerp) * rate;
      eastJunction.blade.rotation.y = (0.5 - eastJunctionLerp) * 0.34;
      const eColor = eastSwitchTarget === 'alpine' ? 0xf59e0b : 0x22c55e;
      eastJunction.lanternMat.color.setHex(eColor);
      eastJunction.lanternMat.emissive.setHex(eColor);
      eastJunction.lanternMat.emissiveIntensity = 1.35 + nightBoost * 1.5;

      // Update 3-aspect railway block signals
      applySignalAspect(signalValley, signalValleyAspect);
      applySignalAspect(signalAlpine, signalAlpineAspect);
      applySignalAspect(signalExit, signalExitAspect);
    },
    updateCrossingVisual: (barrierAngle: number, isClosed: boolean, elapsed: number) => {
      for (const pivot of barrierPivots) {
        const dir = (pivot.userData.armDirZ as number) || 1;
        pivot.rotation.x = dir * barrierAngle;
      }
      const flash = isClosed || barrierAngle > 0.12;
      const phase = Math.sin(elapsed * 9.5) > 0;
      const onIntensity = 2.4 + nightBoost * 1.8;
      for (const mA of flashLightMatsA) {
        mA.emissiveIntensity = flash && phase ? onIntensity : 0.04;
      }
      for (const mB of flashLightMatsB) {
        mB.emissiveIntensity = flash && !phase ? onIntensity : 0.04;
      }
    },
    setNightFactor: (nightFactor: number) => {
      nightBoost = nightFactor;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
