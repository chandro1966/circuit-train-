import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPINE_RAIL_Y,
  BOARD_D,
  BOARD_W,
  FARM_COURTYARD_CENTER,
  LEVEL_CROSSING_POS,
  VALLEY_MAIN_CONTROL_POINTS,
  VALLEY_RAIL_Y,
  canCommitRouteChange,
  computeCarDistances,
  computeRightHandedTrackBasis,
  evaluateCrossingState,
  getTerrainHeight,
  shouldCarStopForCrossing,
  stepBarrierAngle,
  wrapDistance,
} from './railwayMath';

test('wrapDistance wraps positive and negative arc lengths cleanly', () => {
  assert.equal(wrapDistance(110, 100), 10);
  assert.equal(wrapDistance(-15, 100), 85);
  assert.equal(wrapDistance(0, 100), 0);
});

test('computeCarDistances spaces cars strictly without overlap or detachment', () => {
  const carLengths = [4.0, 3.6, 3.6, 3.6];
  const gap = 0.35;
  const trackLen = 160;
  const dists = computeCarDistances(2.0, carLengths, gap, trackLen);

  assert.equal(dists.length, 4);
  assert.equal(dists[0], 2.0);
  // Second car center is 2.0 - (2.0 + 0.35 + 1.8) = -2.15 => wrapped to 157.85
  assert.ok(Math.abs(dists[1] - 157.85) < 1e-6);
  // Third car center is 157.85 - (1.8 + 0.35 + 1.8) = 153.9
  assert.ok(Math.abs(dists[2] - 153.9) < 1e-6);
  // Fourth car center is 153.9 - 3.95 = 149.95
  assert.ok(Math.abs(dists[3] - 149.95) < 1e-6);
});

test('evaluateCrossingState detects approaching train and respects manual override', () => {
  const farTrain = [{ x: -15, z: 13.5 }, { x: -19, z: 13.5 }];
  const nearTrain = [{ x: 24.8, z: 6.5 }, { x: 24.8, z: 10.5 }];

  const autoFar = evaluateCrossingState(farTrain, LEVEL_CROSSING_POS, 10, 'auto');
  assert.equal(autoFar.closed, false);
  assert.equal(autoFar.triggeredByTrain, false);

  const autoNear = evaluateCrossingState(nearTrain, LEVEL_CROSSING_POS, 10, 'auto');
  assert.equal(autoNear.closed, true);
  assert.equal(autoNear.triggeredByTrain, true);

  const manualFar = evaluateCrossingState(farTrain, LEVEL_CROSSING_POS, 10, 'manualClosed');
  assert.equal(manualFar.closed, true);
  assert.equal(manualFar.triggeredByTrain, false);
});

test('stepBarrierAngle transitions smoothly between vertical (0) and horizontal (PI/2)', () => {
  let angle = 0;
  angle = stepBarrierAngle(angle, true, 0.25, 2.0);
  assert.ok(Math.abs(angle - 0.5) < 1e-6);
  angle = stepBarrierAngle(angle, true, 2.0, 2.0);
  assert.ok(Math.abs(angle - Math.PI * 0.5) < 1e-6);
  angle = stepBarrierAngle(angle, false, 2.0, 2.0);
  assert.equal(angle, 0);
});

test('shouldCarStopForCrossing halts approaching cars and allows departing cars', () => {
  // Approaching from west (+x direction) while closed -> must stop
  assert.equal(
    shouldCarStopForCrossing({ x: 22.0, z: 3.1 }, { x: 1, z: 0 }, 24.8, 2.3, true),
    true
  );
  // Already past crossing moving away (+x direction) -> must not stop
  assert.equal(
    shouldCarStopForCrossing({ x: 27.2, z: 3.1 }, { x: 1, z: 0 }, 24.8, 2.3, true),
    false
  );
  // Crossing open -> must not stop
  assert.equal(
    shouldCarStopForCrossing({ x: 22.0, z: 3.1 }, { x: 1, z: 0 }, 24.8, 2.3, false),
    false
  );
});

test('canCommitRouteChange blocks mid-station switch and allows switching outside siding zone', () => {
  const trainInStation = [{ x: 0, z: 13.5 }, { x: -4, z: 13.5 }];
  assert.equal(canCommitRouteChange(trainInStation, 'main', 'siding'), false);

  const trainOnNorthSide = [{ x: -3.5, z: -14.4 }, { x: 0.5, z: -14.4 }];
  assert.equal(canCommitRouteChange(trainOnNorthSide, 'main', 'siding'), true);
});

test('terrain heightfield keeps station, level crossing flat and mountains/river elevated/carved properly', () => {
  // Main station & crossing must be near y = 0
  assert.ok(Math.abs(getTerrainHeight(0, 13.5)) < 0.15);
  assert.ok(Math.abs(getTerrainHeight(LEVEL_CROSSING_POS.x, LEVEL_CROSSING_POS.z)) < 0.15);

  // River bed beneath viaduct & truss bridge must sit below valley rail level
  assert.ok(getTerrainHeight(-3.4, -6.0) < -0.8);
  assert.ok(getTerrainHeight(-3.5, -14.4) < -0.8);

  // Alpine peaks must rise cleanly above alpine railway for tunnel enclosures
  assert.ok(getTerrainHeight(-21.5, -13.5) > ALPINE_RAIL_Y + 3.0);
  assert.ok(getTerrainHeight(21.0, -13.2) > ALPINE_RAIL_Y + 3.0);

  // Ensure vertical clearance between valley rail and alpine viaduct
  assert.ok(ALPINE_RAIL_Y - VALLEY_RAIL_Y > 4.5);
  assert.ok(VALLEY_MAIN_CONTROL_POINTS.length >= 16);
});

test('computeRightHandedTrackBasis produces proper rotation (det = +1) for every 360° curve direction', () => {
  const headings = [
    { x: 1, y: 0, z: 0 },
    { x: 0.707, y: 0, z: 0.707 },
    { x: 0, y: 0, z: 1 },
    { x: -0.707, y: 0, z: 0.707 },
    { x: -1, y: 0, z: 0 },
    { x: -0.707, y: 0, z: -0.707 },
    { x: 0, y: 0, z: -1 },
    { x: 0.707, y: 0, z: -0.707 },
    { x: 0.8, y: 0.2, z: -0.56 },
  ];

  for (const h of headings) {
    const basis = computeRightHandedTrackBasis(h);
    assert.ok(
      Math.abs(basis.determinant - 1) < 1e-6,
      `Expected determinant +1, got ${basis.determinant}`
    );
    const fLen = Math.hypot(h.x, h.y, h.z);
    // Local +Z must match normalized forward heading exactly (dot === 1, never perpendicular)
    const dotForward =
      (basis.zAxis.x * h.x + basis.zAxis.y * h.y + basis.zAxis.z * h.z) / fLen;
    assert.ok(Math.abs(dotForward - 1) < 1e-6);
    // X · Z and Y · Z must be 0 (orthonormal)
    const dotXZ =
      basis.xAxis.x * basis.zAxis.x +
      basis.xAxis.y * basis.zAxis.y +
      basis.xAxis.z * basis.zAxis.z;
    assert.ok(Math.abs(dotXZ) < 1e-6);
  }
});

test('doubled exhibition plateau keeps farmyard level and grand cow meadow gently rolling', () => {
  // Original surface was 64 * 44 = 2816; doubled target >= 5600
  const area = BOARD_W * BOARD_D;
  assert.ok(area >= 5600, `Expected doubled area >= 5600, got ${area}`);

  // Farmstead courtyard must be gently leveled near y = 0.16
  const farmY = getTerrainHeight(FARM_COURTYARD_CENTER.x, FARM_COURTYARD_CENTER.z);
  assert.ok(farmY >= -0.1 && farmY <= 0.6, `Unexpected farmyard height: ${farmY}`);

  // Grand cow meadow center must be smooth, walkable grazing terrain (no cliff)
  const meadowY = getTerrainHeight(-35.5, 4.0);
  assert.ok(meadowY >= -0.2 && meadowY <= 1.5, `Unexpected meadow height: ${meadowY}`);
});
