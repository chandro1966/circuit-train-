import * as THREE from 'three';
import {
  InterlockingController,
  type InterlockingSnapshot,
  type TrainSimState,
  resolveTrailPosition,
} from '../sim/interlocking';
import type { JunctionMode, SegmentId, SwitchRoute } from '../sim/types';

export interface TrainLeadTransform {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
}

export interface TrainsSystemResult {
  group: THREE.Group;
  update: (
    dt: number,
    junctionMode: JunctionMode,
    desiredStationTrack: SwitchRoute
  ) => {
    allCarPositions: Array<{ x: number; z: number }>;
    passengerLead: TrainLeadTransform;
    freightLead: TrainLeadTransform;
    interlocking: InterlockingSnapshot;
  };
  setNightFactor: (nightFactor: number) => void;
  dispose: () => void;
}

/**
 * Builds both animated miniature trains (Train A — Passagers Express & Train B — Marchandises Alpin)
 * running seamlessly across the interconnected Valley (Boucle A) and Alpine Viaduct (Boucle B) network
 * under full block-signal interlocking and anti-collision headway control.
 */
export function buildTrainsSystem(
  curves: Record<SegmentId, THREE.CatmullRomCurve3>
): TrainsSystemResult {
  const group = new THREE.Group();
  group.name = 'TrainsSystem';

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Shared PBR Materials
  const chassisMat = track(new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.52, metalness: 0.65 }));
  const wheelMetalMat = track(new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.3, metalness: 0.85 }));
  const roofSilverMat = track(new THREE.MeshStandardMaterial({ color: 0x8e959e, roughness: 0.44, metalness: 0.55 }));
  const darkRoofMat = track(new THREE.MeshStandardMaterial({ color: 0x353b42, roughness: 0.58, metalness: 0.35 }));
  const pantographMat = track(new THREE.MeshStandardMaterial({ color: 0xb9c1ca, roughness: 0.3, metalness: 0.85 }));
  const creamStripeMat = track(new THREE.MeshStandardMaterial({ color: 0xf0e8d4, roughness: 0.4, metalness: 0.12 }));
  const passGreenMat = track(new THREE.MeshStandardMaterial({ color: 0x1e5645, roughness: 0.34, metalness: 0.25 }));
  const passBurgundyMat = track(new THREE.MeshStandardMaterial({ color: 0x7b252e, roughness: 0.36, metalness: 0.22 }));
  const freightRedMat = track(new THREE.MeshStandardMaterial({ color: 0xb33228, roughness: 0.38, metalness: 0.28 }));
  const tankerSilverMat = track(new THREE.MeshStandardMaterial({ color: 0xd5dce2, roughness: 0.24, metalness: 0.72 }));
  const hopperOxideMat = track(new THREE.MeshStandardMaterial({ color: 0x783c28, roughness: 0.72, metalness: 0.22 }));
  const coalMat = track(new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.94, metalness: 0.05 }));
  const logBarkMat = track(new THREE.MeshStandardMaterial({ color: 0x6e4a2d, roughness: 0.9 }));
  const cabooseGreenMat = track(new THREE.MeshStandardMaterial({ color: 0x2a4e36, roughness: 0.55, metalness: 0.15 }));

  // Night-responsive emissive materials
  const coachWindowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x2b3e52,
      emissive: 0xffd180,
      emissiveIntensity: 0.16,
      roughness: 0.14,
      metalness: 0.35,
    })
  );
  const headlightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfff8e6,
      emissive: 0xfff3c4,
      emissiveIntensity: 0.8,
      roughness: 0.15,
    })
  );
  const taillightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0xff2222,
      emissiveIntensity: 0.75,
      roughness: 0.2,
    })
  );
  const beamConeMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xfff0be,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );

  // Reusable small geometries
  const bogieFrameGeo = track(new THREE.BoxGeometry(1.16, 0.22, 0.95));
  const axleWheelGeo = track(new THREE.CylinderGeometry(0.19, 0.19, 1.04, 12));
  axleWheelGeo.rotateZ(Math.PI / 2);
  const bufferGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8));
  bufferGeo.rotateX(Math.PI / 2);
  const beamConeGeo = track(new THREE.ConeGeometry(0.85, 3.6, 12, 1, true));
  beamConeGeo.rotateX(Math.PI / 2);
  beamConeGeo.translate(0, 0, 1.8);

  const addBogies = (car: THREE.Group, zOffsets: number[]) => {
    for (const zOff of zOffsets) {
      const bogie = new THREE.Mesh(bogieFrameGeo, chassisMat);
      bogie.position.set(0, 0.24, zOff);
      car.add(bogie);
      for (const dz of [-0.28, 0.28]) {
        const axle = new THREE.Mesh(axleWheelGeo, wheelMetalMat);
        axle.position.set(0, 0.19, zOff + dz);
        car.add(axle);
      }
    }
  };

  const addBuffers = (car: THREE.Group, halfLen: number) => {
    for (const end of [-1, 1]) {
      for (const sx of [-0.34, 0.34]) {
        const buf = new THREE.Mesh(bufferGeo, chassisMat);
        buf.position.set(sx, 0.42, end * (halfLen + 0.07));
        car.add(buf);
      }
    }
  };

  // =========================================================================
  // 1. TRAIN A — PASSAGERS EXPRESS (ELECTRIC BB LOCO + 3 COACHES)
  // =========================================================================
  const buildPassengerLoco = (): THREE.Group => {
    const loco = new THREE.Group();
    const len = 3.7;
    addBogies(loco, [-1.05, 1.05]);
    addBuffers(loco, len * 0.5);

    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(1.24, 0.22, len)), chassisMat);
    frame.position.y = 0.42;
    loco.add(frame);

    const body = new THREE.Mesh(track(new THREE.BoxGeometry(1.26, 0.96, len - 0.12)), passGreenMat);
    body.position.y = 1.0;
    body.castShadow = true;
    body.receiveShadow = true;
    loco.add(body);

    const stripe = new THREE.Mesh(track(new THREE.BoxGeometry(1.29, 0.16, len - 0.1)), creamStripeMat);
    stripe.position.y = 0.96;
    loco.add(stripe);

    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(1.14, 0.18, len - 0.3)), roofSilverMat);
    roof.position.y = 1.56;
    roof.castShadow = true;
    loco.add(roof);

    const frontWin = new THREE.Mesh(track(new THREE.BoxGeometry(1.04, 0.36, 0.08)), coachWindowMat);
    frontWin.position.set(0, 1.2, len * 0.5 - 0.04);
    loco.add(frontWin);
    const rearWin = new THREE.Mesh(track(new THREE.BoxGeometry(1.04, 0.36, 0.08)), coachWindowMat);
    rearWin.position.set(0, 1.2, -(len * 0.5 - 0.04));
    loco.add(rearWin);

    for (const sz of [-0.65, 0, 0.65]) {
      const sidePort = new THREE.Mesh(track(new THREE.BoxGeometry(1.3, 0.28, 0.32)), coachWindowMat);
      sidePort.position.set(0, 1.22, sz);
      loco.add(sidePort);
    }

    for (const pz of [-0.95, 0.95]) {
      const pBase = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 0.06, 0.45)), chassisMat);
      pBase.position.set(0, 1.67, pz);
      loco.add(pBase);
      const armA = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.38, 0.05)), pantographMat);
      armA.position.set(0, 1.84, pz - 0.1);
      armA.rotation.x = 0.45;
      loco.add(armA);
      const armB = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.38, 0.05)), pantographMat);
      armB.position.set(0, 1.84, pz + 0.1);
      armB.rotation.x = -0.45;
      loco.add(armB);
      const collector = new THREE.Mesh(track(new THREE.BoxGeometry(0.76, 0.04, 0.1)), pantographMat);
      collector.position.set(0, 2.02, pz);
      loco.add(collector);
    }

    const lampGeo = track(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10));
    lampGeo.rotateX(Math.PI / 2);
    for (const lx of [-0.36, 0.36]) {
      const hl = new THREE.Mesh(lampGeo, headlightMat);
      hl.position.set(lx, 0.72, len * 0.5 - 0.02);
      loco.add(hl);
    }
    const cone = new THREE.Mesh(beamConeGeo, beamConeMat);
    cone.position.set(0, 0.68, len * 0.5);
    loco.add(cone);

    return loco;
  };

  const buildPassengerCoach = (isLastCar: boolean): THREE.Group => {
    const coach = new THREE.Group();
    const len = 3.55;
    addBogies(coach, [-1.08, 1.08]);
    addBuffers(coach, len * 0.5);

    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(1.22, 0.2, len)), chassisMat);
    frame.position.y = 0.42;
    coach.add(frame);

    const lowerBody = new THREE.Mesh(track(new THREE.BoxGeometry(1.24, 0.46, len - 0.08)), passBurgundyMat);
    lowerBody.position.y = 0.74;
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    coach.add(lowerBody);

    const upperBody = new THREE.Mesh(track(new THREE.BoxGeometry(1.24, 0.52, len - 0.08)), creamStripeMat);
    upperBody.position.y = 1.22;
    upperBody.castShadow = true;
    coach.add(upperBody);

    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(1.16, 0.16, len - 0.12)), roofSilverMat);
    roof.position.y = 1.54;
    roof.castShadow = true;
    coach.add(roof);

    const winGeo = track(new THREE.BoxGeometry(1.28, 0.34, 0.42));
    for (let w = -2; w <= 2; w++) {
      const win = new THREE.Mesh(winGeo, coachWindowMat);
      win.position.set(0, 1.2, w * 0.62);
      coach.add(win);
    }

    const bellow = new THREE.Mesh(track(new THREE.BoxGeometry(0.68, 0.85, len + 0.16)), chassisMat);
    bellow.position.y = 0.98;
    coach.add(bellow);

    if (isLastCar) {
      const tailGeo = track(new THREE.SphereGeometry(0.075, 8, 8));
      for (const lx of [-0.38, 0.38]) {
        const tl = new THREE.Mesh(tailGeo, taillightMat);
        tl.position.set(lx, 0.76, -(len * 0.5 + 0.02));
        coach.add(tl);
      }
    }

    return coach;
  };

  const passengerCars: THREE.Group[] = [
    buildPassengerLoco(),
    buildPassengerCoach(false),
    buildPassengerCoach(false),
    buildPassengerCoach(true),
  ];
  const passengerCarLengths = [3.7, 3.55, 3.55, 3.55];
  passengerCars.forEach((c) => group.add(c));

  // =========================================================================
  // 2. TRAIN B — MARCHANDISES ALPIN (HEAVY LOCO + TANKER + HOPPER + FLAT + CABOOSE)
  // =========================================================================
  const buildFreightLoco = (): THREE.Group => {
    const loco = new THREE.Group();
    const len = 3.8;
    addBogies(loco, [-1.15, 1.15]);
    addBuffers(loco, len * 0.5);

    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(1.28, 0.26, len)), chassisMat);
    frame.position.y = 0.44;
    loco.add(frame);

    const hood = new THREE.Mesh(track(new THREE.BoxGeometry(1.16, 0.84, len - 0.3)), freightRedMat);
    hood.position.y = 0.98;
    hood.castShadow = true;
    hood.receiveShadow = true;
    loco.add(hood);

    const band = new THREE.Mesh(track(new THREE.BoxGeometry(1.2, 0.15, len - 0.26)), creamStripeMat);
    band.position.y = 0.74;
    loco.add(band);

    const cab = new THREE.Mesh(track(new THREE.BoxGeometry(1.28, 0.52, 1.35)), freightRedMat);
    cab.position.set(0, 1.44, 0.45);
    cab.castShadow = true;
    loco.add(cab);

    const cabGlass = new THREE.Mesh(track(new THREE.BoxGeometry(1.31, 0.3, 1.18)), coachWindowMat);
    cabGlass.position.set(0, 1.48, 0.45);
    loco.add(cabGlass);

    const cabRoof = new THREE.Mesh(track(new THREE.BoxGeometry(1.32, 0.1, 1.42)), darkRoofMat);
    cabRoof.position.set(0, 1.74, 0.45);
    loco.add(cabRoof);

    const exhaust = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.13, 0.28, 10)), chassisMat);
    exhaust.position.set(0, 1.52, -0.75);
    loco.add(exhaust);

    const lampGeo = track(new THREE.CylinderGeometry(0.095, 0.095, 0.08, 10));
    lampGeo.rotateX(Math.PI / 2);
    for (const lx of [-0.34, 0.34]) {
      const hl = new THREE.Mesh(lampGeo, headlightMat);
      hl.position.set(lx, 0.76, len * 0.5 - 0.1);
      loco.add(hl);
    }
    const cone = new THREE.Mesh(beamConeGeo, beamConeMat);
    cone.position.set(0, 0.72, len * 0.5 - 0.05);
    loco.add(cone);

    return loco;
  };

  const buildTankerWagon = (): THREE.Group => {
    const car = new THREE.Group();
    const len = 3.2;
    addBogies(car, [-0.95, 0.95]);
    addBuffers(car, len * 0.5);

    const deck = new THREE.Mesh(track(new THREE.BoxGeometry(1.18, 0.18, len)), chassisMat);
    deck.position.y = 0.4;
    car.add(deck);

    const tankCyl = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.52, 0.52, len - 0.45, 16)),
      tankerSilverMat
    );
    tankCyl.rotation.x = Math.PI / 2;
    tankCyl.position.y = 0.98;
    tankCyl.castShadow = true;
    car.add(tankCyl);

    const dome = new THREE.Mesh(track(new THREE.CylinderGeometry(0.22, 0.24, 0.22, 12)), chassisMat);
    dome.position.set(0, 1.54, 0);
    car.add(dome);

    for (const sz of [-0.85, 0.85]) {
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.535, 0.04, 8, 16)), chassisMat);
      ring.position.set(0, 0.98, sz);
      car.add(ring);
    }
    return car;
  };

  const buildCoalHopperWagon = (): THREE.Group => {
    const car = new THREE.Group();
    const len = 3.1;
    addBogies(car, [-0.9, 0.9]);
    addBuffers(car, len * 0.5);

    const deck = new THREE.Mesh(track(new THREE.BoxGeometry(1.18, 0.18, len)), chassisMat);
    deck.position.y = 0.4;
    car.add(deck);

    const tub = new THREE.Mesh(track(new THREE.BoxGeometry(1.22, 0.72, len - 0.14)), hopperOxideMat);
    tub.position.y = 0.84;
    tub.castShadow = true;
    car.add(tub);

    const coalGeo = track(new THREE.SphereGeometry(0.62, 10, 8));
    coalGeo.scale(0.92, 0.45, 2.05);
    const coal = new THREE.Mesh(coalGeo, coalMat);
    coal.position.y = 1.18;
    car.add(coal);
    return car;
  };

  const buildTimberFlatcar = (): THREE.Group => {
    const car = new THREE.Group();
    const len = 3.2;
    addBogies(car, [-0.95, 0.95]);
    addBuffers(car, len * 0.5);

    const deck = new THREE.Mesh(track(new THREE.BoxGeometry(1.22, 0.18, len)), chassisMat);
    deck.position.y = 0.4;
    deck.castShadow = true;
    car.add(deck);

    const logGeo = track(new THREE.CylinderGeometry(0.16, 0.17, len - 0.35, 9));
    logGeo.rotateX(Math.PI / 2);
    const logOffsets: Array<[number, number]> = [
      [-0.34, 0.65],
      [0, 0.65],
      [0.34, 0.65],
      [-0.18, 0.92],
      [0.18, 0.92],
      [0, 1.18],
    ];
    for (const [lx, ly] of logOffsets) {
      const log = new THREE.Mesh(logGeo, logBarkMat);
      log.position.set(lx, ly, 0);
      log.castShadow = true;
      car.add(log);
    }

    const stakeGeo = track(new THREE.BoxGeometry(0.06, 0.82, 0.06));
    for (const sz of [-1.05, 0, 1.05]) {
      for (const sx of [-0.57, 0.57]) {
        const stake = new THREE.Mesh(stakeGeo, chassisMat);
        stake.position.set(sx, 0.86, sz);
        car.add(stake);
      }
    }
    return car;
  };

  const buildCaboose = (): THREE.Group => {
    const car = new THREE.Group();
    const len = 2.75;
    addBogies(car, [-0.8, 0.8]);
    addBuffers(car, len * 0.5);

    const deck = new THREE.Mesh(track(new THREE.BoxGeometry(1.2, 0.18, len)), chassisMat);
    deck.position.y = 0.4;
    car.add(deck);

    const body = new THREE.Mesh(track(new THREE.BoxGeometry(1.18, 0.88, len - 0.52)), cabooseGreenMat);
    body.position.y = 0.92;
    body.castShadow = true;
    car.add(body);

    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(1.24, 0.12, len - 0.25)), darkRoofMat);
    roof.position.y = 1.4;
    car.add(roof);

    const cupola = new THREE.Mesh(track(new THREE.BoxGeometry(0.84, 0.38, 0.88)), cabooseGreenMat);
    cupola.position.y = 1.62;
    cupola.castShadow = true;
    car.add(cupola);
    const cupWin = new THREE.Mesh(track(new THREE.BoxGeometry(0.87, 0.18, 0.91)), coachWindowMat);
    cupWin.position.y = 1.64;
    car.add(cupWin);

    const sWin = new THREE.Mesh(track(new THREE.BoxGeometry(1.22, 0.28, 0.72)), coachWindowMat);
    sWin.position.y = 1.02;
    car.add(sWin);

    const tlGeo = track(new THREE.SphereGeometry(0.075, 8, 8));
    for (const lx of [-0.36, 0.36]) {
      const tl = new THREE.Mesh(tlGeo, taillightMat);
      tl.position.set(lx, 0.78, -(len * 0.5 - 0.12));
      car.add(tl);
    }
    return car;
  };

  const freightCars: THREE.Group[] = [
    buildFreightLoco(),
    buildTankerWagon(),
    buildCoalHopperWagon(),
    buildTimberFlatcar(),
    buildCaboose(),
  ];
  const freightCarLengths = [3.8, 3.2, 3.1, 3.2, 2.75];
  freightCars.forEach((c) => group.add(c));

  // =========================================================================
  // 3. INTERLOCKING CONTROLLER & ZERO-JERK PER-BOGIE TRAIL PLACEMENT
  // =========================================================================
  const controller = new InterlockingController(
    {
      trunk_main: curves.trunk_main.getLength(),
      trunk_siding: curves.trunk_siding.getLength(),
      loop_valley: curves.loop_valley.getLength(),
      loop_alpine: curves.loop_alpine.getLength(),
    },
    passengerCarLengths,
    freightCarLengths
  );

  const _up = new THREE.Vector3(0, 1, 0);
  const _pos = new THREE.Vector3();
  const _frontPos = new THREE.Vector3();
  const _rearPos = new THREE.Vector3();
  const _tan = new THREE.Vector3();
  const _xAxis = new THREE.Vector3();
  const _yAxis = new THREE.Vector3();
  const _rotMat = new THREE.Matrix4();

  const passengerLeadPos = new THREE.Vector3();
  const passengerLeadTan = new THREE.Vector3(1, 0, 0);
  const freightLeadPos = new THREE.Vector3();
  const freightLeadTan = new THREE.Vector3(1, 0, 0);

  const allCarPositions: Array<{ x: number; z: number }> = [
    ...passengerCars.map(() => ({ x: 0, z: 0 })),
    ...freightCars.map(() => ({ x: 0, z: 0 })),
  ];

  const sampleTrailPoint = (train: TrainSimState, dist: number, target: THREE.Vector3) => {
    const loc = resolveTrailPosition(train.trail, dist);
    curves[loc.segmentId].getPointAt(loc.u, target);
  };

  const placeTrainAlongTrail = (
    train: TrainSimState,
    cars: THREE.Group[],
    outLeadPos: THREE.Vector3,
    outLeadTan: THREE.Vector3,
    posOffset: number
  ) => {
    let cursor = train.odometer;
    for (let i = 0; i < cars.length; i++) {
      if (i > 0) {
        cursor -= train.carLengths[i - 1] * 0.5 + train.couplingGap + train.carLengths[i] * 0.5;
      }
      const halfBogieSpan = train.carLengths[i] * 0.3;
      sampleTrailPoint(train, cursor + halfBogieSpan, _frontPos);
      sampleTrailPoint(train, cursor - halfBogieSpan, _rearPos);

      _pos.addVectors(_frontPos, _rearPos).multiplyScalar(0.5);
      _tan.subVectors(_frontPos, _rearPos).normalize();

      // Strictly right-handed orthonormal basis (det = +1)
      _xAxis.crossVectors(_up, _tan).normalize();
      _yAxis.crossVectors(_tan, _xAxis).normalize();
      _rotMat.makeBasis(_xAxis, _yAxis, _tan);

      cars[i].position.copy(_pos);
      cars[i].quaternion.setFromRotationMatrix(_rotMat);

      if (i === 0) {
        outLeadPos.copy(_pos);
        outLeadTan.copy(_tan);
      }
      // Only ground-level valley cars (y < 1.5) can trigger the level crossing gates
      if (_pos.y < 1.5) {
        allCarPositions[posOffset + i].x = _pos.x;
        allCarPositions[posOffset + i].z = _pos.z;
      } else {
        allCarPositions[posOffset + i].x = 9999;
        allCarPositions[posOffset + i].z = 9999;
      }
    }
  };

  // Pose initial frame immediately
  const initSnap = controller.getSnapshot('auto');
  placeTrainAlongTrail(initSnap.trains.passenger, passengerCars, passengerLeadPos, passengerLeadTan, 0);
  placeTrainAlongTrail(
    initSnap.trains.freight,
    freightCars,
    freightLeadPos,
    freightLeadTan,
    passengerCars.length
  );

  return {
    group,
    update: (dt: number, junctionMode: JunctionMode, desiredStationTrack: SwitchRoute) => {
      const snap = controller.step(dt, junctionMode, desiredStationTrack);

      placeTrainAlongTrail(snap.trains.passenger, passengerCars, passengerLeadPos, passengerLeadTan, 0);
      placeTrainAlongTrail(
        snap.trains.freight,
        freightCars,
        freightLeadPos,
        freightLeadTan,
        passengerCars.length
      );

      return {
        allCarPositions,
        passengerLead: { position: passengerLeadPos, tangent: passengerLeadTan },
        freightLead: { position: freightLeadPos, tangent: freightLeadTan },
        interlocking: snap,
      };
    },
    setNightFactor: (nightFactor: number) => {
      coachWindowMat.emissiveIntensity = 0.14 + nightFactor * 2.1;
      headlightMat.emissiveIntensity = 0.65 + nightFactor * 3.2;
      taillightMat.emissiveIntensity = 0.65 + nightFactor * 2.2;
      beamConeMat.opacity = nightFactor * 0.19;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
