import type {
  JunctionMode,
  LoopId,
  SafetyStatusTone,
  SegmentId,
  SignalAspect,
  SwitchRoute,
} from './types';

export type TrainId = 'passenger' | 'freight';

export interface SegmentLengths {
  trunk_main: number;
  trunk_siding: number;
  loop_valley: number;
  loop_alpine: number;
}

export interface TrailSegment {
  segmentId: SegmentId;
  startDist: number;
  endDist: number;
  length: number;
}

export interface TrainSimState {
  id: TrainId;
  label: string;
  carLengths: readonly number[];
  couplingGap: number;
  totalLength: number;
  cruiseSpeed: number;
  speed: number;
  /** Monotonically increasing cumulative odometer along `trail` */
  odometer: number;
  /** Ordered trail of contiguous segments traversed by this train (O(1) size, pruned behind tail) */
  trail: TrailSegment[];
  /** Current segment occupied by the lead locomotive */
  currentSegment: SegmentId;
  /** Most recent or active loop ('valley' | 'alpine') */
  activeLoop: LoopId;
  /** Committed exit loop when inside the shared trunk */
  plannedExitLoop: LoopId;
  /** True when braking/stopped at the red junction signal before J_WEST */
  waitingAtJunction: boolean;
  /** True when regulating speed for safety headway behind the other train */
  headwayBraking: boolean;
  /** True while traversing the shared trunk to switch onto the opposite circuit */
  exchangingCircuit: boolean;
  /** Stats for verification & telemetry */
  visitedLoops: { valley: boolean; alpine: boolean };
  completedExchanges: number;
}

export interface InterlockingSnapshot {
  blockOwner: TrainId | null;
  westSwitchTarget: LoopId;
  eastSwitchTarget: LoopId;
  stationTrack: SwitchRoute;
  signalValleyAspect: SignalAspect;
  signalAlpineAspect: SignalAspect;
  signalExitAspect: SignalAspect;
  junctionStateLabel: string;
  safetyStatusLabel: string;
  safetyStatusTone: SafetyStatusTone;
  trains: Record<TrainId, TrainSimState>;
}

/** Interlocking safety constants (world units) */
export const STOP_BEFORE_JWEST = 6.8;
export const BRAKE_APPROACH_ZONE = 20.0;
export const CLEARANCE_AFTER_JEAST = 4.8;
export const MIN_HEADWAY_GAP = 10.5;
export const HEADWAY_BRAKE_ZONE = 18.0;
export const STOP_BEFORE_JEAST = 4.2;
const COMFORT_ACCEL = 3.2;
const COMFORT_DECEL = 2.6;
const MAX_SUBSTEP = 0.02;

export function isTrunkSegment(seg: SegmentId): boolean {
  return seg === 'trunk_main' || seg === 'trunk_siding';
}

export function loopToSegment(loop: LoopId): SegmentId {
  return loop === 'valley' ? 'loop_valley' : 'loop_alpine';
}

export function segmentToLoop(seg: SegmentId): LoopId | null {
  if (seg === 'loop_valley') return 'valley';
  if (seg === 'loop_alpine') return 'alpine';
  return null;
}

export function computeTrainTotalLength(carLengths: readonly number[], couplingGap: number): number {
  if (carLengths.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < carLengths.length; i++) {
    total += carLengths[i];
    if (i > 0) total += couplingGap;
  }
  return total;
}

/**
 * Resolves any cumulative odometer distance `d` along a train's continuous trail
 * into `{ segmentId, u }` with `u ∈ [0, 1]`. Zero snapping across turnout boundaries.
 */
export function resolveTrailPosition(
  trail: readonly TrailSegment[],
  d: number
): { segmentId: SegmentId; u: number } {
  for (let i = trail.length - 1; i >= 0; i--) {
    const seg = trail[i];
    if (d >= seg.startDist - 1e-6 && d <= seg.endDist + 1e-6) {
      const u = Math.max(0, Math.min(1, (d - seg.startDist) / seg.length));
      return { segmentId: seg.segmentId, u };
    }
  }
  if (d < trail[0].startDist) {
    return { segmentId: trail[0].segmentId, u: 0 };
  }
  const last = trail[trail.length - 1];
  return { segmentId: last.segmentId, u: 1 };
}

/**
 * Pure, deterministic railway interlocking & anti-collision controller.
 * Manages:
 * - Single-occupancy Critical Shared Block (J_WEST -> Gare Centrale -> J_EAST + exit clearance)
 * - Automatic or Manual circuit exchange at J_EAST (Boucle A <-> Boucle B)
 * - Smooth progressive deceleration and complete stop before red signals
 * - Same-loop safety headway (zero overlap at any simulation speed)
 */
export class InterlockingController {
  public readonly lengths: SegmentLengths;
  public blockOwner: TrainId | null = null;
  public westSwitchTarget: LoopId = 'valley';
  public eastSwitchTarget: LoopId = 'alpine';
  public stationTrack: SwitchRoute = 'main';
  public signalValleyAspect: SignalAspect = 'green';
  public signalAlpineAspect: SignalAspect = 'amber';
  public signalExitAspect: SignalAspect = 'green';
  public trains: Record<TrainId, TrainSimState>;

  constructor(
    lengths: SegmentLengths,
    passengerCarLengths: readonly number[] = [3.7, 3.55, 3.55, 3.55],
    freightCarLengths: readonly number[] = [3.8, 3.2, 3.1, 3.2, 2.75]
  ) {
    this.lengths = { ...lengths };

    const passTotal = computeTrainTotalLength(passengerCarLengths, 0.28);
    const freightTotal = computeTrainTotalLength(freightCarLengths, 0.3);

    // Initial Pose:
    // - Train A (Passagers) starts emerging from the Main Station onto the trunk approaching J_EAST
    //   so it is visibly at the station and claims the shared block cleanly on frame 0!
    // - Train B (Marchandises) starts prominently crossing the Grand Stone Arch Viaduct on loop_alpine!
    const passInitTrail: TrailSegment[] = [
      {
        segmentId: 'loop_valley',
        startDist: -lengths.loop_valley,
        endDist: 0,
        length: lengths.loop_valley,
      },
      {
        segmentId: 'trunk_main',
        startDist: 0,
        endDist: lengths.trunk_main,
        length: lengths.trunk_main,
      },
    ];
    // Put passenger locomotive at ~62% along the shared trunk (nicely in front of the station)
    const passOdometer = Math.min(lengths.trunk_main - 6.0, Math.max(14.0, lengths.trunk_main * 0.62));

    // Freight train starts near the Curved Stone Arch Viaduct (~54% along loop_alpine)
    const freightInitTrail: TrailSegment[] = [
      {
        segmentId: 'trunk_main',
        startDist: -lengths.trunk_main,
        endDist: 0,
        length: lengths.trunk_main,
      },
      {
        segmentId: 'loop_alpine',
        startDist: 0,
        endDist: lengths.loop_alpine,
        length: lengths.loop_alpine,
      },
    ];
    const freightOdometer = lengths.loop_alpine * 0.56;

    this.trains = {
      passenger: {
        id: 'passenger',
        label: 'Train A',
        carLengths: passengerCarLengths,
        couplingGap: 0.28,
        totalLength: passTotal,
        cruiseSpeed: 7.4,
        speed: 6.5,
        odometer: passOdometer,
        trail: passInitTrail,
        currentSegment: 'trunk_main',
        activeLoop: 'valley',
        plannedExitLoop: 'valley',
        waitingAtJunction: false,
        headwayBraking: false,
        exchangingCircuit: false,
        visitedLoops: { valley: true, alpine: false },
        completedExchanges: 0,
      },
      freight: {
        id: 'freight',
        label: 'Train B',
        carLengths: freightCarLengths,
        couplingGap: 0.3,
        totalLength: freightTotal,
        cruiseSpeed: 6.2,
        speed: 6.0,
        odometer: freightOdometer,
        trail: freightInitTrail,
        currentSegment: 'loop_alpine',
        activeLoop: 'alpine',
        plannedExitLoop: 'valley',
        waitingAtJunction: false,
        headwayBraking: false,
        exchangingCircuit: false,
        visitedLoops: { valley: false, alpine: true },
        completedExchanges: 0,
      },
    };

    // Train A starts on the shared trunk so it owns the critical block initially
    this.blockOwner = 'passenger';
    this.westSwitchTarget = 'valley';
    this.eastSwitchTarget = 'valley';
  }

  private getCurrentSegmentObj(train: TrainSimState): TrailSegment {
    return train.trail[train.trail.length - 1];
  }

  private getDistanceOnCurrentSeg(train: TrainSimState): number {
    const seg = this.getCurrentSegmentObj(train);
    return train.odometer - seg.startDist;
  }

  private getRemainingOnCurrentSeg(train: TrainSimState): number {
    const seg = this.getCurrentSegmentObj(train);
    return Math.max(0, seg.endDist - train.odometer);
  }

  private isTailClearOfSharedTrunk(train: TrainSimState): boolean {
    if (isTrunkSegment(train.currentSegment)) return false;
    const distPastJEast = this.getDistanceOnCurrentSeg(train);
    return distPastJEast >= train.totalLength + CLEARANCE_AFTER_JEAST;
  }

  private isTrainPhysicallyInSharedTrunk(train: TrainSimState): boolean {
    if (isTrunkSegment(train.currentSegment)) return true;
    return !this.isTailClearOfSharedTrunk(train);
  }

  private chooseExitLoop(train: TrainSimState, junctionMode: JunctionMode): LoopId {
    if (junctionMode === 'manual_valley') return 'valley';
    if (junctionMode === 'manual_alpine') return 'alpine';
    // Auto mode: systematically exchange circuits (Boucle A <-> Boucle B)
    return train.activeLoop === 'valley' ? 'alpine' : 'valley';
  }

  /**
   * Advances the interlocking & train kinematics using fixed substeps so trains never overshoot
   * stop lines or collide at high simulation speeds (2x).
   */
  public step(dt: number, junctionMode: JunctionMode, desiredStationTrack: SwitchRoute): InterlockingSnapshot {
    if (dt <= 0) {
      return this.getSnapshot(junctionMode);
    }

    let remaining = dt;
    while (remaining > 1e-6) {
      const subDt = Math.min(MAX_SUBSTEP, remaining);
      this.stepSub(subDt, junctionMode, desiredStationTrack);
      remaining -= subDt;
    }

    return this.getSnapshot(junctionMode);
  }

  private stepSub(dt: number, junctionMode: JunctionMode, desiredStationTrack: SwitchRoute): void {
    const trainList: TrainSimState[] = [this.trains.passenger, this.trains.freight];

    // 1. Release shared block once owner's tail car has safely cleared J_EAST + margin
    if (this.blockOwner !== null) {
      const owner = this.trains[this.blockOwner];
      const approachingFromLoop =
        !isTrunkSegment(owner.currentSegment) &&
        this.getRemainingOnCurrentSeg(owner) <= STOP_BEFORE_JWEST + BRAKE_APPROACH_ZONE + 4.0;
      if (!this.isTrainPhysicallyInSharedTrunk(owner) && !approachingFromLoop) {
        this.blockOwner = null;
      }
    }

    // 2. Arbitrate shared block ownership when free and one or both trains approach J_WEST
    if (this.blockOwner === null) {
      const requesters: Array<{ train: TrainSimState; rem: number }> = [];
      for (const t of trainList) {
        if (!isTrunkSegment(t.currentSegment)) {
          const rem = this.getRemainingOnCurrentSeg(t);
          if (rem <= STOP_BEFORE_JWEST + BRAKE_APPROACH_ZONE + 2.0) {
            requesters.push({ train: t, rem });
          }
        }
      }
      if (requesters.length > 0) {
        // Priority: closest train to J_WEST (deterministic tie-break: waiting train, then passenger)
        requesters.sort((a, b) => {
          if (a.train.waitingAtJunction !== b.train.waitingAtJunction) {
            return a.train.waitingAtJunction ? -1 : 1;
          }
          if (Math.abs(a.rem - b.rem) > 0.5) return a.rem - b.rem;
          return a.train.id === 'passenger' ? -1 : 1;
        });
        const winner = requesters[0].train;
        this.blockOwner = winner.id;
        this.westSwitchTarget = segmentToLoop(winner.currentSegment) ?? winner.activeLoop;
        this.stationTrack = desiredStationTrack;
        winner.plannedExitLoop = this.chooseExitLoop(winner, junctionMode);
        this.eastSwitchTarget = winner.plannedExitLoop;
      }
    } else {
      // Allow live manual override of J_EAST while the owning train has not yet reached J_EAST's lock point
      const owner = this.trains[this.blockOwner];
      const lockedNearExit =
        isTrunkSegment(owner.currentSegment) && this.getRemainingOnCurrentSeg(owner) < 5.0;
      const alreadyExited = !isTrunkSegment(owner.currentSegment) && !this.isTailClearOfSharedTrunk(owner);
      if (!lockedNearExit && !alreadyExited) {
        owner.plannedExitLoop = this.chooseExitLoop(owner, junctionMode);
        this.eastSwitchTarget = owner.plannedExitLoop;
      }
    }

    // Update station track when no train is inside the trunk
    const anyInTrunk = trainList.some((t) => isTrunkSegment(t.currentSegment));
    if (!anyInTrunk) {
      this.stationTrack = desiredStationTrack;
    }

    // 3. Compute safe target speeds for both trains (Junction Stop + Same-Loop Headway + Exit Guard)
    for (const train of trainList) {
      const other = train.id === 'passenger' ? this.trains.freight : this.trains.passenger;
      let targetSpeed =
        train.currentSegment === 'trunk_siding' ? train.cruiseSpeed * 0.78 : train.cruiseSpeed;

      train.waitingAtJunction = false;
      train.headwayBraking = false;

      // 3a. Shared block protection approaching J_WEST
      if (!isTrunkSegment(train.currentSegment)) {
        const remToJWest = this.getRemainingOnCurrentSeg(train);
        const isAllowedIntoTrunk = this.blockOwner === train.id;

        if (!isAllowedIntoTrunk && remToJWest <= STOP_BEFORE_JWEST + BRAKE_APPROACH_ZONE) {
          const distToStop = remToJWest - STOP_BEFORE_JWEST;
          if (distToStop <= 0.08) {
            targetSpeed = 0;
            train.waitingAtJunction = true;
          } else {
            const safeApproachSpeed = Math.sqrt(2 * COMFORT_DECEL * distToStop);
            if (safeApproachSpeed < targetSpeed) {
              targetSpeed = safeApproachSpeed;
              train.waitingAtJunction = distToStop < 7.5;
            }
          }
        }
      }

      // 3b. Exit clearance check inside trunk before entering target loop at J_EAST
      if (isTrunkSegment(train.currentSegment)) {
        const exitSegId = loopToSegment(train.plannedExitLoop);
        if (other.currentSegment === exitSegId) {
          const otherTailOnLoop = this.getDistanceOnCurrentSeg(other) - other.totalLength;
          const remToJEast = this.getRemainingOnCurrentSeg(train);
          const totalGapToOtherTail = remToJEast + otherTailOnLoop;
          if (totalGapToOtherTail < MIN_HEADWAY_GAP + HEADWAY_BRAKE_ZONE) {
            const distToStop = Math.min(
              remToJEast - STOP_BEFORE_JEAST,
              totalGapToOtherTail - MIN_HEADWAY_GAP
            );
            const safeSpeed = distToStop <= 0.08 ? 0 : Math.sqrt(2 * COMFORT_DECEL * distToStop);
            if (safeSpeed < targetSpeed) {
              targetSpeed = safeSpeed;
              train.headwayBraking = true;
            }
          }
        }
      }

      // 3c. Same-segment safety headway (when both trains occupy the same loop!)
      if (train.currentSegment === other.currentSegment) {
        const myDist = this.getDistanceOnCurrentSeg(train);
        const otherDist = this.getDistanceOnCurrentSeg(other);
        if (otherDist > myDist) {
          const noseToTailGap = otherDist - other.totalLength - myDist;
          if (noseToTailGap < MIN_HEADWAY_GAP + HEADWAY_BRAKE_ZONE) {
            const excess = noseToTailGap - MIN_HEADWAY_GAP;
            const safeSpeed = excess <= 0.08 ? 0 : Math.sqrt(2 * COMFORT_DECEL * excess);
            if (safeSpeed < targetSpeed) {
              targetSpeed = safeSpeed;
              train.headwayBraking = true;
            }
          }
        }
      }

      // 3d. Smooth acceleration / braking inertia
      if (targetSpeed < train.speed) {
        train.speed = Math.max(targetSpeed, train.speed - COMFORT_DECEL * dt);
      } else {
        train.speed = Math.min(targetSpeed, train.speed + COMFORT_ACCEL * dt);
      }
      if (targetSpeed === 0 && train.speed < 0.04) {
        train.speed = 0;
      }

      // Advance odometer smoothly
      train.odometer += train.speed * dt;

      // 4. Seamless transition onto next connected segment at J_WEST or J_EAST
      const curSeg = this.getCurrentSegmentObj(train);
      if (train.odometer >= curSeg.endDist) {
        let nextSegId: SegmentId;
        if (isTrunkSegment(curSeg.segmentId)) {
          // Exiting J_EAST onto planned loop
          const nextLoop = train.plannedExitLoop;
          if (nextLoop !== train.activeLoop) {
            train.completedExchanges += 1;
          }
          train.activeLoop = nextLoop;
          train.visitedLoops[nextLoop] = true;
          train.exchangingCircuit = false;
          nextSegId = loopToSegment(nextLoop);
          this.eastSwitchTarget = nextLoop;
        } else {
          // Entering J_WEST onto shared trunk
          const arrivedLoop = segmentToLoop(curSeg.segmentId) ?? train.activeLoop;
          train.activeLoop = arrivedLoop;
          train.plannedExitLoop = this.chooseExitLoop(train, junctionMode);
          train.exchangingCircuit = train.plannedExitLoop !== arrivedLoop;
          this.westSwitchTarget = arrivedLoop;
          this.eastSwitchTarget = train.plannedExitLoop;
          nextSegId = this.stationTrack === 'siding' ? 'trunk_siding' : 'trunk_main';
        }

        const nextLen = this.lengths[nextSegId];
        train.trail.push({
          segmentId: nextSegId,
          startDist: curSeg.endDist,
          endDist: curSeg.endDist + nextLen,
          length: nextLen,
        });
        train.currentSegment = nextSegId;
      }

      // 5. Prune old trail segments once rear bogie of tail car has fully cleared them
      const tailCutoff = train.odometer - train.totalLength - 3.0;
      while (train.trail.length > 2 && train.trail[0].endDist < tailCutoff) {
        train.trail.shift();
      }
    }

    // 6. Update 3-aspect railway block signals
    const passInTrunk = isTrunkSegment(this.trains.passenger.currentSegment);
    const freightInTrunk = isTrunkSegment(this.trains.freight.currentSegment);
    const trunkOccupied = passInTrunk || freightInTrunk;

    if (this.blockOwner === null) {
      this.signalValleyAspect = this.westSwitchTarget === 'valley' ? 'green' : 'amber';
      this.signalAlpineAspect = this.westSwitchTarget === 'alpine' ? 'green' : 'amber';
    } else if (trunkOccupied) {
      // Trunk actively occupied -> both entry signals RED!
      this.signalValleyAspect = 'red';
      this.signalAlpineAspect = 'red';
    } else {
      // Owner is on approach to J_WEST -> owner's signal GREEN, conflicting approach RED!
      const ownerLoop = segmentToLoop(this.trains[this.blockOwner].currentSegment);
      this.signalValleyAspect = ownerLoop === 'valley' ? 'green' : 'red';
      this.signalAlpineAspect = ownerLoop === 'alpine' ? 'green' : 'red';
    }

    const exitBlocked =
      (passInTrunk && this.trains.passenger.headwayBraking) ||
      (freightInTrunk && this.trains.freight.headwayBraking);
    this.signalExitAspect = exitBlocked
      ? 'red'
      : this.eastSwitchTarget === 'alpine'
      ? 'amber'
      : 'green';
  }

  public getSnapshot(junctionMode: JunctionMode): InterlockingSnapshot {
    const p = this.trains.passenger;
    const f = this.trains.freight;

    const modeTag = junctionMode === 'auto' ? 'Auto' : 'Manuel';
    const loopName = this.eastSwitchTarget === 'valley' ? 'Boucle A' : 'Boucle B';
    const junctionStateLabel = `${loopName} (${modeTag})`;

    let safetyStatusLabel = 'Voie libre';
    let safetyStatusTone: SafetyStatusTone = 'clear';

    if (p.waitingAtJunction) {
      safetyStatusLabel = "Train A en attente à l'aiguillage";
      safetyStatusTone = 'waiting';
    } else if (f.waitingAtJunction) {
      safetyStatusLabel = "Train B en attente à l'aiguillage";
      safetyStatusTone = 'waiting';
    } else if (p.headwayBraking || f.headwayBraking) {
      const brakingLabel = p.headwayBraking ? 'Train A' : 'Train B';
      safetyStatusLabel = `${brakingLabel} — espacement de sécurité`;
      safetyStatusTone = 'waiting';
    } else if (
      (isTrunkSegment(p.currentSegment) && p.exchangingCircuit) ||
      (isTrunkSegment(f.currentSegment) && f.exchangingCircuit)
    ) {
      safetyStatusLabel = 'Échange de circuit en cours';
      safetyStatusTone = 'exchange';
    } else if (isTrunkSegment(p.currentSegment) || isTrunkSegment(f.currentSegment)) {
      const who = isTrunkSegment(p.currentSegment) ? 'Train A' : 'Train B';
      safetyStatusLabel = `${who} sur tronçon commun`;
      safetyStatusTone = 'exchange';
    }

    return {
      blockOwner: this.blockOwner,
      westSwitchTarget: this.westSwitchTarget,
      eastSwitchTarget: this.eastSwitchTarget,
      stationTrack: this.stationTrack,
      signalValleyAspect: this.signalValleyAspect,
      signalAlpineAspect: this.signalAlpineAspect,
      signalExitAspect: this.signalExitAspect,
      junctionStateLabel,
      safetyStatusLabel,
      safetyStatusTone,
      trains: {
        passenger: p,
        freight: f,
      },
    };
  }
}
