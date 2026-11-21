import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  InterlockingController,
  MIN_HEADWAY_GAP,
  isTrunkSegment,
  resolveTrailPosition,
} from './interlocking';
import {
  LOOP_ALPINE_POINTS,
  LOOP_VALLEY_POINTS,
  TRUNK_MAIN_POINTS,
  TRUNK_SIDING_POINTS,
} from './railwayMath';
import type { SegmentId } from './types';

function createNetworkCurves() {
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
  const lengths = {
    trunk_main: curves.trunk_main.getLength(),
    trunk_siding: curves.trunk_siding.getLength(),
    loop_valley: curves.loop_valley.getLength(),
    loop_alpine: curves.loop_alpine.getLength(),
  };
  return { curves, lengths };
}

test('Connected track segments meet with C0 position and C1 tangent continuity at J_WEST and J_EAST', () => {
  const { curves } = createNetworkCurves();
  const eastPos = curves.trunk_main.getPointAt(1);
  const westPos = curves.trunk_main.getPointAt(0);
  const eastDir = new THREE.Vector3(1, 0, 0);

  // J_EAST continuity: trunk_main(1) === trunk_siding(1) === loop_valley(0) === loop_alpine(0)
  assert.ok(curves.trunk_siding.getPointAt(1).distanceTo(eastPos) < 1e-4);
  assert.ok(curves.loop_valley.getPointAt(0).distanceTo(eastPos) < 1e-4);
  assert.ok(curves.loop_alpine.getPointAt(0).distanceTo(eastPos) < 1e-4);

  // J_WEST continuity: trunk_main(0) === trunk_siding(0) === loop_valley(1) === loop_alpine(1)
  assert.ok(curves.trunk_siding.getPointAt(0).distanceTo(westPos) < 1e-4);
  assert.ok(curves.loop_valley.getPointAt(1).distanceTo(westPos) < 1e-4);
  assert.ok(curves.loop_alpine.getPointAt(1).distanceTo(westPos) < 1e-4);

  // Tangent continuity (+X) across J_EAST and J_WEST
  assert.ok(curves.trunk_main.getTangentAt(1).dot(eastDir) > 0.995);
  assert.ok(curves.loop_valley.getTangentAt(0).dot(eastDir) > 0.96);
  assert.ok(curves.loop_alpine.getTangentAt(0).dot(eastDir) > 0.96);
  assert.ok(curves.loop_valley.getTangentAt(1).dot(eastDir) > 0.96);
  assert.ok(curves.loop_alpine.getTangentAt(1).dot(eastDir) > 0.96);
});

test('Auto mode exchanges both trains across Boucle A and Boucle B with zero teleportation and zero collisions', () => {
  const { curves, lengths } = createNetworkCurves();
  const ctrl = new InterlockingController(lengths);

  let prevPassPos: THREE.Vector3 | null = null;
  let prevFreightPos: THREE.Vector3 | null = null;
  let observedWaitingStop = false;
  let min3DCarGap = Infinity;

  const dt = 0.05; // 20 Hz simulation tick
  // Simulate 260 seconds of continuous traffic (equivalent to 130s at 2x speed)
  for (let step = 0; step < 5200; step++) {
    const snap = ctrl.step(dt, 'auto', 'main');
    const p = snap.trains.passenger;
    const f = snap.trains.freight;

    if (p.waitingAtJunction || f.waitingAtJunction) {
      observedWaitingStop = true;
    }

    // Verify mutual exclusion on the shared trunk
    assert.ok(
      !(isTrunkSegment(p.currentSegment) && isTrunkSegment(f.currentSegment)),
      `Both trains entered the shared trunk simultaneously at step ${step}`
    );

    // Sample lead locomotive world positions and assert zero jump/teleportation
    const pLoc = resolveTrailPosition(p.trail, p.odometer);
    const fLoc = resolveTrailPosition(f.trail, f.odometer);
    const pPos = curves[pLoc.segmentId].getPointAt(pLoc.u);
    const fPos = curves[fLoc.segmentId].getPointAt(fLoc.u);

    if (prevPassPos) {
      const jump = pPos.distanceTo(prevPassPos);
      assert.ok(jump <= p.cruiseSpeed * dt + 0.12, `Passenger jump detected: ${jump.toFixed(3)}`);
    }
    if (prevFreightPos) {
      const jump = fPos.distanceTo(prevFreightPos);
      assert.ok(jump <= f.cruiseSpeed * dt + 0.12, `Freight jump detected: ${jump.toFixed(3)}`);
    }
    prevPassPos = pPos.clone();
    prevFreightPos = fPos.clone();

    // Check 3D separation between every car of Train A and every car of Train B
    const sampleCarCenters = (train: typeof p): THREE.Vector3[] => {
      const pts: THREE.Vector3[] = [];
      let cursor = train.odometer;
      for (let i = 0; i < train.carLengths.length; i++) {
        if (i > 0) {
          cursor -= train.carLengths[i - 1] * 0.5 + train.couplingGap + train.carLengths[i] * 0.5;
        }
        const loc = resolveTrailPosition(train.trail, cursor);
        pts.push(curves[loc.segmentId].getPointAt(loc.u));
      }
      return pts;
    };

    const pCenters = sampleCarCenters(p);
    const fCenters = sampleCarCenters(f);
    for (const pc of pCenters) {
      for (const fc of fCenters) {
        const d = pc.distanceTo(fc);
        if (d < min3DCarGap) min3DCarGap = d;
      }
    }
  }

  // Both trains must have visited BOTH loops and completed multiple circuit exchanges!
  assert.equal(ctrl.trains.passenger.visitedLoops.valley, true);
  assert.equal(ctrl.trains.passenger.visitedLoops.alpine, true);
  assert.equal(ctrl.trains.freight.visitedLoops.valley, true);
  assert.equal(ctrl.trains.freight.visitedLoops.alpine, true);
  assert.ok(ctrl.trains.passenger.completedExchanges >= 2, 'Passenger must exchange circuits >= 2 times');
  assert.ok(ctrl.trains.freight.completedExchanges >= 2, 'Freight must exchange circuits >= 2 times');

  // Verify progressive braking & stop at red signal occurred naturally
  assert.equal(observedWaitingStop, true, 'At least one train should wait at red signal when trunk is busy');

  // Verify safe 3D car-to-car clearance across the entire run (car width ~1.3, length ~3.6)
  assert.ok(
    min3DCarGap > 3.6,
    `Minimum 3D distance between Train A and Train B cars dropped too low: ${min3DCarGap.toFixed(2)}`
  );
});

test('Manual routing both trains onto Boucle A enforces safe headway with zero collisions or deadlocks', () => {
  const { curves, lengths } = createNetworkCurves();
  const ctrl = new InterlockingController(lengths);

  let minSameLoopGap = Infinity;
  let min3DGap = Infinity;
  const startPassOdo = ctrl.trains.passenger.odometer;
  const startFreightOdo = ctrl.trains.freight.odometer;

  // Simulate 180 seconds at 2x speed (dt = 0.1s per frame -> internally substepped!)
  for (let step = 0; step < 1800; step++) {
    const snap = ctrl.step(0.1, 'manual_valley', 'siding');
    const p = snap.trains.passenger;
    const f = snap.trains.freight;

    assert.ok(!(isTrunkSegment(p.currentSegment) && isTrunkSegment(f.currentSegment)));

    if (p.currentSegment === f.currentSegment && p.currentSegment === 'loop_valley') {
      const pSeg = p.trail[p.trail.length - 1];
      const fSeg = f.trail[f.trail.length - 1];
      const pD = p.odometer - pSeg.startDist;
      const fD = f.odometer - fSeg.startDist;
      const gap = pD > fD ? pD - p.totalLength - fD : fD - f.totalLength - pD;
      if (gap < minSameLoopGap) minSameLoopGap = gap;
    }

    // Also verify 3D separation between lead noses and tail cars
    const pNose = curves[resolveTrailPosition(p.trail, p.odometer).segmentId].getPointAt(
      resolveTrailPosition(p.trail, p.odometer).u
    );
    const fTailLoc = resolveTrailPosition(f.trail, f.odometer - f.totalLength);
    const fTail = curves[fTailLoc.segmentId].getPointAt(fTailLoc.u);
    const d1 = pNose.distanceTo(fTail);
    if (d1 < min3DGap) min3DGap = d1;
  }

  // Both trains must make continuous forward progress (no deadlock)
  assert.ok(ctrl.trains.passenger.odometer - startPassOdo > 350, 'Passenger should keep circulating');
  assert.ok(ctrl.trains.freight.odometer - startFreightOdo > 300, 'Freight should keep circulating');

  // Same-loop headway gap must stay safely positive near MIN_HEADWAY_GAP
  assert.ok(
    minSameLoopGap >= MIN_HEADWAY_GAP - 1.5,
    `Same-loop headway violated: ${minSameLoopGap.toFixed(2)}`
  );
  assert.ok(min3DGap > 3.5, `3D nose-to-tail gap too small: ${min3DGap.toFixed(2)}`);
});

test('Approaching train decelerates progressively and stops before red signal when shared block is occupied', () => {
  const { lengths } = createNetworkCurves();
  const ctrl = new InterlockingController(lengths);

  // Place Train A near start of trunk (occupying shared block) and Train B right on approach to J_WEST
  ctrl.trains.passenger.odometer = 4.0;
  ctrl.trains.passenger.speed = 3.0;
  ctrl.blockOwner = 'passenger';

  ctrl.trains.freight.odometer = lengths.loop_alpine - 20.0;
  ctrl.trains.freight.speed = 6.2;

  const speeds: number[] = [];
  let sawRedSignal = false;
  let reachedFullStop = false;

  for (let i = 0; i < 90; i++) {
    const snap = ctrl.step(0.05, 'auto', 'main');
    if (snap.signalAlpineAspect === 'red') sawRedSignal = true;
    speeds.push(snap.trains.freight.speed);
    if (snap.trains.freight.speed === 0 && snap.trains.freight.waitingAtJunction) {
      reachedFullStop = true;
      // Must stop strictly BEFORE entering J_WEST (still on loop_alpine)
      assert.equal(snap.trains.freight.currentSegment, 'loop_alpine');
      break;
    }
  }

  assert.equal(sawRedSignal, true, 'Alpine approach signal should turn red while trunk is occupied');
  assert.equal(reachedFullStop, true, 'Train B should come to a complete stop before J_WEST');
  const midIdx = Math.floor(speeds.length * 0.72);
  assert.ok(
    speeds[0] > speeds[midIdx] && speeds[midIdx] > 0,
    `Deceleration should be progressive (start=${speeds[0].toFixed(2)}, mid=${speeds[midIdx].toFixed(2)})`
  );
});
