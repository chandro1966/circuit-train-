export type SimulationSpeed = 0 | 0.5 | 1 | 2;

export type LightingMode = 'day' | 'dusk' | 'night';

export type CameraPreset = 'overview' | 'follow' | 'stationViaduct' | 'crossing' | 'farm';

export type FollowTarget = 'passenger' | 'freight';

export type SwitchRoute = 'main' | 'siding';

export type LoopId = 'valley' | 'alpine';

export type SegmentId = 'trunk_main' | 'trunk_siding' | 'loop_valley' | 'loop_alpine';

export type JunctionMode = 'auto' | 'manual_valley' | 'manual_alpine';

export type CrossingMode = 'auto' | 'manualClosed';

export type SignalAspect = 'green' | 'amber' | 'red';

export type SafetyStatusTone = 'clear' | 'exchange' | 'waiting';

export interface SimSettings {
  speed: SimulationSpeed;
  lighting: LightingMode;
  cameraPreset: CameraPreset;
  followTarget: FollowTarget;
  junctionMode: JunctionMode;
  switchRoute: SwitchRoute;
  crossingMode: CrossingMode;
}

export interface SimLiveStatus {
  crossingClosed: boolean;
  crossingTriggeredByTrain: boolean;
  passengerOnSiding: boolean;
  passengerLoop: LoopId;
  freightLoop: LoopId;
  passengerWaiting: boolean;
  freightWaiting: boolean;
  eastSwitchTarget: LoopId;
  westSwitchTarget: LoopId;
  junctionStateLabel: string;
  safetyStatusLabel: string;
  safetyStatusTone: SafetyStatusTone;
  signalValleyAspect: SignalAspect;
  signalAlpineAspect: SignalAspect;
  signalExitAspect: SignalAspect;
}
