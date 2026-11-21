import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { LightingMode } from '../sim/types';

export interface LightingRigResult {
  update: (mode: LightingMode, dt: number) => number; // returns smoothly damped nightFactor [0..1]
  dispose: () => void;
}

interface LightingPresetSpec {
  skyColor: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  keyColor: THREE.Color;
  keyIntensity: number;
  keyPos: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  rimColor: THREE.Color;
  rimIntensity: number;
  pointIntensity: number;
  exposure: number;
  nightFactor: number;
}

const PRESETS: Record<LightingMode, LightingPresetSpec> = {
  day: {
    skyColor: new THREE.Color(0xc5dbee),
    fogColor: new THREE.Color(0xc5dbee),
    fogDensity: 0.0031,
    keyColor: new THREE.Color(0xfff3db),
    keyIntensity: 2.35,
    keyPos: new THREE.Vector3(44, 58, 38),
    hemiSky: new THREE.Color(0x9ec9f2),
    hemiGround: new THREE.Color(0x4f4535),
    hemiIntensity: 0.85,
    rimColor: new THREE.Color(0xbcd8ff),
    rimIntensity: 0.45,
    pointIntensity: 0.0,
    exposure: 1.08,
    nightFactor: 0.0,
  },
  dusk: {
    skyColor: new THREE.Color(0x3a324e),
    fogColor: new THREE.Color(0x473854),
    fogDensity: 0.0042,
    keyColor: new THREE.Color(0xff924c),
    keyIntensity: 1.55,
    keyPos: new THREE.Vector3(-52, 22, 28),
    hemiSky: new THREE.Color(0x765c8a),
    hemiGround: new THREE.Color(0x332722),
    hemiIntensity: 0.62,
    rimColor: new THREE.Color(0xffaa70),
    rimIntensity: 0.55,
    pointIntensity: 5.5,
    exposure: 1.04,
    nightFactor: 0.58,
  },
  night: {
    skyColor: new THREE.Color(0x0b1220),
    fogColor: new THREE.Color(0x0d1526),
    fogDensity: 0.0048,
    keyColor: new THREE.Color(0x6d96d6),
    keyIntensity: 0.48,
    keyPos: new THREE.Vector3(-34, 46, -28),
    hemiSky: new THREE.Color(0x20375e),
    hemiGround: new THREE.Color(0x101319),
    hemiIntensity: 0.34,
    rimColor: new THREE.Color(0x4b6fa8),
    rimIntensity: 0.28,
    pointIntensity: 15.0,
    exposure: 1.0,
    nightFactor: 1.0,
  },
};

/**
 * Configures RoomEnvironment reflections, balanced 3-point warm/cool lighting with tight shadows,
 * horizon-matched fog, and 4 strategic warm night PointLights (station, village, crossing, chapel).
 */
export function createLightingRig(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): LightingRigResult {
  // Mandatory studio environment map for crisp metallic rails, brass, and glass sheen
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const initial = PRESETS.day;
  scene.background = initial.skyColor.clone();
  const fog = new THREE.FogExp2(initial.fogColor.getHex(), initial.fogDensity);
  scene.fog = fog;

  // 1. Warm Directional Key Light (single shadow caster with tight frustum)
  const keyLight = new THREE.DirectionalLight(initial.keyColor, initial.keyIntensity);
  keyLight.position.copy(initial.keyPos);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 8;
  keyLight.shadow.camera.far = 165;
  const d = 54;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.03;
  scene.add(keyLight);

  // 2. Cool Sky / Warm Earth Hemisphere Fill Light
  const hemiLight = new THREE.HemisphereLight(
    initial.hemiSky,
    initial.hemiGround,
    initial.hemiIntensity
  );
  scene.add(hemiLight);

  // 3. Rim Backlight for alpine silhouette separation
  const rimLight = new THREE.DirectionalLight(initial.rimColor, initial.rimIntensity);
  rimLight.position.set(-40, 32, -44);
  scene.add(rimLight);

  // 4. Strategic warm unshadowed PointLights for Dusk & Night miniature diorama warmth
  const warmHex = 0xffb866;
  const stationLight = new THREE.PointLight(warmHex, 0, 22, 1.8);
  stationLight.position.set(0.0, 3.6, 15.2);
  scene.add(stationLight);

  const villageLight = new THREE.PointLight(warmHex, 0, 22, 1.8);
  villageLight.position.set(14.0, 3.4, 4.8);
  scene.add(villageLight);

  const crossingLight = new THREE.PointLight(0xff9f5a, 0, 15, 1.8);
  crossingLight.position.set(24.5, 3.2, 2.3);
  scene.add(crossingLight);

  const chapelLight = new THREE.PointLight(warmHex, 0, 16, 1.8);
  chapelLight.position.set(16.6, 7.2, -6.2);
  scene.add(chapelLight);

  const farmLight = new THREE.PointLight(warmHex, 0, 24, 1.8);
  farmLight.position.set(-34.8, 4.2, 16.2);
  scene.add(farmLight);

  const nightPoints = [stationLight, villageLight, crossingLight, chapelLight, farmLight];

  let currentNightFactor = 0;

  return {
    update: (mode: LightingMode, dt: number) => {
      const target = PRESETS[mode];
      const alpha = 1 - Math.exp(-5.8 * Math.min(dt, 0.1));

      (scene.background as THREE.Color).lerp(target.skyColor, alpha);
      fog.color.lerp(target.fogColor, alpha);
      fog.density += (target.fogDensity - fog.density) * alpha;

      keyLight.color.lerp(target.keyColor, alpha);
      keyLight.intensity += (target.keyIntensity - keyLight.intensity) * alpha;
      keyLight.position.lerp(target.keyPos, alpha);

      hemiLight.color.lerp(target.hemiSky, alpha);
      hemiLight.groundColor.lerp(target.hemiGround, alpha);
      hemiLight.intensity += (target.hemiIntensity - hemiLight.intensity) * alpha;

      rimLight.color.lerp(target.rimColor, alpha);
      rimLight.intensity += (target.rimIntensity - rimLight.intensity) * alpha;

      for (const pt of nightPoints) {
        pt.intensity += (target.pointIntensity - pt.intensity) * alpha;
      }

      renderer.toneMappingExposure += (target.exposure - renderer.toneMappingExposure) * alpha;
      scene.environmentIntensity = 0.55 - currentNightFactor * 0.35;

      currentNightFactor += (target.nightFactor - currentNightFactor) * alpha;
      return currentNightFactor;
    },
    dispose: () => {
      envTarget.dispose();
    },
  };
}
