/**
 * Destroyer Engine - Core Type Definitions & Flat Buffer Structs
 * Optimized for WebGPU compute indirect draws & subgroup compaction
 */

// DrawIndexedIndirect argument struct (5 x uint32 = 20 bytes, aligned to 4 bytes)
export const DRAW_INDEXED_INDIRECT_STRIDE_BYTES = 20;
export const DRAW_INDEXED_INDIRECT_STRIDE_U32 = 5;

export interface DrawIndexedIndirectArgs {
  indexCount: number;
  instanceCount: number;
  firstIndex: number;
  baseVertex: number;
  firstInstance: number;
}

// Flat Mesh metadata in storage buffer
export interface MeshMetadata {
  id: number;
  name: string;
  firstIndex: number;
  indexCount: number;
  baseVertex: number;
  vertexCount: number;
  boundingRadius: number;
  hasSkinning: boolean;
  hasMorphTargets: boolean;
  morphTargetCount: number;
}

// Flat Entity Record
export interface EntityRecord {
  id: number;
  meshId: number;
  materialId: number;
  isActive: boolean;
  castShadows: boolean;
  // Animation link
  animationClipIndex?: number;
  animationTime?: number;
}

// PBR Material parameters in flat buffer (16 floats per material = 64 bytes)
export interface FlatMaterial {
  baseColor: [number, number, number, number]; // r, g, b, a
  emissiveColor: [number, number, number, number]; // r, g, b, intensity
  roughness: number;
  metallic: number;
  ao: number;
  alphaCutoff: number;
}

// Vertex Animation Types
export interface MorphTargetData {
  name: string;
  deltaPositions: Float32Array; // 3 floats per vertex (dx, dy, dz)
  deltaNormals?: Float32Array;   // 3 floats per vertex (dnx, dny, dnz)
}

export interface SkeletonJoint {
  name: string;
  parentIndex: number;
  inverseBindMatrix: Float32Array; // 16 floats
  localMatrix: Float32Array;       // 16 floats
  worldMatrix: Float32Array;       // 16 floats
}

export interface AnimationKeyframe<T> {
  time: number;
  value: T;
}

export interface AnimationChannel {
  targetNode: number;
  path: 'translation' | 'rotation' | 'scale' | 'weights';
  times: Float32Array;
  values: Float32Array;
  interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
}

export interface AnimationClip {
  name: string;
  duration: number;
  channels: AnimationChannel[];
}

export interface EngineStats {
  fps: number;
  frameTimeMs: number;
  gpuCullTimeMs: number;
  gpuRenderTimeMs: number;
  totalInstances: number;
  visibleInstances: number;
  culledInstances: number;
  subgroupsSupported: boolean;
  subgroupsActive: boolean;
  subgroupMinSize: number;
  subgroupMaxSize: number;
  totalVertices: number;
  totalTriangles: number;
  indirectDrawCommands: number;
  bufferMemoryBytes: number;
}

export interface DestroyerConfig {
  canvas: HTMLCanvasElement;
  enableSubgroups?: boolean;
  enableCulling?: boolean;
  maxInstances?: number;
  maxJoints?: number;
  powerPreference?: GPUPowerPreference;
}
