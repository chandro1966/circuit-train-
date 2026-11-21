import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  LANE_OFFSET,
  RIVER_BRIDGE_CENTER,
  RIVER_BRIDGE_DECK_Y,
  ROAD_CENTERLINE_POINTS,
  buildRoadNetworkCurves,
  getRoadElevationAt,
  stepRoadTraffic,
  type RoadVehicleState,
} from './roadNetwork';
import {
  LEVEL_CROSSING_POS,
  LOOP_VALLEY_POINTS,
  TRUNK_MAIN_POINTS,
  distanceToPolyline2D,
} from './railwayMath';

test('Wide departmental road spans Village -> Crossing -> Station -> River Bridge -> Farm without anarchic rail crossings', () => {
  const { centerCurve, vehicleLoopCurve } = buildRoadNetworkCurves();
  const len = centerCurve.getLength();
  assert.ok(len > 130, `Expected wide plateau-spanning road (>130u), got ${len.toFixed(1)}`);
  const loopLen = vehicleLoopCurve.getLength();
  assert.ok(loopLen > 280, `Expected full bidirectional loop (>280u), got ${loopLen.toFixed(1)}`);

  // Verify the road never crosses ground-level valley tracks (trunk_main or loop_valley)
  // anywhere outside the designated Level Crossing zone at (24.8, 2.3)
  const samples = 240;
  for (let i = 0; i <= samples; i++) {
    const p = centerCurve.getPointAt(i / samples);
    const distCrossing = Math.hypot(p.x - LEVEL_CROSSING_POS.x, p.z - LEVEL_CROSSING_POS.z);
    if (distCrossing < 4.5) continue;

    const dTrunk = distanceToPolyline2D(p.x, p.z, TRUNK_MAIN_POINTS, false);
    const dValley = distanceToPolyline2D(p.x, p.z, LOOP_VALLEY_POINTS, false);
    assert.ok(
      dTrunk > 2.0,
      `Road point (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) unexpectedly close to station trunk (${dTrunk.toFixed(2)})`
    );
    assert.ok(
      dValley > 2.0,
      `Road point (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) unexpectedly close to valley loop outside crossing (${dValley.toFixed(2)})`
    );
  }
});

test('Stone River Bridge arches cleanly above river level and transitions smoothly to ground approaches', () => {
  const peakY = getRoadElevationAt(RIVER_BRIDGE_CENTER.x, RIVER_BRIDGE_CENTER.z);
  assert.ok(peakY >= RIVER_BRIDGE_DECK_Y - 0.02, `Expected bridge deck near ${RIVER_BRIDGE_DECK_Y}, got ${peakY}`);

  const eastApproachY = getRoadElevationAt(RIVER_BRIDGE_CENTER.x + 8.0, RIVER_BRIDGE_CENTER.z);
  const westApproachY = getRoadElevationAt(RIVER_BRIDGE_CENTER.x - 8.0, RIVER_BRIDGE_CENTER.z);
  assert.ok(eastApproachY < peakY - 0.4, 'East approach should descend smoothly from bridge');
  assert.ok(westApproachY < peakY - 0.4, 'West approach should descend smoothly from bridge');
});

test('Bidirectional vehicle lanes maintain lateral separation so oncoming cars pass cleanly without colliding', () => {
  const { outwardLanePoints, returnLanePoints } = buildRoadNetworkCurves();
  assert.equal(outwardLanePoints.length, returnLanePoints.length);

  for (let i = 0; i < outwardLanePoints.length; i++) {
    const sep = outwardLanePoints[i].distanceTo(returnLanePoints[i]);
    assert.ok(
      sep >= LANE_OFFSET * 1.9,
      `Opposing lanes too close at sample ${i}: ${sep.toFixed(3)}`
    );
  }
});

test('Bidirectional traffic stops cleanly on both sides of closed level crossing and resumes when opened', () => {
  const { vehicleLoopCurve } = buildRoadNetworkCurves();
  const totalLen = vehicleLoopCurve.getLength();

  // Locate eastbound (+X) and westbound (-X) approach distances just before LEVEL_CROSSING_POS
  const findApproachDist = (wantDirX: number): number => {
    let bestD = 0;
    let bestErr = Infinity;
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i < 600; i++) {
      const u = i / 600;
      vehicleLoopCurve.getPointAt(u, p);
      vehicleLoopCurve.getTangentAt(u, t).normalize();
      if (t.x * wantDirX < 0.7) continue;
      const targetX = LEVEL_CROSSING_POS.x - wantDirX * 3.8;
      const err = Math.hypot(p.x - targetX, p.z - LEVEL_CROSSING_POS.z);
      if (err < bestErr) {
        bestErr = err;
        bestD = u * totalLen;
      }
    }
    return bestD;
  };

  const vehicles: RoadVehicleState[] = [
    { id: 'eastbound', dist: findApproachDist(1), speed: 3.2, maxSpeed: 3.2, length: 1.45 },
    { id: 'westbound', dist: findApproachDist(-1), speed: 3.2, maxSpeed: 3.2, length: 1.55 },
  ];

  // With crossing closed, both approaching vehicles must decelerate to a complete stop
  for (let s = 0; s < 60; s++) {
    stepRoadTraffic(vehicles, vehicleLoopCurve, totalLen, 0.05, true);
  }
  assert.equal(vehicles[0].speed, 0, 'Eastbound vehicle should stop before closed crossing');
  assert.equal(vehicles[1].speed, 0, 'Westbound vehicle should stop before closed crossing');

  // When crossing opens, both vehicles must accelerate and resume driving
  for (let s = 0; s < 30; s++) {
    stepRoadTraffic(vehicles, vehicleLoopCurve, totalLen, 0.05, false);
  }
  assert.ok(vehicles[0].speed > 2.5, 'Eastbound vehicle should resume after barriers open');
  assert.ok(vehicles[1].speed > 2.5, 'Westbound vehicle should resume after barriers open');
  assert.ok(ROAD_CENTERLINE_POINTS.length >= 18);
});
