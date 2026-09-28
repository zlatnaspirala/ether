/**
 * Destroyer Engine - Flat Buffer Memory Inspector
 * Visualizes the Data-Oriented Design (DoD) flat contiguous memory buffers
 */

import React, { useState } from 'react';
import { Layers, Database, HardDrive, RefreshCw } from 'lucide-react';
import { FlatEntityManager } from '../engine/core/FlatEntityManager';
import { DRAW_INDEXED_INDIRECT_STRIDE_U32 } from '../engine/core/Types';

interface FlatBufferInspectorProps {
  entityManager: FlatEntityManager;
}

export const FlatBufferInspector: React.FC<FlatBufferInspectorProps> = ({ entityManager }) => {
  const [selectedEntity, setSelectedEntity] = useState<number>(0);
  const [, setRerender] = useState(0);

  const activeCount = entityManager.activeEntityCount;
  const meshCount = entityManager.meshRegistry.length;
  const materialCount = entityManager.materialCount;

  // Calculate memory bytes
  const entityBytes = entityManager.maxEntities * FlatEntityManager.ENTITY_STRIDE_FLOATS * 4;
  const materialBytes = entityManager.maxMaterials * FlatEntityManager.MATERIAL_STRIDE_FLOATS * 4;
  const indirectBytes = 128 * 20;
  const jointsBytes = entityManager.maxJoints * 64;
  const totalAllocatedBytes = entityBytes + materialBytes + indirectBytes + jointsBytes;

  const currentEntityPos = [
    entityManager.positions[selectedEntity * 3]?.toFixed(2) || '0.00',
    entityManager.positions[selectedEntity * 3 + 1]?.toFixed(2) || '0.00',
    entityManager.positions[selectedEntity * 3 + 2]?.toFixed(2) || '0.00',
  ];

  const currentEntityScale = [
    entityManager.scales[selectedEntity * 3]?.toFixed(2) || '1.00',
    entityManager.scales[selectedEntity * 3 + 1]?.toFixed(2) || '1.00',
    entityManager.scales[selectedEntity * 3 + 2]?.toFixed(2) || '1.00',
  ];

  return (
    <div className="h-full overflow-y-auto p-6 max-w-6xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold font-['Chakra_Petch'] tracking-wide text-zinc-100">
            FLAT BUFFER MEMORY ARCHITECTURE
          </h2>
        </div>
        <p className="text-sm text-zinc-400">
          Real-time inspection of contiguous TypedArrays and WebGPU storage buffer streaming. Zero scene-graph traversal overhead.
        </p>
      </div>

      {/* Memory Allocations Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
          <div className="text-xs text-zinc-500 mb-1 flex items-center justify-between">
            <span>Entity Storage Buffer</span>
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-bold text-zinc-100">
            {(entityBytes / (1024 * 1024)).toFixed(2)} MB
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {activeCount.toLocaleString()} / {entityManager.maxEntities.toLocaleString()} Entities
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">96 bytes / entity (24 floats)</div>
        </div>

        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
          <div className="text-xs text-zinc-500 mb-1 flex items-center justify-between">
            <span>Indirect Draw Buffer</span>
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-zinc-100">
            {indirectBytes} Bytes
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {meshCount} Registered Meshes
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">20 bytes / command (5 u32)</div>
        </div>

        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
          <div className="text-xs text-zinc-500 mb-1 flex items-center justify-between">
            <span>PBR Materials Buffer</span>
            <Database className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-zinc-100">
            {(materialBytes / 1024).toFixed(1)} KB
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {materialCount} Active Materials
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">64 bytes / material (16 floats)</div>
        </div>

        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
          <div className="text-xs text-zinc-500 mb-1 flex items-center justify-between">
            <span>Joint Matrices Buffer</span>
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-zinc-100">
            {(jointsBytes / 1024).toFixed(1)} KB
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {entityManager.totalJointsCount} Skeletons
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">64 bytes / joint (16 floats)</div>
        </div>
      </div>

      {/* Indirect Draw Command Table */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3 font-mono flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          GPU Indirect Draw Argument Structs (drawIndexedIndirect)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="pb-2">Mesh ID</th>
                <th className="pb-2">Mesh Name</th>
                <th className="pb-2">indexCount</th>
                <th className="pb-2">firstIndex</th>
                <th className="pb-2">baseVertex</th>
                <th className="pb-2">GPU instanceCount (Dynamic)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {entityManager.meshRegistry.map((m) => {
                const cmdOffset = m.id * DRAW_INDEXED_INDIRECT_STRIDE_U32;
                return (
                  <tr key={m.id} className="hover:bg-zinc-800/30">
                    <td className="py-2.5 text-cyan-400">#{m.id}</td>
                    <td className="py-2.5 font-sans font-medium text-zinc-200">{m.name}</td>
                    <td className="py-2.5 tabular-nums">{entityManager.indirectCommandsData[cmdOffset + 0]}</td>
                    <td className="py-2.5 tabular-nums">{entityManager.indirectCommandsData[cmdOffset + 2]}</td>
                    <td className="py-2.5 tabular-nums">{entityManager.indirectCommandsData[cmdOffset + 3]}</td>
                    <td className="py-2.5 text-emerald-400 tabular-nums font-semibold">
                      Evaluated on GPU (Compute Culling)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Entity Flat Inspector */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Live Entity Flat Array Tweak (Zero Allocation)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Directly modifies Float32Array transforms in memory without creating garbage objects.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-zinc-500">Inspect Entity:</span>
            <input
              type="number"
              min="0"
              max={Math.max(0, activeCount - 1)}
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(Math.max(0, Math.min(activeCount - 1, parseInt(e.target.value) || 0)))}
              className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-center"
            />
          </div>
        </div>

        {activeCount > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
            <div>
              <span className="text-zinc-500 block mb-1">Position [X, Y, Z]:</span>
              <div className="text-cyan-400 text-sm font-semibold">
                [{currentEntityPos.join(', ')}]
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    const idx = selectedEntity * 3;
                    entityManager.positions[idx + 1] += 1.0;
                    entityManager.updateTransform(selectedEntity);
                    setRerender((r) => r + 1);
                  }}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px]"
                >
                  +1 Y
                </button>
                <button
                  onClick={() => {
                    const idx = selectedEntity * 3;
                    entityManager.positions[idx + 1] -= 1.0;
                    entityManager.updateTransform(selectedEntity);
                    setRerender((r) => r + 1);
                  }}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px]"
                >
                  -1 Y
                </button>
              </div>
            </div>

            <div>
              <span className="text-zinc-500 block mb-1">Scale [X, Y, Z]:</span>
              <div className="text-emerald-400 text-sm font-semibold">
                [{currentEntityScale.join(', ')}]
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    const sIdx = selectedEntity * 3;
                    const ns = Math.min(5, entityManager.scales[sIdx] * 1.25);
                    entityManager.scales[sIdx] = ns;
                    entityManager.scales[sIdx + 1] = ns;
                    entityManager.scales[sIdx + 2] = ns;
                    entityManager.updateTransform(selectedEntity);
                    setRerender((r) => r + 1);
                  }}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px]"
                >
                  +25% Scale
                </button>
                <button
                  onClick={() => {
                    const sIdx = selectedEntity * 3;
                    const ns = Math.max(0.2, entityManager.scales[sIdx] * 0.8);
                    entityManager.scales[sIdx] = ns;
                    entityManager.scales[sIdx + 1] = ns;
                    entityManager.scales[sIdx + 2] = ns;
                    entityManager.updateTransform(selectedEntity);
                    setRerender((r) => r + 1);
                  }}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px]"
                >
                  -20% Scale
                </button>
              </div>
            </div>

            <div>
              <span className="text-zinc-500 block mb-1">Flat Memory Offset:</span>
              <div className="text-amber-400 text-sm font-semibold">
                byte offset: {(selectedEntity * FlatEntityManager.ENTITY_STRIDE_FLOATS * 4).toLocaleString()}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Uploaded via queue.writeBuffer to GPUStorageBuffer in 1 single zero-copy call.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic">No entities loaded in flat manager.</p>
        )}
      </div>
    </div>
  );
};
