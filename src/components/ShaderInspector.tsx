/**
 * Destroyer Engine - WGSL Shaders & Pipeline Inspector
 */

import React, { useState } from 'react';
import { Code, Copy, Check, Sparkles, Cpu, Layers } from 'lucide-react';
import {
  CLEAR_INDIRECT_COMMANDS_WGSL,
  CULLING_STANDARD_WGSL,
  CULLING_SUBGROUPS_WGSL
} from '../engine/shaders/CullingComputeWGSL';
import { RENDER_PIPELINE_WGSL } from '../engine/shaders/RenderPipelineWGSL';

export const ShaderInspector: React.FC = () => {
  const [activeShader, setActiveShader] = useState<'cull_subgroups' | 'cull_standard' | 'render_pbr' | 'clear'>(
    'cull_subgroups'
  );
  const [copied, setCopied] = useState(false);

  const getShaderSource = () => {
    switch (activeShader) {
      case 'cull_subgroups': return CULLING_SUBGROUPS_WGSL.trim();
      case 'cull_standard': return CULLING_STANDARD_WGSL.trim();
      case 'render_pbr': return RENDER_PIPELINE_WGSL.trim();
      case 'clear': return CLEAR_INDIRECT_COMMANDS_WGSL.trim();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getShaderSource());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col p-6 max-w-6xl mx-auto space-y-4 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Code className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold font-['Chakra_Petch'] tracking-wide text-zinc-100">
              WGSL SHADER PIPELINE INSPECTOR
            </h2>
          </div>
          <p className="text-sm text-zinc-400">
            Real WGSL code driving compute culling, subgroup reductions, and vertex animation rendering.
          </p>
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-cyan-500 text-zinc-200 text-xs font-mono rounded-lg transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied WGSL' : 'Copy WGSL Code'}</span>
        </button>
      </div>

      {/* Shader Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1 bg-zinc-900/60 border border-zinc-800 rounded-lg shrink-0">
        <button
          onClick={() => setActiveShader('cull_subgroups')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeShader === 'cull_subgroups'
              ? 'bg-zinc-800 text-cyan-300 shadow-sm border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Compute Culling (Subgroups)</span>
        </button>

        <button
          onClick={() => setActiveShader('cull_standard')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeShader === 'cull_standard'
              ? 'bg-zinc-800 text-cyan-300 shadow-sm border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-zinc-400" />
          <span>Compute Culling (Standard)</span>
        </button>

        <button
          onClick={() => setActiveShader('render_pbr')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeShader === 'render_pbr'
              ? 'bg-zinc-800 text-cyan-300 shadow-sm border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>Render Pipeline (PBR + Vertex Anim)</span>
        </button>

        <button
          onClick={() => setActiveShader('clear')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeShader === 'clear'
              ? 'bg-zinc-800 text-cyan-300 shadow-sm border border-zinc-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Code className="w-3.5 h-3.5 text-amber-400" />
          <span>Clear Indirect Pass</span>
        </button>
      </div>

      {/* Code Display Area */}
      <div className="flex-1 bg-zinc-950/90 border border-zinc-800/80 rounded-xl p-4 overflow-y-auto font-mono text-xs text-zinc-300 leading-relaxed shadow-inner">
        <pre className="whitespace-pre overflow-x-auto">
          <code>{getShaderSource()}</code>
        </pre>
      </div>
    </div>
  );
};
