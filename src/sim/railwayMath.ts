import type { CrossingMode, SwitchRoute } from './types';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export const BOARD_W = 92;
export const BOARD_D = 62;
export const VALLEY_RAIL_Y = 0.36;
export const ALPINE_RAIL_Y = 5.3;

export const FARM_COURTYARD_CENTER = { x: -35.5, z: 16.5 };
export const GRAND_MEADOW_BOUNDS = {
  minX: -43.5,
  maxX: -27.5,
  minZ: -4.0,
  maxZ: 11.5,
};

/**
 * Shared Junction Turnout Coordinates (Jonctions Ouest & Est du Tronçon Commun)
 * Both Circuit A (Boucle Vallée) and Circuit B (Boucle Alpine / Viaduc) merge seamlessly
 * at WEST_JUNCTION_POS with exact tangent (+1, 0, 0) and diverge at EAST_JUNCTION_POS
 * with exact tangent (+1, 0, 0).
 */
export const WEST_JUNCTION_POS = { x: -15.0, y: VALLEY_RAIL_Y, z: 13.5 };
export const EAST_JUNCTION_POS = { x: 15.0, y: VALLEY_RAIL_Y, z: 13.5 };

export const LEVEL_CROSSING_POS = { x: 24.8, y: VALLEY_RAIL_Y, z: 2.3 };
export const WEST_TURNOUT_POS = { x: -11.5, y: VALLEY_RAIL_Y, z: 13.5 };
export const EAST_TURNOUT_POS = { x: 11.5, y: VALLEY_RAIL_Y, z: 13.5 };
export const EAST_OVERPASS_POS = { x: 33.2, y: 3.25, z: 15.2 };

/**
 * 1. SHARED COMMON TRUNK — MAIN PLATFORM (Voie Commune / Quai 1)
 * Open curve from WEST_JUNCTION_POS (-15, 0.36, 13.5) to EAST_JUNCTION_POS (+15, 0.36, 13.5)
 */
export const TRUNK_MAIN_POINTS: Vec3Tuple[] = [
  { x: -15.0, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: -11.5, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: -6.0, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 0.0, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 6.0, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 11.5, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 15.0, y: VALLEY_RAIL_Y, z: 13.5 },
];

/**
 * 2. SHARED COMMON TRUNK — PASSING SIDING (Voie d'évitement / Quai 2)
 * Open curve from WEST_JUNCTION_POS to EAST_JUNCTION_POS diverging through z = 10.2
 */
export const TRUNK_SIDING_POINTS: Vec3Tuple[] = [
  { x: -15.0, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: -12.6, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: -10.5, y: VALLEY_RAIL_Y, z: 13.1 },
  { x: -7.8, y: VALLEY_RAIL_Y, z: 11.2 },
  { x: -5.0, y: VALLEY_RAIL_Y, z: 10.2 },
  { x: 0.0, y: VALLEY_RAIL_Y, z: 10.2 },
  { x: 5.0, y: VALLEY_RAIL_Y, z: 10.2 },
  { x: 7.8, y: VALLEY_RAIL_Y, z: 11.2 },
  { x: 10.5, y: VALLEY_RAIL_Y, z: 13.1 },
  { x: 12.6, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 15.0, y: VALLEY_RAIL_Y, z: 13.5 },
];

/**
 * 3. LOOP A — VALLEY CIRCUIT (Boucle A : Passage à niveau, Pont métallique, Grand Pré)
 * Open curve from EAST_JUNCTION_POS (+15, 0.36, 13.5) to WEST_JUNCTION_POS (-15, 0.36, 13.5)
 * Collinear entry/exit tangents (+1, 0, 0) guarantee C1-continuous turnout transitions.
 */
export const LOOP_VALLEY_POINTS: Vec3Tuple[] = [
  { x: 15.0, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 17.6, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 22.8, y: VALLEY_RAIL_Y, z: 11.2 },
  { x: 24.8, y: VALLEY_RAIL_Y, z: 6.2 },
  { x: 24.8, y: VALLEY_RAIL_Y, z: 2.5 }, // Level crossing center
  { x: 24.8, y: VALLEY_RAIL_Y, z: -2.0 },
  { x: 23.5, y: VALLEY_RAIL_Y, z: -9.5 },
  { x: 18.2, y: VALLEY_RAIL_Y, z: -14.2 }, // Inside east tunnel
  { x: 10.5, y: VALLEY_RAIL_Y, z: -14.6 },
  { x: 2.8, y: VALLEY_RAIL_Y, z: -14.4 }, // East truss abutment
  { x: -3.5, y: VALLEY_RAIL_Y, z: -14.4 }, // Center of steel truss bridge
  { x: -9.8, y: VALLEY_RAIL_Y, z: -14.4 }, // West truss abutment
  { x: -18.0, y: VALLEY_RAIL_Y, z: -13.6 },
  { x: -24.2, y: VALLEY_RAIL_Y, z: -8.5 },
  { x: -25.4, y: VALLEY_RAIL_Y, z: 0.5 },
  { x: -24.0, y: VALLEY_RAIL_Y, z: 9.2 },
  { x: -20.5, y: VALLEY_RAIL_Y, z: 12.6 },
  { x: -17.6, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: -15.0, y: VALLEY_RAIL_Y, z: 13.5 },
];

/**
 * 4. LOOP B — ALPINE VIADUCT CIRCUIT (Boucle B : Rampe Est, Plateau Alpin, Grand Viaduc, Descente Sud)
 * Open curve from EAST_JUNCTION_POS (+15, 0.36, 13.5) to WEST_JUNCTION_POS (-15, 0.36, 13.5)
 * Smoothly climbs from valley elevation (0.36) up to the Curved Stone Arch Viaduct (5.30),
 * crosses the viaduct & east overpass bridge (3.25 over 0.36), and glides back into WEST_JUNCTION_POS.
 */
export const LOOP_ALPINE_POINTS: Vec3Tuple[] = [
  // Smooth divergence from EAST_JUNCTION_POS with exact tangent (+1, 0, 0)
  { x: 15.0, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 17.8, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: 21.8, y: VALLEY_RAIL_Y, z: 14.3 },
  { x: 26.8, y: VALLEY_RAIL_Y, z: 15.6 },
  // Flat approach passing cleanly underneath the East Overpass Bridge (x=33.2, z=15.2, upper y=3.25)
  { x: 33.2, y: VALLEY_RAIL_Y, z: 15.2 },
  { x: 37.8, y: 0.58, z: 13.4 },
  // Scenic climbing ramp along the eastern forested foothills (~6.8% continuous grade)
  { x: 41.2, y: 1.32, z: 8.6 },
  { x: 42.2, y: 2.18, z: 1.5 },
  { x: 41.0, y: 3.10, z: -6.8 },
  { x: 36.8, y: 4.02, z: -14.5 },
  { x: 29.5, y: 4.78, z: -19.8 },
  { x: 21.0, y: 5.20, z: -20.2 },
  // High northern alpine shelf at y = 5.30
  { x: 14.5, y: ALPINE_RAIL_Y, z: -17.6 },
  { x: 6.0, y: ALPINE_RAIL_Y, z: -18.5 },
  { x: -3.5, y: ALPINE_RAIL_Y, z: -18.5 },
  { x: -13.5, y: ALPINE_RAIL_Y, z: -17.4 },
  // Curves inside West Alpine Mountain
  { x: -20.8, y: ALPINE_RAIL_Y, z: -13.0 },
  { x: -21.2, y: ALPINE_RAIL_Y, z: -6.6 },
  { x: -18.6, y: ALPINE_RAIL_Y, z: -3.2 },
  // Showcase Curved Stone Arch Viaduct (y = 5.30)
  { x: -14.8, y: ALPINE_RAIL_Y, z: -2.8 },
  { x: -9.5, y: ALPINE_RAIL_Y, z: -4.8 },
  { x: -3.2, y: ALPINE_RAIL_Y, z: -6.0 },
  { x: 3.5, y: ALPINE_RAIL_Y, z: -5.4 },
  { x: 9.8, y: ALPINE_RAIL_Y, z: -3.8 },
  { x: 15.6, y: ALPINE_RAIL_Y, z: -3.2 },
  // Curves inside East Mountain, emerging onto eastern scenic hillside
  { x: 21.8, y: 5.14, z: -4.2 },
  { x: 28.8, y: 4.62, z: -3.4 },
  { x: 34.0, y: 4.08, z: 1.5 },
  { x: 35.2, y: 3.56, z: 8.6 },
  // East Overpass Bridge (clears lower climbing track by 2.89 units!)
  { x: 33.2, y: 3.25, z: 15.2 },
  { x: 28.2, y: 2.55, z: 21.2 },
  // Sunny southern valley foreground descent
  { x: 18.8, y: 1.72, z: 24.8 },
  { x: 6.5, y: 1.02, z: 25.6 },
  { x: -6.5, y: 0.56, z: 25.4 },
  { x: -15.5, y: 0.38, z: 23.6 },
  { x: -19.5, y: VALLEY_RAIL_Y, z: 19.6 },
  { x: -19.2, y: VALLEY_RAIL_Y, z: 15.6 },
  { x: -17.4, y: VALLEY_RAIL_Y, z: 13.7 },
  // Collinear merge back into WEST_JUNCTION_POS with exact tangent (+1, 0, 0)
  { x: -15.0, y: VALLEY_RAIL_Y, z: 13.5 },
];

/**
 * Legacy aliases kept for terrain proximity checks & tests
 */
export const VALLEY_MAIN_CONTROL_POINTS: Vec3Tuple[] = [
  ...TRUNK_MAIN_POINTS.slice(0, -1),
  ...LOOP_VALLEY_POINTS.slice(0, -1),
];

export const VALLEY_SIDING_CONTROL_POINTS: Vec3Tuple[] = [
  ...TRUNK_SIDING_POINTS.slice(0, -1),
  ...LOOP_VALLEY_POINTS.slice(0, -1),
];

export const ALPINE_FREIGHT_CONTROL_POINTS: Vec3Tuple[] = LOOP_ALPINE_POINTS;

/**
 * Siding visual branch only (from west turnout to east turnout) for track construction
 */
export const SIDING_SEGMENT_POINTS: Vec3Tuple[] = [
  { x: -13.2, y: VALLEY_RAIL_Y, z: 13.5 },
  { x: -10.8, y: VALLEY_RAIL_Y, z: 13.2 },
  { x: -8.2, y: VALLEY_RAIL_Y, z: 11.4 },
  { x: -5.5, y: VALLEY_RAIL_Y, z: 10.2 },
  { x: 0.0, y: VALLEY_RAIL_Y, z: 10.2 },
  { x: 5.5, y: VALLEY_RAIL_Y, z: 10.2 },
  { x: 8.2, y: VALLEY_RAIL_Y, z: 11.4 },
  { x: 10.8, y: VALLEY_RAIL_Y, z: 13.2 },
  { x: 13.2, y: VALLEY_RAIL_Y, z: 13.5 },
];

/**
 * Dead-end goods spur branching off the siding for authentic exhibition detail (buffer stop + parked car)
 */
export const DEAD_END_SPUR_POINTS: Vec3Tuple[] = [
  { x: -5.2, y: VALLEY_RAIL_Y, z: 10.2 },
  { x: -2.0, y: VALLEY_RAIL_Y, z: 9.5 },
  { x: 1.5, y: VALLEY_RAIL_Y, z: 7.9 },
  { x: 5.8, y: VALLEY_RAIL_Y, z: 7.4 },
];

/**
 * Scenic Village Road Loop — double-lane Level Crossing deck at x=+24.8, z=+1.5..+3.1
 */
export const ROAD_LOOP_POINTS: Vec3Tuple[] = [
  // Eastbound lane approaching the Level Crossing from the village
  { x: 13.5, y: 0.07, z: 3.1 },
  { x: 19.5, y: 0.07, z: 3.1 },
  { x: 24.8, y: 0.16, z: 3.1 }, // Level crossing eastbound lane
  { x: 28.0, y: 0.07, z: 3.3 },
  // Eastern village cul-de-sac turnaround beyond the tracks
  { x: 29.6, y: 0.07, z: 2.1 },
  { x: 28.2, y: 0.07, z: 0.9 },
  // Westbound lane returning across the same Level Crossing
  { x: 24.8, y: 0.16, z: 1.5 }, // Level crossing westbound lane
  { x: 19.5, y: 0.07, z: 1.5 },
  { x: 13.8, y: 0.07, z: 1.3 },
  // Sweeping through the village square & central valley boulevard
  { x: 9.2, y: 0.07, z: 1.8 },
  { x: 7.4, y: 0.07, z: 4.2 },
  { x: 9.6, y: 0.07, z: 6.0 },
  { x: 13.6, y: 0.07, z: 5.5 },
  { x: 15.8, y: 0.07, z: 4.3 },
];

/**
 * Winding Mountain Stream centerline from North-West Alpine Gorge -> Under Steel Truss Bridge ->
 * Under Curved Stone Arch Viaduct -> Past Pastures -> South-West culvert.
 */
export const RIVER_CENTER_POINTS: Array<{ x: number; z: number; halfWidth: number }> = [
  { x: -6.8, z: -30.8, halfWidth: 2.0 },
  { x: -6.0, z: -26.0, halfWidth: 2.1 },
  { x: -5.5, z: -21.5, halfWidth: 2.1 },
  { x: -4.2, z: -17.5, halfWidth: 2.2 },
  { x: -3.5, z: -14.4, halfWidth: 2.4 }, // Under steel truss bridge
  { x: -3.6, z: -10.5, halfWidth: 2.5 },
  { x: -3.4, z: -6.0, halfWidth: 2.7 },  // Under curved stone viaduct center
  { x: -5.2, z: -1.5, halfWidth: 2.4 },
  { x: -8.6, z: 2.6, halfWidth: 2.2 },
  { x: -12.6, z: 5.2, halfWidth: 2.1 },
  { x: -16.8, z: 7.2, halfWidth: 2.0 },
  { x: -20.5, z: 11.2, halfWidth: 1.9 },
  { x: -22.2, z: 17.5, halfWidth: 1.9 },
  { x: -23.0, z: 24.0, halfWidth: 2.0 },
  { x: -23.8, z: 30.8, halfWidth: 2.1 },
];

export const WATER_LEVEL = -1.05;

/**
 * Positive wrap for periodic arc-length distances on closed curves.
 */
export function wrapDistance(distance: number, totalLength: number): number {
  if (totalLength <= 0) return 0;
  const r = distance % totalLength;
  return r < 0 ? r + totalLength : r;
}

/**
 * Computes exact arc-length positions for every car in a consist behind the lead locomotive,
 * so consecutive cars stay coupled without overlap or detachment even in tight curves.
 */
export function computeCarDistances(
  leadCenterDist: number,
  carLengths: readonly number[],
  couplingGap: number,
  totalTrackLength: number
): number[] {
  if (carLengths.length === 0) return [];
  const result: number[] = [wrapDistance(leadCenterDist, totalTrackLength)];
  let cursor = leadCenterDist;
  for (let i = 1; i < carLengths.length; i++) {
    const stepBack = carLengths[i - 1] * 0.5 + couplingGap + carLengths[i] * 0.5;
    cursor -= stepBack;
    result.push(wrapDistance(cursor, totalTrackLength));
  }
  return result;
}

export interface OrthonormalBasis {
  xAxis: Vec3Tuple;
  yAxis: Vec3Tuple;
  zAxis: Vec3Tuple;
  determinant: number;
}

/**
 * Computes a guaranteed right-handed orthonormal basis (det = +1) whose local +Z axis
 * aligns strictly with the track forward tangent (and +Y points upward).
 */
export function computeRightHandedTrackBasis(forward: Vec3Tuple): OrthonormalBasis {
  const fLen = Math.hypot(forward.x, forward.y, forward.z) || 1;
  const zx = forward.x / fLen;
  const zy = forward.y / fLen;
  const zz = forward.z / fLen;

  // Right-handed X = worldUp (0,1,0) × Z = (zz, 0, -zx)
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  const xLen = Math.hypot(xx, xy, xz);
  if (xLen < 1e-6) {
    xx = 1;
    xy = 0;
    xz = 0;
  } else {
    xx /= xLen;
    xz /= xLen;
  }

  // Right-handed Y = Z × X
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const yLen = Math.hypot(yx, yy, yz) || 1;
  const uyx = yx / yLen;
  const uyy = yy / yLen;
  const uyz = yz / yLen;

  const cx = uyy * zz - uyz * zy;
  const cy = uyz * zx - uyx * zz;
  const cz = uyx * zy - uyy * zx;
  const determinant = xx * cx + xy * cy + xz * cz;

  return {
    xAxis: { x: xx, y: xy, z: xz },
    yAxis: { x: uyx, y: uyy, z: uyz },
    zAxis: { x: zx, y: zy, z: zz },
    determinant,
  };
}

/**
 * Evaluates whether the level crossing barriers should be closed based on
 * manual override or any train car approaching within the trigger radius.
 */
export function evaluateCrossingState(
  trainCarPositions: ReadonlyArray<{ x: number; z: number }>,
  crossingPos: { x: number; z: number },
  triggerRadius: number,
  mode: CrossingMode
): { closed: boolean; triggeredByTrain: boolean } {
  const r2 = triggerRadius * triggerRadius;
  let triggeredByTrain = false;
  for (let i = 0; i < trainCarPositions.length; i++) {
    const dx = trainCarPositions[i].x - crossingPos.x;
    const dz = trainCarPositions[i].z - crossingPos.z;
    if (dx * dx + dz * dz <= r2) {
      triggeredByTrain = true;
      break;
    }
  }
  return {
    closed: mode === 'manualClosed' || triggeredByTrain,
    triggeredByTrain,
  };
}

/**
 * Smoothly steps the level-crossing barrier angle between 0 (vertical open) and PI/2 (horizontal closed).
 */
export function stepBarrierAngle(
  currentAngle: number,
  shouldClose: boolean,
  dt: number,
  speedRadPerSec = 2.4
): number {
  const target = shouldClose ? Math.PI / 2 : 0;
  const delta = target - currentAngle;
  const maxStep = speedRadPerSec * Math.max(0, dt);
  if (Math.abs(delta) <= maxStep) return target;
  return currentAngle + Math.sign(delta) * maxStep;
}

/**
 * Determines whether a road vehicle moving along the village road loop should stop
 * right before the level crossing barriers (for both eastbound and westbound approaches).
 */
export function shouldCarStopForCrossing(
  carPos: { x: number; z: number },
  carDir: { x: number; z: number },
  crossingX: number,
  crossingZ: number,
  crossingClosed: boolean
): boolean {
  if (!crossingClosed) return false;
  if (Math.abs(carPos.z - crossingZ) > 2.2) return false;

  const dx = crossingX - carPos.x;
  const approaching = dx * carDir.x > 0.15;
  const absDx = Math.abs(dx);
  return approaching && absDx > 2.1 && absDx < 5.1;
}

/**
 * Legacy helper retained for backward compatibility with unit tests.
 */
export function canCommitRouteChange(
  carPositions: ReadonlyArray<{ x: number; z: number }>,
  currentRoute: SwitchRoute,
  desiredRoute: SwitchRoute
): boolean {
  if (currentRoute === desiredRoute) return false;
  for (let i = 0; i < carPositions.length; i++) {
    const p = carPositions[i];
    if (p.z > 6.5 && p.x > -15.5 && p.x < 15.5) {
      return false;
    }
  }
  return true;
}

/**
 * Shortest 2D distance from point (x, z) to a polyline (open or closed).
 */
export function distanceToPolyline2D(
  x: number,
  z: number,
  pts: ReadonlyArray<{ x: number; z: number }>,
  closed: boolean
): number {
  let minSq = Infinity;
  const count = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    let t = 0;
    if (lenSq > 1e-6) {
      t = ((x - a.x) * abx + (z - a.z) * abz) / lenSq;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const cx = a.x + abx * t;
    const cz = a.z + abz * t;
    const dx = x - cx;
    const dz = z - cz;
    const dSq = dx * dx + dz * dz;
    if (dSq < minSq) minSq = dSq;
  }
  return Math.sqrt(minSq);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function gaussianHill(x: number, z: number, cx: number, cz: number, rx: number, rz: number, h: number): number {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return h * Math.exp(-(dx * dx + dz * dz));
}

/**
 * Returns the river channel carve depth and whether the point is inside the stream bed.
 */
export function getRiverDepthAt(x: number, z: number): number {
  let minNormDist = Infinity;
  for (let i = 0; i < RIVER_CENTER_POINTS.length - 1; i++) {
    const a = RIVER_CENTER_POINTS[i];
    const b = RIVER_CENTER_POINTS[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    let t = 0;
    if (lenSq > 1e-6) {
      t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / lenSq));
    }
    const cx = a.x + abx * t;
    const cz = a.z + abz * t;
    const hw = a.halfWidth + (b.halfWidth - a.halfWidth) * t;
    const dist = Math.hypot(x - cx, z - cz);
    const norm = dist / hw;
    if (norm < minNormDist) minNormDist = norm;
  }
  if (minNormDist >= 1.75) return 0;
  const bankFactor = 1 - smoothstep(0.55, 1.75, minNormDist);
  return 1.85 * bankFactor;
}

/**
 * Deterministic model-railway terrain heightfield `y = getTerrainHeight(x, z)`.
 */
export function getTerrainHeight(x: number, z: number): number {
  let h = 0;

  // North-West Alpine Massif (houses the West Alpine Tunnel & rises to 13.8)
  h += gaussianHill(x, z, -21.5, -13.5, 9.5, 8.6, 13.8);
  h += gaussianHill(x, z, -19.5, -6.5, 5.2, 5.0, 8.6);
  h += gaussianHill(x, z, -14.5, -19.2, 8.5, 5.4, 11.8);

  // North-East Alpine Massif & Chapel Ridge (houses East Alpine Tunnel + lower NE tunnel)
  h += gaussianHill(x, z, 20.8, -13.0, 9.8, 8.8, 13.6);
  h += gaussianHill(x, z, 18.8, -6.2, 5.6, 4.8, 9.2);
  h += gaussianHill(x, z, 13.5, -19.0, 8.8, 5.6, 11.0);

  // Far North Backdrop Ridge (extended across the doubled plateau behind the alpine shelf)
  h += gaussianHill(x, z, -2.5, -24.5, 22.0, 5.8, 11.6);
  h += gaussianHill(x, z, -33.5, -24.5, 10.5, 6.2, 10.4);
  h += gaussianHill(x, z, 28.5, -22.5, 11.0, 6.8, 10.2);

  // Eastern & South-Eastern Countryside Foothills (sculpted to cradle the eastern climbing ramp)
  h += gaussianHill(x, z, 37.5, -10.5, 7.5, 7.8, 4.4);
  h += gaussianHill(x, z, 42.5, 18.5, 5.5, 6.5, 1.8);

  // Chapel Knoll on the sunny eastern overlook (x = 16.6, z = -7.2) with broad terraced shoulder
  h += gaussianHill(x, z, 16.6, -7.2, 5.4, 4.6, 3.8);

  // Western Pasture Rolling Hill (inside west bend of track)
  h += gaussianHill(x, z, -18.0, 1.8, 6.2, 5.0, 1.45);

  // New Western Grand Pré gentle meadow undulation
  h += gaussianHill(x, z, -36.5, 2.5, 8.5, 7.2, 0.72);

  // Multi-octave rocky crag relief on mountain elevations
  const crag =
    Math.sin(x * 0.34 + z * 0.27) * 0.42 +
    Math.cos(x * 0.68 - z * 0.54) * 0.28 +
    Math.sin(x * 1.15 + z * 0.92) * 0.14;
  h += crag * smoothstep(1.8, 6.0, h);

  // Keep the high alpine northern shelf carved cleanly along z in [-19.4, -17.3], x in [-11.5, +13.0]
  if (x > -12.5 && x < 13.5 && z < -16.2 && z > -20.0) {
    const shelfMask =
      smoothstep(-12.5, -10.5, x) *
      (1 - smoothstep(11.5, 13.5, x)) *
      (1 - smoothstep(-17.4, -16.2, z)) *
      smoothstep(-20.0, -19.2, z);
    const targetShelf = ALPINE_RAIL_Y - 0.32;
    if (h > targetShelf) {
      h = h * (1 - shelfMask) + targetShelf * shelfMask;
    }
  }

  // Carve flat valley floor for Village, Station, Siding & Level Crossing
  const villageFlat =
    smoothstep(-4.8, -0.4, z) * smoothstep(-10.5, -5.0, x) * (1 - smoothstep(29.0, 35.0, x));
  h *= 1 - villageFlat * 0.96;

  // Keep the south station, foreground alpine descent & east overpass underpass flat (z > 8.2, x in [-26, 39])
  const southFlat =
    smoothstep(6.2, 9.5, z) * smoothstep(-27.0, -23.0, x) * (1 - smoothstep(37.5, 42.5, x));
  h *= 1 - southFlat * 0.98;

  // Keep the eastern climbing ramp corridor cleanly graded below the track height
  if (x > 26.0 && z > -22.5 && z < 18.0) {
    const eastRampDist = distanceToPolyline2D(x, z, LOOP_ALPINE_POINTS.slice(3, 13), false);
    if (eastRampDist < 3.4) {
      const rampMask = 1 - smoothstep(1.6, 3.4, eastRampDist);
      // Smoothly clamp terrain slightly below the climbing ramp so piers/ballast sit cleanly
      const approxRailY = VALLEY_RAIL_Y + smoothstep(15.5, -20.0, z) * (ALPINE_RAIL_Y - VALLEY_RAIL_Y);
      const maxGround = Math.max(0, approxRailY - 0.36);
      if (h > maxGround) {
        h = h * (1 - rampMask) + maxGround * rampMask;
      }
    }
  }

  // Keep the eastern hillside descent corridor clear (from East Mountain exit at x=28.8, z=-3.4 down to overpass)
  if (x > 26.0 && z > -6.5 && z < 19.0) {
    const eastDescDist = distanceToPolyline2D(x, z, LOOP_ALPINE_POINTS.slice(26, 31), false);
    if (eastDescDist < 3.0) {
      const descMask = 1 - smoothstep(1.4, 3.0, eastDescDist);
      const approxRailY = 4.65 - smoothstep(-3.5, 16.0, z) * 1.45;
      const maxGround = Math.max(0, approxRailY - 0.55);
      if (h > maxGround) {
        h = h * (1 - descMask) + maxGround * descMask;
      }
    }
  }

  // Keep the new Western Farmstead courtyard & crop zone gently level around y = 0.16
  const farmDist = Math.hypot((x - FARM_COURTYARD_CENTER.x) * 0.85, (z - FARM_COURTYARD_CENTER.z) * 0.75);
  if (farmDist < 12.5) {
    const farmFlat = 1 - smoothstep(6.8, 12.5, farmDist);
    h = h * (1 - farmFlat) + 0.16 * farmFlat;
  }

  // Keep Grand Pré meadow gently rolling & low
  if (x < -26.0 && z > -6.5 && z < 13.5) {
    const meadowMask =
      (1 - smoothstep(-28.5, -26.0, x)) *
      smoothstep(-6.5, -3.5, z) *
      (1 - smoothstep(10.5, 13.5, z));
    const gentleY = 0.25 + 0.35 * Math.sin(x * 0.22) * Math.cos(z * 0.22);
    h = h * (1 - meadowMask * 0.85) + gentleY * (meadowMask * 0.85);
  }

  // Keep east level crossing & eastern turnaround completely level (road is z = 1.5..3.1, keep north hillside intact!)
  const eastCrossingFlat =
    smoothstep(18.0, 21.5, x) *
    (1 - smoothstep(30.5, 34.0, x)) *
    smoothstep(-1.2, 1.0, z) *
    (1 - smoothstep(8.5, 12.0, z));
  h *= 1 - eastCrossingFlat;

  // Carve valley river gorge BEFORE bridge/track protection
  const riverCarve = getRiverDepthAt(x, z);
  if (riverCarve > 0) {
    const gorgeAttenuation = smoothstep(-22.0, -18.5, z);
    const gorgeFactor = Math.min(1, riverCarve / 1.85);
    h = h * (1 - gorgeFactor * 0.92 * gorgeAttenuation) - riverCarve;
  }

  // Protect the lower valley rail corridor EXCEPT inside the two lower rock tunnels
  const inLowerTunnelNE = x > 12.0 && x < 23.8 && z > -16.2 && z < -8.2;
  const inLowerTunnelW = x > -26.5 && x < -19.0 && z > -13.2 && z < -5.7;

  if (!inLowerTunnelNE && !inLowerTunnelW) {
    const distValleyTrack = distanceToPolyline2D(x, z, VALLEY_MAIN_CONTROL_POINTS, true);
    if (distValleyTrack < 2.8 && riverCarve < 0.25) {
      const trackFlat = 1 - smoothstep(1.3, 2.8, distValleyTrack);
      h = h * (1 - trackFlat);
    }
  }

  // Taper terrain neatly to the board edge
  const edgeX = smoothstep(BOARD_W * 0.5 - 1.4, BOARD_W * 0.5, Math.abs(x));
  const edgeZ = smoothstep(BOARD_D * 0.5 - 1.4, BOARD_D * 0.5, Math.abs(z));
  const edgeClamp = Math.max(edgeX, edgeZ);
  if (edgeClamp > 0 && h > 0) {
    h *= 1 - edgeClamp * 0.28;
  }

  return h;
}
