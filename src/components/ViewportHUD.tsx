/**
 * Destroyer Engine - Viewport HUD & Interactive Controls
 */

import React, { useRef } from 'react';
import {
  Eye,
  Camera as CameraIcon,
  Play,
  RotateCw,
  Box,
  Layers,
  Upload,
  Activity,
  Sliders,
  Sparkles
} from 'lucide-react';
import { EngineStats } from '../engine/core/Types';

interface ViewportHUDProps {
  stats: EngineStats;
  currentPreset: string;
  onSelectPreset: (preset: 'massive_indirect' | 'skinned_mech' | 'morph_core' | 'wave_terrain') => void;
  debugMode: number;
  onSelectDebugMode: (mode: number) => void;
  cullingEnabled: boolean;
  onToggleCulling: () => void;
  subgroupsEnabled: boolean;
  onToggleSubgroups: () => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  frustumFrozen: boolean;
  onToggleFrustumFreeze: () => void;
  onLoadCustomGLB: (buffer: ArrayBuffer) => void;
  onOpenAnimationStudio: () => void;
}

export const ViewportHUD: React.FC<ViewportHUDProps> = ({
  stats,
  currentPreset,
  onSelectPreset,
  debugMode,
  onSelectDebugMode,
  cullingEnabled,
  onToggleCulling,
  subgroupsEnabled,
  onToggleSubgroups,
  autoOrbit,
  onToggleAutoOrbit,
  frustumFrozen,
  onToggleFrustumFreeze,
  onLoadCustomGLB,
  onOpenAnimationStudio,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          onLoadCustomGLB(reader.result);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between select-none">
      {/* Top Floating Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        {/* Preset Selector */}
        <div className="flex items-center gap-1 p-1 bg-zinc-950/80 backdrop-blur-md border border-zinc-800 rounded-lg shadow-xl">
          <button
            onClick={() => onSelectPreset('massive_indirect')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentPreset === 'massive_indirect'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            10k Indirect Draws
          </button>
          <button
            onClick={() => onSelectPreset('skinned_mech')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentPreset === 'skinned_mech'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Skeletal Mech
          </button>
          <button
            onClick={() => onSelectPreset('morph_core')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentPreset === 'morph_core'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Morphing Core
          </button>
          <button
            onClick={() => onSelectPreset('wave_terrain')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentPreset === 'wave_terrain'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Harmonic Grid
          </button>
        </div>

        {/* Action Buttons: Animation Studio & Custom GLB */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAnimationStudio}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950/80 backdrop-blur-md border border-zinc-700/70 hover:border-cyan-500/60 text-zinc-200 hover:text-cyan-300 text-xs font-medium rounded-lg transition-all shadow-lg"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Vertex Animation</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950/80 backdrop-blur-md border border-zinc-700/70 hover:border-emerald-500/60 text-zinc-200 hover:text-emerald-300 text-xs font-medium rounded-lg transition-all shadow-lg"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Load .GLB</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".glb"
            className="hidden"
          />
        </div>
      </div>

      {/* Center Left: Real-time Telemetry Dashboard */}
      <div className="self-start mt-2 bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-xl p-3.5 text-xs font-mono shadow-2xl pointer-events-auto max-w-xs">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800 mb-2.5">
          <div className="flex items-center gap-2 font-['Chakra_Petch'] font-semibold text-zinc-200 tracking-wide">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            GPU CORE TELEMETRY
          </div>
          <span className="text-emerald-400 font-bold tabular-nums">
            {stats.fps > 0 ? `${stats.fps} FPS` : '60 FPS'}
          </span>
        </div>

        <div className="space-y-1.5 text-zinc-400">
          <div className="flex justify-between">
            <span>Frame Time:</span>
            <span className="text-zinc-200 tabular-nums">{stats.frameTimeMs} ms</span>
          </div>
          <div className="flex justify-between">
            <span>Total Entities:</span>
            <span className="text-zinc-200 tabular-nums">{stats.totalInstances.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Visible (Rendered):</span>
            <span className="text-cyan-400 font-semibold tabular-nums">
              {(stats.visibleInstances || stats.totalInstances).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Culled (GPU Compaction):</span>
            <span className="text-amber-400 tabular-nums">
              {cullingEnabled ? stats.culledInstances.toLocaleString() : '0 (Disabled)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Indirect Draw Calls:</span>
            <span className="text-zinc-200 tabular-nums">{stats.indirectDrawCommands}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Triangles:</span>
            <span className="text-zinc-200 tabular-nums">{stats.totalTriangles.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>GPU Subgroups:</span>
            <span className={stats.subgroupsActive ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
              {stats.subgroupsActive ? 'Active (SIMD Warp)' : (stats.subgroupsSupported ? 'Supported' : 'Standard Fallback')}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Bar: Engine Toggles & Debug Shader Modes */}
      <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        {/* Debug Shading Mode Selector */}
        <div className="flex items-center gap-1 p-1 bg-zinc-950/85 backdrop-blur-md border border-zinc-800 rounded-lg shadow-xl">
          <span className="text-zinc-500 text-[10px] uppercase font-mono px-2">Shader:</span>
          {[
            { id: 0, label: 'Lit PBR' },
            { id: 1, label: 'Normals' },
            { id: 2, label: 'UVs' },
            { id: 3, label: 'Skinning' },
            { id: 4, label: 'Entity ID' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => onSelectDebugMode(mode.id)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                debugMode === mode.id
                  ? 'bg-zinc-800 text-cyan-300 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Engine Pipeline Toggles */}
        <div className="flex items-center gap-2">
          {/* Culling Toggle */}
          <button
            onClick={onToggleCulling}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
              cullingEnabled
                ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>GPU Culling: {cullingEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Subgroups Toggle */}
          <button
            onClick={onToggleSubgroups}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
              subgroupsEnabled
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Subgroups: {subgroupsEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Freeze Frustum Culling Visualizer */}
          <button
            onClick={onToggleFrustumFreeze}
            title="Lock camera culling planes to inspect culled geometry"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
              frustumFrozen
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400'
            }`}
          >
            <CameraIcon className="w-3.5 h-3.5" />
            <span>{frustumFrozen ? 'Frustum Locked' : 'Freeze Frustum'}</span>
          </button>

          {/* Auto Orbit */}
          <button
            onClick={onToggleAutoOrbit}
            className={`p-1.5 text-xs rounded-lg border transition-all ${
              autoOrbit
                ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400'
            }`}
            title="Toggle Auto Orbit"
          >
            <RotateCw className={`w-4 h-4 ${autoOrbit ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
