/**
 * Destroyer Engine - Vertex Animation Studio Drawer
 * Real-time controls for Morph Targets, Skeletal Joint Animation, and Procedural Waves
 */

import React, { useState, useEffect } from 'react';
import { X, Play, Pause, FastForward, Sliders, Waves, Activity, RefreshCw } from 'lucide-react';
import { VertexAnimationController } from '../engine/animation/VertexAnimation';

interface AnimationDrawerProps {
  animation: VertexAnimationController;
  isOpen: boolean;
  onClose: () => void;
}

export const AnimationDrawer: React.FC<AnimationDrawerProps> = ({
  animation,
  isOpen,
  onClose,
}) => {
  const [, setTick] = useState(0);

  // Poll animation values for UI sync
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % 1000);
    }, 50);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentClip = animation.clips[animation.currentClipIndex];

  return (
    <div className="absolute right-4 top-16 bottom-16 w-80 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl p-4 flex flex-col justify-between select-none z-20 overflow-y-auto">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="font-['Chakra_Petch'] font-bold text-sm tracking-wide text-zinc-100">
              VERTEX ANIMATION STUDIO
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: GPU Morph Targets (Blend Shapes) */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 mb-2">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Morph Targets (Blend Shapes)
            </span>
            <span className="text-[10px] font-mono text-zinc-500">WGSL Delta Stream</span>
          </div>

          <div className="space-y-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3">
            <div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
                <span>Morph Target 0 (Spikes/Expand):</span>
                <span className="text-cyan-400">{animation.morphWeights[0].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={animation.morphWeights[0]}
                onChange={(e) => animation.setMorphWeight(0, parseFloat(e.target.value))}
                className="w-full accent-cyan-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
                <span>Morph Target 1 (Twist/Warp):</span>
                <span className="text-cyan-400">{animation.morphWeights[1].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={animation.morphWeights[1]}
                onChange={(e) => animation.setMorphWeight(1, parseFloat(e.target.value))}
                className="w-full accent-cyan-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
              />
            </div>

            <button
              onClick={() => {
                animation.setMorphWeight(0, 0);
                animation.setMorphWeight(1, 0);
              }}
              className="w-full mt-1 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 rounded transition-colors"
            >
              Reset Morphs
            </button>
          </div>
        </div>

        {/* Section 2: Skeletal Joint Skinning */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 mb-2">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              Skeletal Skinning Pipeline
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {animation.joints.length} Joints
            </span>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 space-y-3">
            {animation.clips.length > 0 ? (
              <>
                <div className="text-[11px] text-zinc-300 font-medium flex justify-between">
                  <span>Clip: {currentClip?.name || 'Animation'}</span>
                  <span className="font-mono text-zinc-400">
                    {animation.currentTime.toFixed(2)}s / {(currentClip?.duration || 0).toFixed(2)}s
                  </span>
                </div>

                {/* Timeline Scrubber */}
                <input
                  type="range"
                  min="0"
                  max={currentClip?.duration || 1}
                  step="0.01"
                  value={animation.currentTime}
                  onChange={(e) => {
                    animation.currentTime = parseFloat(e.target.value);
                  }}
                  className="w-full accent-emerald-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
                />

                {/* Playback Controls */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        animation.isPlaying = !animation.isPlaying;
                      }}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                    >
                      {animation.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => {
                        animation.currentTime = 0;
                      }}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-[10px] font-mono"
                    >
                      Reset
                    </button>
                  </div>

                  {/* Speed Selector */}
                  <div className="flex items-center gap-1 text-[10px] font-mono">
                    {[0.5, 1.0, 1.5].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => { animation.playbackSpeed = speed; }}
                        className={`px-1.5 py-0.5 rounded transition-colors ${
                          animation.playbackSpeed === speed
                            ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-zinc-500 italic">
                Active scene uses static geometry or procedural mesh. Load "Skeletal Mech" or custom GLB with skins.
              </p>
            )}
          </div>
        </div>

        {/* Section 3: Procedural Vertex Wave Simulation */}
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 mb-2">
            <span className="flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-blue-400" />
              Procedural Harmonic Waves
            </span>
            <span className="text-[10px] font-mono text-zinc-500">WGSL Vertex Sim</span>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 space-y-3">
            <div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
                <span>Wave Amplitude:</span>
                <span className="text-blue-400">{animation.waveFactor.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={animation.waveFactor}
                onChange={(e) => {
                  animation.waveFactor = parseFloat(e.target.value);
                }}
                className="w-full accent-blue-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-zinc-800 text-[10px] text-zinc-500 font-mono text-center">
        Destroyer Vertex Pipeline v1.0
      </div>
    </div>
  );
};
