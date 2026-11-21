import {
  Camera,
  ChevronDown,
  ChevronUp,
  GitFork,
  Moon,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Sunset,
  TrainFront,
} from 'lucide-react';
import type {
  CameraPreset,
  FollowTarget,
  JunctionMode,
  LightingMode,
  SimLiveStatus,
  SimSettings,
  SimulationSpeed,
} from '../sim/types';

interface ControlHudProps {
  settings: SimSettings;
  liveStatus: SimLiveStatus;
  dockOpen: boolean;
  onToggleDock: () => void;
  onChangeSettings: (patch: Partial<SimSettings>) => void;
}

const CAMERA_ITEMS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'overview', label: "Vue d'ensemble" },
  { id: 'follow', label: 'Suivi train' },
  { id: 'stationViaduct', label: 'Gare & Jonction' },
  { id: 'crossing', label: 'Passage à niveau' },
  { id: 'farm', label: 'Ferme & Pré' },
];

const SPEED_ITEMS: Array<{ value: SimulationSpeed; label: string }> = [
  { value: 0, label: 'Pause' },
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
];

const JUNCTION_ITEMS: Array<{ id: JunctionMode; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'manual_valley', label: 'Boucle A' },
  { id: 'manual_alpine', label: 'Boucle B' },
];

const LIGHTING_ITEMS: Array<{ id: LightingMode; label: string }> = [
  { id: 'day', label: 'Jour' },
  { id: 'dusk', label: 'Crépuscule' },
  { id: 'night', label: 'Nuit' },
];

export function ControlHud({
  settings,
  liveStatus,
  dockOpen,
  onToggleDock,
  onChangeSettings,
}: ControlHudProps) {
  const toggleStationTrack = () => {
    onChangeSettings({
      switchRoute: settings.switchRoute === 'main' ? 'siding' : 'main',
    });
  };

  const toggleCrossingMode = () => {
    onChangeSettings({
      crossingMode: settings.crossingMode === 'auto' ? 'manualClosed' : 'auto',
    });
  };

  const setFollowTarget = (target: FollowTarget) => {
    onChangeSettings({ cameraPreset: 'follow', followTarget: target });
  };

  const safetyColorClass =
    liveStatus.safetyStatusTone === 'waiting'
      ? 'border-red-400/50 bg-red-500/20 text-red-200'
      : liveStatus.safetyStatusTone === 'exchange'
      ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
      : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200';

  return (
    <>
      {/* Top-Left Minimal Exhibition Plaque + Interlocking & Safety Signal Status */}
      <header className="pointer-events-none fixed top-4 left-4 z-10 flex flex-col gap-1.5 rounded-xl border border-white/12 bg-[#141921]/90 px-4 py-2.5 shadow-lg">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-[#f5f0e4] sm:text-lg whitespace-nowrap">
            Vallée du Viaduc
          </h1>
          <span
            data-testid="safety-status-badge"
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${safetyColorClass}`}
          >
            {liveStatus.safetyStatusTone === 'clear' ? (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{liveStatus.safetyStatusLabel}</span>
          </span>
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-300/90 whitespace-nowrap">
          <span>Aiguillage : {liveStatus.junctionStateLabel}</span>
          <span aria-hidden="true">·</span>
          <span>
            Train A : {liveStatus.passengerLoop === 'valley' ? 'Boucle A' : 'Boucle B'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Train B : {liveStatus.freightLoop === 'valley' ? 'Boucle A' : 'Boucle B'}
          </span>
          <span aria-hidden="true">·</span>
          <span>Barrières {liveStatus.crossingClosed ? 'fermées' : 'ouvertes'}</span>
        </p>
      </header>

      {/* Unified Collapsible Bottom Control Dock (Zero Side-Panel Occlusion) */}
      <section
        aria-label="Commandes du réseau ferroviaire"
        className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex flex-col items-center px-3"
      >
        {/* Collapse / Expand Toggle Handle */}
        <button
          type="button"
          onClick={onToggleDock}
          aria-expanded={dockOpen}
          aria-controls="railway-control-dock"
          className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-t-lg rounded-b-md border border-white/14 bg-[#141921]/92 px-3 py-1 text-xs font-medium text-slate-200 shadow-md transition-colors hover:bg-[#1e2632] hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400 whitespace-nowrap"
        >
          {dockOpen ? (
            <>
              <ChevronDown className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span>Masquer les contrôles</span>
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span>Afficher les contrôles</span>
            </>
          )}
        </button>

        {/* Main Compact Horizontal Dock */}
        <div
          id="railway-control-dock"
          className={`pointer-events-auto w-full max-w-[1120px] rounded-2xl border border-white/14 bg-[#141921]/94 px-3.5 py-2.5 text-slate-100 shadow-2xl transition-all duration-200 ${
            dockOpen
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-[120%] opacity-0 hidden'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {/* 1. Camera Presets & Train Follow Picker */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 mr-0.5 whitespace-nowrap">
                <Camera className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Caméra
              </span>
              <div
                role="group"
                aria-label="Angles de caméra"
                className="flex flex-wrap items-center gap-1 rounded-lg bg-black/35 p-0.5"
              >
                {CAMERA_ITEMS.map((item) => {
                  const active = settings.cameraPreset === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChangeSettings({ cameraPreset: item.id })}
                      aria-pressed={active}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                        active
                          ? 'bg-[#c9953c] text-[#11151b] font-semibold'
                          : 'text-slate-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* Contextual Train A / Train B selector when Follow mode is active */}
              {settings.cameraPreset === 'follow' && (
                <div
                  role="group"
                  aria-label="Train suivi"
                  className="flex items-center gap-1 rounded-lg bg-black/35 p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setFollowTarget('passenger')}
                    aria-pressed={settings.followTarget === 'passenger'}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      settings.followTarget === 'passenger'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <TrainFront className="h-3 w-3" aria-hidden="true" />
                    Train A (Passagers)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFollowTarget('freight')}
                    aria-pressed={settings.followTarget === 'freight'}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      settings.followTarget === 'freight'
                        ? 'bg-red-700 text-white'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <TrainFront className="h-3 w-3" aria-hidden="true" />
                    Train B (Fret)
                  </button>
                </div>
              )}
            </div>

            {/* 2. Speed Controls */}
            <div className="flex items-center gap-1.5">
              <div
                role="group"
                aria-label="Vitesse de simulation"
                className="flex items-center gap-0.5 rounded-lg bg-black/35 p-0.5"
              >
                {SPEED_ITEMS.map((item) => {
                  const active = settings.speed === item.value;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onChangeSettings({ speed: item.value })}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-[var(--font-mono)] text-xs font-medium tabular-nums transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                        active
                          ? 'bg-[#c9953c] text-[#11151b] font-semibold'
                          : 'text-slate-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {item.value === 0 ? (
                        <Pause className="h-3 w-3" aria-hidden="true" />
                      ) : item.value === 1 ? (
                        <Play className="h-3 w-3" aria-hidden="true" />
                      ) : null}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Interconnected Junction Switch (Auto / Boucle A / Boucle B) + Station Siding + Crossing */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 whitespace-nowrap">
                  <GitFork className="h-3.5 w-3.5 text-amber-300/90" aria-hidden="true" />
                  Aiguillage
                </span>
                <div
                  role="group"
                  aria-label="Orientation de l'aiguillage de jonction"
                  className="flex items-center gap-0.5 rounded-lg bg-black/35 p-0.5"
                >
                  {JUNCTION_ITEMS.map((item) => {
                    const active = settings.junctionMode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onChangeSettings({ junctionMode: item.id })}
                        aria-pressed={active}
                        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                          active
                            ? 'bg-[#c9953c] text-[#11151b] font-semibold'
                            : 'text-slate-200 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={toggleStationTrack}
                aria-pressed={settings.switchRoute === 'siding'}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  settings.switchRoute === 'siding'
                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                    : 'border-white/12 bg-black/35 text-slate-200 hover:bg-white/10'
                }`}
              >
                <span>
                  Gare : {settings.switchRoute === 'siding' ? 'Évitement' : 'Voie 1'}
                </span>
              </button>

              <button
                type="button"
                onClick={toggleCrossingMode}
                aria-pressed={settings.crossingMode === 'manualClosed'}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  settings.crossingMode === 'manualClosed'
                    ? 'border-red-400/60 bg-red-500/20 text-red-200'
                    : 'border-white/12 bg-black/35 text-slate-200 hover:bg-white/10'
                }`}
              >
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Barrières :{' '}
                  {settings.crossingMode === 'manualClosed'
                    ? 'Test fermé'
                    : liveStatus.crossingClosed
                    ? 'Auto (fermé)'
                    : 'Auto (ouvert)'}
                </span>
              </button>
            </div>

            {/* 4. Lighting Ambiance: Day / Dusk / Night */}
            <div
              role="group"
              aria-label="Ambiance lumineuse"
              className="flex items-center gap-0.5 rounded-lg bg-black/35 p-0.5"
            >
              {LIGHTING_ITEMS.map((item) => {
                const active = settings.lighting === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeSettings({ lighting: item.id })}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                      active
                        ? 'bg-[#c9953c] text-[#11151b] font-semibold'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.id === 'day' && <Sun className="h-3.5 w-3.5" aria-hidden="true" />}
                    {item.id === 'dusk' && <Sunset className="h-3.5 w-3.5" aria-hidden="true" />}
                    {item.id === 'night' && <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
