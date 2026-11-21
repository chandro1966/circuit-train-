import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  LEVEL_CROSSING_POS,
  evaluateCrossingState,
  stepBarrierAngle,
} from '../sim/railwayMath';
import type { CameraPreset, SimLiveStatus, SimSettings } from '../sim/types';
import { buildFarmAndMeadow } from './farmAndMeadow';
import { createLightingRig } from './lighting';
import { buildTerrainAndNature } from './terrain';
import { createProceduralTextures } from './textures';
import { buildTracksAndStructures } from './tracksAndStructures';
import { buildTrainsSystem } from './trains';
import { buildVillageAndStation } from './villageAndStation';

interface CameraSpec {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

const CAMERA_PRESETS: Record<Exclude<CameraPreset, 'follow'>, CameraSpec> = {
  overview: {
    pos: new THREE.Vector3(24.0, 49.0, 74.0),
    target: new THREE.Vector3(-1.0, 1.5, 1.5),
  },
  stationViaduct: {
    pos: new THREE.Vector3(2.0, 14.5, 34.5),
    target: new THREE.Vector3(-1.0, 1.8, 6.5),
  },
  crossing: {
    pos: new THREE.Vector3(34.5, 7.6, 11.2),
    target: new THREE.Vector3(23.5, 1.0, 2.5),
  },
  farm: {
    pos: new THREE.Vector3(-54.0, 18.5, 36.5),
    target: new THREE.Vector3(-34.8, 1.2, 13.8),
  },
};

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class RailwayEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;

  private settings: SimSettings;
  private onLiveStatus: (status: SimLiveStatus) => void;
  private onContextError?: (msg: string) => void;

  private textures: ReturnType<typeof createProceduralTextures>;
  private terrain: ReturnType<typeof buildTerrainAndNature>;
  private tracks: ReturnType<typeof buildTracksAndStructures>;
  private village: ReturnType<typeof buildVillageAndStation>;
  private farm: ReturnType<typeof buildFarmAndMeadow>;
  private trains: ReturnType<typeof buildTrainsSystem>;
  private lighting: ReturnType<typeof createLightingRig>;

  private frameId = 0;
  private disposed = false;
  private lastTimestamp = 0;
  private elapsed = 0;
  private barrierAngle = 0;
  private lastStatusEmit = 0;
  private lastStatusKey = '';

  // Camera transition state
  private cameraTransitionActive = false;
  private activePreset: CameraPreset;
  private desiredCamPos = new THREE.Vector3();
  private desiredCamTarget = new THREE.Vector3();
  private _followOffset = new THREE.Vector3();
  private _followRight = new THREE.Vector3();
  private _up = new THREE.Vector3(0, 1, 0);

  private resizeObserver: ResizeObserver;
  private handleContextLost: (e: Event) => void;
  private handleContextRestored: () => void;

  constructor(
    container: HTMLElement,
    initialSettings: SimSettings,
    onLiveStatus: (status: SimLiveStatus) => void,
    onContextError?: (msg: string) => void
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.activePreset = initialSettings.cameraPreset;
    this.onLiveStatus = onLiveStatus;
    this.onContextError = onContextError;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 300);
    const height = Math.max(container.clientHeight, 200);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('data-testid', 'railway-webgl-canvas');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.25, 340);
    this.camera.position.copy(CAMERA_PRESETS.overview.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(CAMERA_PRESETS.overview.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 145;
    this.controls.maxPolarAngle = Math.PI * 0.465;
    this.controls.minPolarAngle = 0.14;
    this.controls.panSpeed = 0.85;
    this.controls.update();

    this.controls.addEventListener('start', () => {
      if (this.activePreset !== 'follow') {
        this.cameraTransitionActive = false;
      }
    });

    // Assemble procedural 3D diorama modules
    this.textures = createProceduralTextures(this.renderer);
    this.lighting = createLightingRig(this.scene, this.renderer, this.isSoftwareGl);
    this.terrain = buildTerrainAndNature(this.textures);
    this.tracks = buildTracksAndStructures(this.textures);
    this.village = buildVillageAndStation(this.textures);
    this.farm = buildFarmAndMeadow(this.textures);
    this.trains = buildTrainsSystem(this.tracks.curves);

    this.scene.add(this.terrain.group);
    this.scene.add(this.tracks.group);
    this.scene.add(this.village.group);
    this.scene.add(this.farm.group);
    this.scene.add(this.trains.group);

    // Pre-warm shaders on hardware GPUs (skip on software WebGL per threejs skill)
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Handle WebGL context loss/restoration
    this.handleContextLost = (event: Event) => {
      event.preventDefault();
      this.stopLoop();
      this.onContextError?.('Le contexte WebGL a été interrompu. Reprise en cours…');
    };
    this.handleContextRestored = () => {
      this.onContextError?.('');
      this.startLoop();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    // Responsive container observer
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.startLoop();
  }

  public updateSettings(next: SimSettings): void {
    const presetChanged = next.cameraPreset !== this.settings.cameraPreset;
    const followTargetChanged = next.followTarget !== this.settings.followTarget;
    this.settings = { ...next };

    if (presetChanged || (next.cameraPreset === 'follow' && followTargetChanged)) {
      this.activePreset = next.cameraPreset;
      if (next.cameraPreset !== 'follow') {
        const spec = CAMERA_PRESETS[next.cameraPreset];
        this.desiredCamPos.copy(spec.pos);
        this.desiredCamTarget.copy(spec.target);
        this.cameraTransitionActive = true;
      } else {
        this.cameraTransitionActive = true;
      }
    }
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 240);
    const height = Math.max(this.container.clientHeight, 180);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private startLoop(): void {
    if (this.disposed) return;
    this.lastTimestamp = performance.now();
    this.tick();
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  }

  /**
   * Software-WebGL GPU-sync pacing helper (prevents main-thread starvation on SwiftShader).
   */
  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = Math.min(0.1, Math.max(0.001, (now - this.lastTimestamp) / 1000));
    this.lastTimestamp = now;

    const simDt = rawDt * this.settings.speed;
    this.elapsed += rawDt;

    // 1. Update lighting ambiance & propagate night emissive glow across all modules
    const nightFactor = this.lighting.update(this.settings.lighting, rawDt);
    this.tracks.setNightFactor(nightFactor);
    this.village.setNightFactor(nightFactor);
    this.farm.setNightFactor(nightFactor);
    this.trains.setNightFactor(nightFactor);

    // 2. Advance interconnected trains, interlocking block logic & animated junction turnouts/signals
    const trainState = this.trains.update(
      simDt,
      this.settings.junctionMode,
      this.settings.switchRoute
    );
    const il = trainState.interlocking;
    this.tracks.updateTurnoutVisual(
      il.stationTrack,
      il.westSwitchTarget,
      il.eastSwitchTarget,
      il.signalValleyAspect,
      il.signalAlpineAspect,
      il.signalExitAspect,
      rawDt
    );

    // 3. Evaluate level crossing state for BOTH trains (either train can traverse Boucle A!)
    const crossingEval = evaluateCrossingState(
      trainState.allCarPositions,
      LEVEL_CROSSING_POS,
      10.8,
      this.settings.crossingMode
    );
    this.barrierAngle = stepBarrierAngle(this.barrierAngle, crossingEval.closed, rawDt, 2.25);
    this.tracks.updateCrossingVisual(this.barrierAngle, crossingEval.closed, this.elapsed);

    // 4. Advance mountain river flow, road traffic cars, station life, and grazing cows
    this.terrain.updateWater(simDt);
    this.village.updateCarsAndPeople(simDt, this.elapsed, crossingEval.closed);
    this.farm.updateFarmLife(this.elapsed);

    // 5. Update damped camera preset or dynamic train chase camera
    const camAlpha = 1 - Math.exp(-4.2 * rawDt);
    if (this.activePreset === 'follow') {
      const lead =
        this.settings.followTarget === 'freight'
          ? trainState.freightLead
          : trainState.passengerLead;

      // Dynamic quartering chase camera slightly behind and elevated above the lead locomotive
      this._followRight.crossVectors(lead.tangent, this._up).normalize();
      this._followOffset
        .copy(lead.tangent)
        .multiplyScalar(-10.5)
        .addScaledVector(this._followRight, 6.2);
      this._followOffset.y = 6.2;

      this.desiredCamPos.copy(lead.position).add(this._followOffset);
      this.desiredCamTarget.copy(lead.position).addScaledVector(lead.tangent, 2.6);
      this.desiredCamTarget.y += 0.9;

      this.camera.position.lerp(this.desiredCamPos, camAlpha);
      this.controls.target.lerp(this.desiredCamTarget, camAlpha);
    } else if (this.cameraTransitionActive) {
      this.camera.position.lerp(this.desiredCamPos, camAlpha);
      this.controls.target.lerp(this.desiredCamTarget, camAlpha);
      if (
        this.camera.position.distanceToSquared(this.desiredCamPos) < 0.02 &&
        this.controls.target.distanceToSquared(this.desiredCamTarget) < 0.02
      ) {
        this.cameraTransitionActive = false;
      }
    }

    this.controls.update();

    // 6. Emit throttled status updates to React HUD only when changed (<= 6 Hz)
    const passengerOnSiding = il.trains.passenger.currentSegment === 'trunk_siding';
    const statusKey = `${crossingEval.closed}|${crossingEval.triggeredByTrain}|${passengerOnSiding}|${il.trains.passenger.activeLoop}|${il.trains.freight.activeLoop}|${il.trains.passenger.waitingAtJunction}|${il.trains.freight.waitingAtJunction}|${il.eastSwitchTarget}|${il.westSwitchTarget}|${il.junctionStateLabel}|${il.safetyStatusLabel}|${il.signalValleyAspect}|${il.signalAlpineAspect}|${il.signalExitAspect}`;
    if (statusKey !== this.lastStatusKey && now - this.lastStatusEmit > 160) {
      this.lastStatusKey = statusKey;
      this.lastStatusEmit = now;
      this.onLiveStatus({
        crossingClosed: crossingEval.closed,
        crossingTriggeredByTrain: crossingEval.triggeredByTrain,
        passengerOnSiding,
        passengerLoop: il.trains.passenger.activeLoop,
        freightLoop: il.trains.freight.activeLoop,
        passengerWaiting: il.trains.passenger.waitingAtJunction,
        freightWaiting: il.trains.freight.waitingAtJunction,
        eastSwitchTarget: il.eastSwitchTarget,
        westSwitchTarget: il.westSwitchTarget,
        junctionStateLabel: il.junctionStateLabel,
        safetyStatusLabel: il.safetyStatusLabel,
        safetyStatusTone: il.safetyStatusTone,
        signalValleyAspect: il.signalValleyAspect,
        signalAlpineAspect: il.signalAlpineAspect,
        signalExitAspect: il.signalExitAspect,
      });
    }

    // 7. Render frame & pace next tick cleanly
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.controls.dispose();
    this.terrain.dispose();
    this.tracks.dispose();
    this.village.dispose();
    this.farm.dispose();
    this.trains.dispose();
    this.lighting.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
