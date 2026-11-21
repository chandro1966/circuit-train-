import * as THREE from 'three';
import {
  LEVEL_CROSSING_POS,
  getTerrainHeight,
  shouldCarStopForCrossing,
  wrapDistance,
  type Vec3Tuple,
} from './railwayMath';

/**
 * Wide Two-Lane Departmental Road Centerline across the full 92×62 plateau:
 * Place du Village Roundabout (14.0, 2.3) -> Level Crossing (24.8, 2.3) ->
 * Under Eastern Alpine Viaduct Piers -> Eastern Pine Boulevard ->
 * Avenue & Parking de la Gare (0.0, 28.6) -> Stone River Bridge (-23.3, 27.8) ->
 * Farmstead & Grand Pré aux Vaches Roundabout (-35.2, 14.0).
 *
 * Crosses railway tracks at grade ONLY at LEVEL_CROSSING_POS (24.8, 2.3).
 */
export const VILLAGE_ROUNDABOUT_CENTER = { x: 14.0, z: 2.3 };
export const VILLAGE_ROUNDABOUT_RADIUS = 1.85;

export const FARM_ROUNDABOUT_CENTER = { x: -35.4, z: 14.5 };
export const FARM_ROUNDABOUT_RADIUS = 1.85;

export const RIVER_BRIDGE_CENTER = { x: -23.45, z: 27.9 };
export const RIVER_BRIDGE_HALF_SPAN = 3.2;
export const RIVER_BRIDGE_DECK_Y = 0.78;

export const ROAD_HALF_WIDTH = 1.32;
export const LANE_OFFSET = 0.58; // French right-hand driving lane offset (±0.58 -> 1.16u between opposing centers)

export const ROAD_CENTERLINE_POINTS: Vec3Tuple[] = [
  { x: 15.85, y: 0.08, z: 2.3 },
  { x: 20.4, y: 0.08, z: 2.3 },
  { x: 24.8, y: 0.16, z: 2.3 }, // Exact existing Level Crossing deck
  { x: 29.4, y: 0.08, z: 2.3 },
  { x: 34.4, y: 0.08, z: 2.3 }, // Passes cleanly under upper Alpine descending span (y=4.02)
  { x: 41.8, y: 0.08, z: 2.4 }, // Passes cleanly under eastern climbing Alpine span (y=2.15)
  { x: 44.1, y: 0.08, z: 6.4 },
  { x: 44.1, y: 0.08, z: 15.0 },
  { x: 42.8, y: 0.08, z: 23.0 },
  { x: 37.4, y: 0.08, z: 27.8 },
  { x: 27.0, y: 0.08, z: 28.8 },
  { x: 14.0, y: 0.08, z: 28.95 },
  { x: 0.0, y: 0.08, z: 28.95 }, // Avenue & Parking de la Gare de Val-d'Arc
  { x: -13.5, y: 0.08, z: 28.8 },
  { x: -19.8, y: 0.12, z: 28.2 }, // East Stone River Bridge approach
  { x: -23.45, y: RIVER_BRIDGE_DECK_Y, z: 27.9 }, // Stone Road Bridge over River
  { x: -27.1, y: 0.12, z: 27.6 }, // West Stone River Bridge approach
  { x: -32.2, y: 0.14, z: 27.2 },
  { x: -35.4, y: 0.16, z: 24.5 }, // Curves north between Wheat Field & Barn
  { x: -35.6, y: 0.16, z: 20.2 }, // Between Farmhouse & Barn
  { x: -35.4, y: 0.16, z: 16.35 }, // Enters Farm & Cow Meadow Roundabout
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic road surface altitude at any (x, z):
 * - Smoothly arches up onto the Dressed-Stone River Bridge (y = 0.78) at (-23.45, 27.8)
 * - Smoothly rises onto the wooden Level Crossing deck (y = 0.18) at (24.8, 2.3)
 * - Follows ground terrain elevation + 0.065 everywhere else with zero Z-fighting.
 */
export function getRoadElevationAt(x: number, z: number): number {
  const terrainY = getTerrainHeight(x, z);
  let y = Math.max(0.065, terrainY + 0.065);

  // Smooth stone road bridge arch profile over the river at (-23.45, 27.8)
  const dxB = x - RIVER_BRIDGE_CENTER.x;
  const dzB = z - RIVER_BRIDGE_CENTER.z;
  if (Math.abs(dzB) < 4.5 && Math.abs(dxB) < 6.4) {
    const bridgeT = 1 - smoothstep(1.2, 6.2, Math.abs(dxB));
    const bridgeY = 0.08 + (RIVER_BRIDGE_DECK_Y - 0.08) * bridgeT;
    if (bridgeY > y) y = bridgeY;
  }

  // Smooth level crossing deck pad at (24.8, 2.3)
  const distCross = Math.hypot(x - LEVEL_CROSSING_POS.x, z - LEVEL_CROSSING_POS.z);
  if (distCross < 3.6) {
    const crossT = 1 - smoothstep(1.2, 3.6, distCross);
    const crossY = 0.07 + (0.18 - 0.07) * crossT;
    if (crossY > y) y = crossY;
  }

  return y;
}

export interface BuiltRoadCurves {
  centerCurve: THREE.CatmullRomCurve3;
  vehicleLoopCurve: THREE.CatmullRomCurve3;
  outwardLanePoints: THREE.Vector3[];
  returnLanePoints: THREE.Vector3[];
}

/**
 * Builds both the 2-lane visual road centerline curve and the closed C1-continuous
 * bidirectional vehicle trajectory (driving on the French right-hand lane in both directions
 * and looping cleanly around the Village Fountain Roundabout and Farm Courtyard Roundabout).
 */
export function buildRoadNetworkCurves(): BuiltRoadCurves {
  const centerCurve = new THREE.CatmullRomCurve3(
    ROAD_CENTERLINE_POINTS.map((p) => new THREE.Vector3(p.x, getRoadElevationAt(p.x, p.z), p.z)),
    false,
    'centripetal',
    0.5
  );

  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3();
  const right = new THREE.Vector3();

  // Sample outward lane (right-hand side going Village -> Gare -> River Bridge -> Farm)
  const sampleCount = 72;
  const outwardLanePoints: THREE.Vector3[] = [];
  const returnLanePoints: THREE.Vector3[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    const u = i / sampleCount;
    const p = centerCurve.getPointAt(u);
    centerCurve.getTangentAt(u, tan).normalize();
    // Right-hand perpendicular in XZ plane: tan × up = (-tan.z, 0, tan.x)
    right.crossVectors(tan, up).normalize();

    const ox = p.x + right.x * LANE_OFFSET;
    const oz = p.z + right.z * LANE_OFFSET;
    outwardLanePoints.push(new THREE.Vector3(ox, getRoadElevationAt(ox, oz), oz));

    const rx = p.x - right.x * LANE_OFFSET;
    const rz = p.z - right.z * LANE_OFFSET;
    returnLanePoints.push(new THREE.Vector3(rx, getRoadElevationAt(rx, rz), rz));
  }

  // Farm Courtyard Roundabout (counter-clockwise sweep from SSE entry around East->North->West to SSW exit)
  const farmArcPoints: THREE.Vector3[] = [];
  const fcx = FARM_ROUNDABOUT_CENTER.x;
  const fcz = FARM_ROUNDABOUT_CENTER.z;
  const fR = FARM_ROUNDABOUT_RADIUS;
  const farmAngStart = 1.05;
  const farmAngEnd = -Math.PI * 2 + 2.09;
  const farmArcSteps = 12;
  for (let i = 1; i < farmArcSteps; i++) {
    const t = i / farmArcSteps;
    const ang = farmAngStart + (farmAngEnd - farmAngStart) * t;
    const fx = fcx + Math.cos(ang) * fR;
    const fz = fcz + Math.sin(ang) * fR;
    farmArcPoints.push(new THREE.Vector3(fx, getRoadElevationAt(fx, fz), fz));
  }

  // Village Fountain Roundabout (counter-clockwise sweep from ENE entry around North->West->South to ESE exit)
  const villageArcPoints: THREE.Vector3[] = [];
  const vcx = VILLAGE_ROUNDABOUT_CENTER.x;
  const vcz = VILLAGE_ROUNDABOUT_CENTER.z;
  const vR = VILLAGE_ROUNDABOUT_RADIUS;
  const vilAngStart = -0.46;
  const vilAngEnd = -Math.PI * 2 + 0.46;
  const villageArcSteps = 12;
  for (let i = 1; i < villageArcSteps; i++) {
    const t = i / villageArcSteps;
    const ang = vilAngStart + (vilAngEnd - vilAngStart) * t;
    const vx = vcx + Math.cos(ang) * vR;
    const vz = vcz + Math.sin(ang) * vR;
    villageArcPoints.push(new THREE.Vector3(vx, getRoadElevationAt(vx, vz), vz));
  }

  // Assemble single smooth closed bidirectional vehicle trajectory
  const allLoopPts: THREE.Vector3[] = [
    ...outwardLanePoints,
    ...farmArcPoints,
    ...returnLanePoints.slice().reverse(),
    ...villageArcPoints,
  ];

  const vehicleLoopCurve = new THREE.CatmullRomCurve3(allLoopPts, true, 'centripetal', 0.5);

  return {
    centerCurve,
    vehicleLoopCurve,
    outwardLanePoints,
    returnLanePoints,
  };
}

export interface RoadVehicleState {
  id: string;
  dist: number;
  speed: number;
  maxSpeed: number;
  length: number;
}

/**
 * Pure traffic step for bidirectional road vehicles:
 * - Stops smoothly before both sides of the Level Crossing barriers when closed
 * - Maintains clean following distance behind any vehicle ahead on the same lane
 * - Never overlaps oncoming traffic (separated laterally by 2 * LANE_OFFSET = 1.16u)
 */
export function stepRoadTraffic(
  vehicles: RoadVehicleState[],
  vehicleCurve: THREE.CatmullRomCurve3,
  totalLen: number,
  dt: number,
  crossingClosed: boolean
): void {
  if (dt <= 0) return;

  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const u = wrapDistance(v.dist, totalLen) / totalLen;
    vehicleCurve.getPointAt(u, pos);
    vehicleCurve.getTangentAt(u, tan).normalize();

    let mustStop = shouldCarStopForCrossing(
      pos,
      tan,
      LEVEL_CROSSING_POS.x,
      LEVEL_CROSSING_POS.z,
      crossingClosed
    );

    if (!mustStop) {
      for (let j = 0; j < vehicles.length; j++) {
        if (i === j) continue;
        const aheadDelta = wrapDistance(vehicles[j].dist - v.dist, totalLen);
        const minGap = (v.length + vehicles[j].length) * 0.5 + 2.4;
        if (aheadDelta > 0.05 && aheadDelta < minGap) {
          mustStop = true;
          break;
        }
      }
    }

    const targetSpeed = mustStop ? 0 : v.maxSpeed;
    v.speed += (targetSpeed - v.speed) * Math.min(1, dt * (mustStop ? 7.8 : 3.2));
    if (mustStop && v.speed < 0.04) v.speed = 0;
    v.dist = wrapDistance(v.dist + v.speed * dt, totalLen);
  }
}
