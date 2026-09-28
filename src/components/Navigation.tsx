/**
 * Destroyer Engine - Navigation Header
 * Strictly enforces Top Bar Contract: Zone 1 (Wordmark), Zone 2 (4 clean links), Zone 3 (1-2 primary actions)
 */

import React from 'react';
import { Cpu, BookOpen, Layers, Code, Zap } from 'lucide-react';

export type ActiveTab = 'viewport' | 'docs' | 'shaders' | 'buffer_memory';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  subgroupsSupported: boolean;
  subgroupsActive: boolean;
  fps: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  subgroupsSupported,
  subgroupsActive,
  fps,
}) => {
  return (
    <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-6 flex items-center justify-between shrink-0 select-none z-30">
      {/* Zone 1: Single text element wordmark in display face */}
      <div className="flex items-center gap-3">
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); onTabChange('viewport'); }}
          className="font-['Chakra_Petch'] text-xl font-bold tracking-wider text-zinc-100 flex items-center gap-2 hover:text-cyan-400 transition-colors"
        >
          <span className="w-2.5 h-2.5 bg-cyan-400 rounded-sm inline-block shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
          DESTROYER
        </a>
        <span className="text-zinc-600 text-xs font-mono hidden sm:inline">WEBGPU CORE</span>
      </div>

      {/* Zone 2: 4 clean text navigation links */}
      <nav className="flex items-center gap-2 md:gap-4 text-xs font-medium">
        <button
          onClick={() => onTabChange('viewport')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
            activeTab === 'viewport'
              ? 'text-cyan-400 bg-zinc-900 border border-zinc-700/60 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Viewport</span>
        </button>

        <button
          onClick={() => onTabChange('docs')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
            activeTab === 'docs'
              ? 'text-cyan-400 bg-zinc-900 border border-zinc-700/60 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>API Docs</span>
        </button>

        <button
          onClick={() => onTabChange('shaders')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
            activeTab === 'shaders'
              ? 'text-cyan-400 bg-zinc-900 border border-zinc-700/60 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>WGSL Pipelines</span>
        </button>

        <button
          onClick={() => onTabChange('buffer_memory')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
            activeTab === 'buffer_memory'
              ? 'text-cyan-400 bg-zinc-900 border border-zinc-700/60 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Flat Memory</span>
        </button>
      </nav>

      {/* Zone 3: 1-2 primary actions and live telemetry pill */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span className="hidden sm:inline">SUBGROUPS:</span>
          <span
            className={`flex items-center gap-1 font-semibold ${
              subgroupsActive ? 'text-emerald-400' : (subgroupsSupported ? 'text-amber-400' : 'text-zinc-500')
            }`}
          >
            <Zap className="w-3 h-3" />
            {subgroupsActive ? 'ACTIVE' : (subgroupsSupported ? 'READY' : 'OFF')}
          </span>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-200 tabular-nums font-semibold">{fps > 0 ? `${fps} FPS` : '--'}</span>
        </div>
      </div>
    </header>
  );
};
