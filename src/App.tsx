/**
 * Destroyer Engine - WebGPU Core Engine Application
 * "Flat Architecture · Indirect Draws · Subgroups · GLB Loader · Vertex Animation"
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DestroyerEngine } from './engine/DestroyerEngine';
import { EngineStats } from './engine/core/Types';
import { Navigation, ActiveTab } from './components/Navigation';
import { ViewportHUD } from './components/ViewportHUD';
import { AnimationDrawer } from './components/AnimationDrawer';
import { ApiDocsViewer } from './components/ApiDocsViewer';
import { ShaderInspector } from './components/ShaderInspector';
import { FlatBufferInspector } from './components/FlatBufferInspector';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<DestroyerEngine | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('viewport');
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Scene & Engine State
  const [currentPreset, setCurrentPreset] = useState<'massive_indirect' | 'skinned_mech' | 'morph_core' | 'wave_terrain'>('massive_indirect');
  const [debugMode, setDebugMode] = useState<number>(0);
  const [cullingEnabled, setCullingEnabled] = useState<boolean>(true);
  const [subgroupsEnabled, setSubgroupsEnabled] = useState<boolean>(true);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(false);
  const [frustumFrozen, setFrustumFrozen] = useState<boolean>(false);
  const [isAnimationDrawerOpen, setIsAnimationDrawerOpen] = useState<boolean>(false);

  // Live Telemetry
  const [stats, setStats] = useState<EngineStats>({
    fps: 60,
    frameTimeMs: 16.6,
    gpuCullTimeMs: 0.1,
    gpuRenderTimeMs: 0.5,
    totalInstances: 0,
    visibleInstances: 0,
    culledInstances: 0,
    subgroupsSupported: false,
    subgroupsActive: false,
    subgroupMinSize: 0,
    subgroupMaxSize: 0,
    totalVertices: 0,
    totalTriangles: 0,
    indirectDrawCommands: 0,
    bufferMemoryBytes: 0,
  });

  // Mouse interaction state for camera
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Initialize Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new DestroyerEngine();
    engineRef.current = engine;

    let mounted = true;

    async function setup() {
      const res = await engine.init({
        canvas: canvas!,
        enableSubgroups: true,
        enableCulling: true,
        maxInstances: 50000,
      });

      if (!mounted) return;

      if (!res.success) {
        setInitError(res.error || 'WebGPU failed to initialize');
        return;
      }

      // Load initial stress test preset (10k instanced indirect draws)
      engine.loadScenePreset('massive_indirect', 8000);
      engine.start();
      setIsInitialized(true);

      // Start Telemetry Poller
      const statsInterval = setInterval(() => {
        if (engine.renderer) {
          setStats({ ...engine.renderer.stats });
        }
      }, 250);

      return () => {
        clearInterval(statsInterval);
      };
    }

    setup();

    return () => {
      mounted = false;
      engine.stop();
    };
  }, []);

  // Resize Observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      if (engineRef.current) {
        const width = canvas.parentElement?.clientWidth || window.innerWidth;
        const height = canvas.parentElement?.clientHeight || window.innerHeight - 56;
        engineRef.current.resize(width, height);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

  // Mouse and Touch Controls
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 && !e.shiftKey) {
      isDraggingRef.current = true;
      isPanningRef.current = false;
    } else if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
      isPanningRef.current = true;
      isDraggingRef.current = false;
    }
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!engineRef.current) return;
    const camera = engineRef.current.camera;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (isDraggingRef.current) {
      camera.orbit(-dx * 0.006, -dy * 0.006);
    } else if (isPanningRef.current) {
      camera.pan(dx, dy);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!engineRef.current) return;
    e.preventDefault();
    engineRef.current.camera.zoom(e.deltaY * 0.03);
  };

  // Drag and Drop GLB support
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer && engineRef.current) {
          handleLoadCustomGLB(reader.result);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Preset Selection
  const handleSelectPreset = (preset: 'massive_indirect' | 'skinned_mech' | 'morph_core' | 'wave_terrain') => {
    setCurrentPreset(preset);
    if (engineRef.current) {
      engineRef.current.loadScenePreset(preset, preset === 'massive_indirect' ? 8000 : 1);
      if (preset === 'skinned_mech' || preset === 'morph_core') {
        setIsAnimationDrawerOpen(true);
      }
    }
  };

  // Debug Shading Mode
  const handleSelectDebugMode = (mode: number) => {
    setDebugMode(mode);
    if (engineRef.current && engineRef.current.renderer) {
      engineRef.current.renderer.debugMode = mode;
    }
  };

  // Toggle Culling
  const handleToggleCulling = () => {
    const nextVal = !cullingEnabled;
    setCullingEnabled(nextVal);
    if (engineRef.current && engineRef.current.renderer) {
      engineRef.current.renderer.enableCulling = nextVal;
    }
  };

  // Toggle Subgroups
  const handleToggleSubgroups = () => {
    const nextVal = !subgroupsEnabled;
    setSubgroupsEnabled(nextVal);
    if (engineRef.current && engineRef.current.renderer) {
      engineRef.current.renderer.enableSubgroups = nextVal;
      // Re-init culling pipeline with/without subgroups
      engineRef.current.renderer.initPipelines(engineRef.current.entityManager);
    }
  };

  // Toggle Auto Orbit
  const handleToggleAutoOrbit = () => {
    const nextVal = !autoOrbit;
    setAutoOrbit(nextVal);
    if (engineRef.current) {
      engineRef.current.camera.autoOrbit = nextVal;
    }
  };

  // Toggle Frustum Freeze
  const handleToggleFrustumFreeze = () => {
    if (engineRef.current) {
      const frozen = engineRef.current.camera.toggleFrustumFreeze();
      setFrustumFrozen(frozen);
    }
  };

  // Custom GLB Load
  const handleLoadCustomGLB = (buffer: ArrayBuffer) => {
    if (engineRef.current) {
      try {
        const res = engineRef.current.loadGLB(buffer);
        setCurrentPreset('skinned_mech'); // activate inspector mode
        setIsAnimationDrawerOpen(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`Failed to load GLB: ${msg}`);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      {/* Top Bar Contract (Wordmark, Nav Links, Live Telemetry) */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        subgroupsSupported={stats.subgroupsSupported}
        subgroupsActive={stats.subgroupsActive}
        fps={stats.fps}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 relative overflow-hidden bg-black">
        {/* WebGPU 3D Canvas (Always mounted for performance & context persistence) */}
        <div
          className={`absolute inset-0 ${activeTab === 'viewport' ? 'block' : 'hidden'}`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {initError ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-md mx-auto space-y-4 font-mono">
              <AlertTriangle className="w-12 h-12 text-amber-500 animate-pulse" />
              <h2 className="text-xl font-bold font-['Chakra_Petch'] text-zinc-100">
                WebGPU Initialization Required
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {initError}
              </p>
              <div className="text-[11px] text-zinc-500 bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 text-left space-y-1.5">
                <div className="font-semibold text-zinc-300">How to run WebGPU:</div>
                <div>1. Use Google Chrome 113+, Microsoft Edge 113+, or Safari 18+.</div>
                <div>2. Ensure hardware graphics acceleration is enabled in your browser settings.</div>
                <div>3. On Linux/VMs, navigate to <code className="text-cyan-400">chrome://flags/#enable-unsafe-webgpu</code> and enable it.</div>
              </div>
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
                onWheel={handleWheel}
                className="w-full h-full block cursor-grab active:cursor-grabbing outline-none"
              />

              {/* Viewport Floating HUD */}
              <ViewportHUD
                stats={stats}
                currentPreset={currentPreset}
                onSelectPreset={handleSelectPreset}
                debugMode={debugMode}
                onSelectDebugMode={handleSelectDebugMode}
                cullingEnabled={cullingEnabled}
                onToggleCulling={handleToggleCulling}
                subgroupsEnabled={subgroupsEnabled}
                onToggleSubgroups={handleToggleSubgroups}
                autoOrbit={autoOrbit}
                onToggleAutoOrbit={handleToggleAutoOrbit}
                frustumFrozen={frustumFrozen}
                onToggleFrustumFreeze={handleToggleFrustumFreeze}
                onLoadCustomGLB={handleLoadCustomGLB}
                onOpenAnimationStudio={() => setIsAnimationDrawerOpen(true)}
              />

              {/* Vertex Animation Studio Drawer */}
              {engineRef.current && (
                <AnimationDrawer
                  animation={engineRef.current.animation}
                  isOpen={isAnimationDrawerOpen}
                  onClose={() => setIsAnimationDrawerOpen(false)}
                />
              )}
            </>
          )}
        </div>

        {/* API Documentation Tab */}
        {activeTab === 'docs' && (
          <div className="h-full bg-zinc-950">
            <ApiDocsViewer />
          </div>
        )}

        {/* WGSL Shader Inspector Tab */}
        {activeTab === 'shaders' && (
          <div className="h-full bg-zinc-950">
            <ShaderInspector />
          </div>
        )}

        {/* Flat Buffer Memory Inspector Tab */}
        {activeTab === 'buffer_memory' && (
          <div className="h-full bg-zinc-950">
            {engineRef.current && (
              <FlatBufferInspector entityManager={engineRef.current.entityManager} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
