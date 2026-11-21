import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlHud } from './components/ControlHud';
import { RailwayEngine } from './scene/RailwayEngine';
import type { SimLiveStatus, SimSettings } from './sim/types';

const INITIAL_SETTINGS: SimSettings = {
  speed: 1,
  lighting: 'day',
  cameraPreset: 'overview',
  followTarget: 'passenger',
  junctionMode: 'auto',
  switchRoute: 'main',
  crossingMode: 'auto',
};

const INITIAL_STATUS: SimLiveStatus = {
  crossingClosed: false,
  crossingTriggeredByTrain: false,
  passengerOnSiding: false,
  passengerLoop: 'valley',
  freightLoop: 'alpine',
  passengerWaiting: false,
  freightWaiting: false,
  eastSwitchTarget: 'alpine',
  westSwitchTarget: 'valley',
  junctionStateLabel: 'Boucle B (Auto)',
  safetyStatusLabel: 'Voie libre',
  safetyStatusTone: 'clear',
  signalValleyAspect: 'green',
  signalAlpineAspect: 'red',
  signalExitAspect: 'amber',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RailwayEngine | null>(null);

  const [settings, setSettings] = useState<SimSettings>(INITIAL_SETTINGS);
  const [liveStatus, setLiveStatus] = useState<SimLiveStatus>(INITIAL_STATUS);
  const [dockOpen, setDockOpen] = useState(true);
  const [webglError, setWebglError] = useState<string>('');

  const handleChangeSettings = useCallback((patch: Partial<SimSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // Mount Three.js engine once inside isolated empty div ref
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    let engine: RailwayEngine | null = null;
    try {
      engine = new RailwayEngine(
        mount,
        INITIAL_SETTINGS,
        (status) => setLiveStatus(status),
        (err) => setWebglError(err)
      );
      engineRef.current = engine;
    } catch {
      setWebglError(
        "Impossible d'initialiser le rendu WebGL 3D sur ce navigateur."
      );
    }

    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Push settings updates smoothly into engine without recreating WebGL canvas
  useEffect(() => {
    engineRef.current?.updateSettings(settings);
  }, [settings]);

  // Ergonomic keyboard shortcuts: H (toggle HUD), Space (pause/resume), 1-5 (camera presets)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockOpen((v) => !v);
      } else if (e.code === 'Space') {
        e.preventDefault();
        setSettings((prev) => ({
          ...prev,
          speed: prev.speed === 0 ? 1 : 0,
        }));
      } else if (e.key === '1') {
        setSettings((prev) => ({ ...prev, cameraPreset: 'overview' }));
      } else if (e.key === '2') {
        setSettings((prev) => ({ ...prev, cameraPreset: 'follow' }));
      } else if (e.key === '3') {
        setSettings((prev) => ({ ...prev, cameraPreset: 'stationViaduct' }));
      } else if (e.key === '4') {
        setSettings((prev) => ({ ...prev, cameraPreset: 'crossing' }));
      } else if (e.key === '5') {
        setSettings((prev) => ({ ...prev, cameraPreset: 'farm' }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#11161d]"
      data-lighting={settings.lighting}
      data-camera={settings.cameraPreset}
      data-speed={settings.speed}
      data-junction-mode={settings.junctionMode}
      data-switch={settings.switchRoute}
      data-safety-tone={liveStatus.safetyStatusTone}
      data-crossing-closed={liveStatus.crossingClosed ? 'true' : 'false'}
    >
      {/* Dedicated empty mount node for WebGLRenderer */}
      <div
        ref={canvasMountRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        aria-label="Scène 3D interactive du réseau ferroviaire miniature Vallée du Viaduc"
      />

      {/* Graceful WebGL fallback overlay if unavailable */}
      {webglError && (
        <div
          role="alert"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#11161d]/95 p-6 text-center"
        >
          <div className="max-w-md rounded-2xl border border-white/15 bg-[#19212c] p-6 shadow-xl">
            <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#f5f0e4]">
              Rendu 3D indisponible
            </h2>
            <p className="mt-2 text-sm text-slate-300">{webglError}</p>
          </div>
        </div>
      )}

      {/* Sibling DOM HUD Overlay */}
      <ControlHud
        settings={settings}
        liveStatus={liveStatus}
        dockOpen={dockOpen}
        onToggleDock={() => setDockOpen((v) => !v)}
        onChangeSettings={handleChangeSettings}
      />
    </main>
  );
}
