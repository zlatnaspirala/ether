/**
 * Destroyer Engine - Flat Data-Oriented Entity Manager
 * Stores all scene entities in contiguous TypedArrays for maximum cache-locality
 * and direct WebGPU storage buffer streaming.
 */

import { Mat4 } from '../math/Mat4';
import {
  DRAW_INDEXED_INDIRECT_STRIDE_U32,
  EntityRecord,
  FlatMaterial,
  MeshMetadata
} from './Types';

export class FlatEntityManager {
  public readonly maxEntities: number;
  public readonly maxMaterials: number;
  public readonly maxJoints: number;

  public activeEntityCount = 0;
  public nextEntityId = 0;

  // Contiguous Flat Buffers
  // 1. GPU Entity Records (64 bytes each: mat4 (16 floats) + sphere (4 floats) + meta (4 u32))
  // We can interleave into a single Float32Array / Uint32Array view for fastest GPU copy
  // Struct:
  // float[0..15]: worldMatrix (16 floats = 64 bytes)
  // float[16..18]: sphereCenter.xyz
  // float[19]: sphereRadius
  // uint[20]: meshId
  // uint[21]: materialId
  // uint[22]: flags (bit 0 = active, bit 1 = castShadows)
  // uint[23]: animOffset (joint offset in jointMatrices buffer)
  // Total stride per entity = 24 * 4 = 96 bytes (aligned to 16 bytes for WGSL mat4 + vec4)
  public static readonly ENTITY_STRIDE_FLOATS = 24;

  public readonly entityBufferRaw: ArrayBuffer;
  public readonly entityFloatView: Float32Array;
  public readonly entityUintView: Uint32Array;

  // Separate transforms for fast CPU-side updates
  public readonly positions: Float32Array; // 3 floats per entity
  public readonly rotations: Float32Array; // 4 floats per entity (quaternion: x, y, z, w)
  public readonly scales: Float32Array;    // 3 floats per entity

  // Flat Materials Buffer (16 floats = 64 bytes per material)
  public readonly materialBufferRaw: ArrayBuffer;
  public readonly materialFloatView: Float32Array;
  public readonly materialUintView: Uint32Array;
  public static readonly MATERIAL_STRIDE_FLOATS = 16;
  public materialCount = 0;

  // Indirect Draw Commands (5 x uint32 per mesh = 20 bytes)
  public indirectCommandsData: Uint32Array;
  public meshRegistry: MeshMetadata[] = [];

  // Flat Skeletal Joint Matrices (16 floats per joint)
  public readonly jointMatrices: Float32Array;
  public totalJointsCount = 0;

  // Entity records list for user inspection
  public entityRecords: EntityRecord[] = [];

  constructor(maxEntities = 50000, maxMaterials = 256, maxJoints = 2048) {
    this.maxEntities = maxEntities;
    this.maxMaterials = maxMaterials;
    this.maxJoints = maxJoints;

    // Entity buffer
    this.entityBufferRaw = new ArrayBuffer(maxEntities * FlatEntityManager.ENTITY_STRIDE_FLOATS * 4);
    this.entityFloatView = new Float32Array(this.entityBufferRaw);
    this.entityUintView = new Uint32Array(this.entityBufferRaw);

    // Transforms
    this.positions = new Float32Array(maxEntities * 3);
    this.rotations = new Float32Array(maxEntities * 4);
    this.scales = new Float32Array(maxEntities * 3);

    // Materials buffer
    this.materialBufferRaw = new ArrayBuffer(maxMaterials * FlatEntityManager.MATERIAL_STRIDE_FLOATS * 4);
    this.materialFloatView = new Float32Array(this.materialBufferRaw);
    this.materialUintView = new Uint32Array(this.materialBufferRaw);

    // Indirect commands data
    this.indirectCommandsData = new Uint32Array(128 * DRAW_INDEXED_INDIRECT_STRIDE_U32);

    // Skinned Joints Buffer
    this.jointMatrices = new Float32Array(maxJoints * 16);

    // Initialize default material 0
    this.registerMaterial({
      baseColor: [0.8, 0.8, 0.85, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.35,
      metallic: 0.1,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
  }

  registerMesh(metadata: Omit<MeshMetadata, 'id'>): number {
    const id = this.meshRegistry.length;
    const mesh: MeshMetadata = { ...metadata, id };
    this.meshRegistry.push(mesh);

    // Prepare indirect draw command for this mesh:
    // [indexCount, instanceCount = 0, firstIndex, baseVertex, firstInstance = 0]
    const cmdOffset = id * DRAW_INDEXED_INDIRECT_STRIDE_U32;
    if (cmdOffset + DRAW_INDEXED_INDIRECT_STRIDE_U32 > this.indirectCommandsData.length) {
      const newCmds = new Uint32Array(this.indirectCommandsData.length * 2);
      newCmds.set(this.indirectCommandsData);
      this.indirectCommandsData = newCmds;
    }

    this.indirectCommandsData[cmdOffset + 0] = mesh.indexCount;
    this.indirectCommandsData[cmdOffset + 1] = 0; // will be populated by compute culling
    this.indirectCommandsData[cmdOffset + 2] = mesh.firstIndex;
    this.indirectCommandsData[cmdOffset + 3] = mesh.baseVertex;
    this.indirectCommandsData[cmdOffset + 4] = 0;

    return id;
  }

  registerMaterial(mat: FlatMaterial): number {
    if (this.materialCount >= this.maxMaterials) {
      return 0;
    }
    const id = this.materialCount++;
    const offset = id * FlatEntityManager.MATERIAL_STRIDE_FLOATS;

    this.materialFloatView[offset + 0] = mat.baseColor[0];
    this.materialFloatView[offset + 1] = mat.baseColor[1];
    this.materialFloatView[offset + 2] = mat.baseColor[2];
    this.materialFloatView[offset + 3] = mat.baseColor[3];

    this.materialFloatView[offset + 4] = mat.emissiveColor[0];
    this.materialFloatView[offset + 5] = mat.emissiveColor[1];
    this.materialFloatView[offset + 6] = mat.emissiveColor[2];
    this.materialFloatView[offset + 7] = mat.emissiveColor[3];

    this.materialFloatView[offset + 8] = mat.roughness;
    this.materialFloatView[offset + 9] = mat.metallic;
    this.materialFloatView[offset + 10] = mat.ao;
    this.materialFloatView[offset + 11] = mat.alphaCutoff;

    return id;
  }

  createEntity(
    meshId: number,
    materialId = 0,
    position: [number, number, number] = [0, 0, 0],
    rotation: [number, number, number, number] = [0, 0, 0, 1], // quaternion
    scale: [number, number, number] = [1, 1, 1],
    boundingRadius = 1.0,
    animOffset = 0
  ): number {
    if (this.activeEntityCount >= this.maxEntities) {
      throw new Error(`Exceeded max entities limit of ${this.maxEntities}`);
    }

    const id = this.nextEntityId++;
    this.activeEntityCount++;

    // Store transform in flat arrays
    const pIdx = id * 3;
    this.positions[pIdx] = position[0];
    this.positions[pIdx + 1] = position[1];
    this.positions[pIdx + 2] = position[2];

    const rIdx = id * 4;
    this.rotations[rIdx] = rotation[0];
    this.rotations[rIdx + 1] = rotation[1];
    this.rotations[rIdx + 2] = rotation[2];
    this.rotations[rIdx + 3] = rotation[3];

    const sIdx = id * 3;
    this.scales[sIdx] = scale[0];
    this.scales[sIdx + 1] = scale[1];
    this.scales[sIdx + 2] = scale[2];

    // Compute initial world matrix
    const eOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    Mat4.fromTranslationRotationScale(position, rotation, scale, this.entityFloatView, eOffset);

    // Bounding sphere (center xyz = 0,0,0 relative to entity, w = radius)
    this.entityFloatView[eOffset + 16] = 0.0;
    this.entityFloatView[eOffset + 17] = 0.0;
    this.entityFloatView[eOffset + 18] = 0.0;
    this.entityFloatView[eOffset + 19] = boundingRadius;

    // Metadata in Uint32 view
    this.entityUintView[eOffset + 20] = meshId;
    this.entityUintView[eOffset + 21] = materialId;
    this.entityUintView[eOffset + 22] = 1; // active flag = 1
    this.entityUintView[eOffset + 23] = animOffset;

    this.entityRecords.push({
      id,
      meshId,
      materialId,
      isActive: true,
      castShadows: true,
    });

    return id;
  }

  updateTransform(
    id: number,
    position?: [number, number, number],
    rotation?: [number, number, number, number],
    scale?: [number, number, number]
  ): void {
    if (id >= this.activeEntityCount) return;

    const pIdx = id * 3;
    const rIdx = id * 4;
    const sIdx = id * 3;

    if (position) {
      this.positions[pIdx] = position[0];
      this.positions[pIdx + 1] = position[1];
      this.positions[pIdx + 2] = position[2];
    }
    if (rotation) {
      this.rotations[rIdx] = rotation[0];
      this.rotations[rIdx + 1] = rotation[1];
      this.rotations[rIdx + 2] = rotation[2];
      this.rotations[rIdx + 3] = rotation[3];
    }
    if (scale) {
      this.scales[sIdx] = scale[0];
      this.scales[sIdx + 1] = scale[1];
      this.scales[sIdx + 2] = scale[2];
    }

    const pos: [number, number, number] = [this.positions[pIdx], this.positions[pIdx + 1], this.positions[pIdx + 2]];
    const rot: [number, number, number, number] = [
      this.rotations[rIdx],
      this.rotations[rIdx + 1],
      this.rotations[rIdx + 2],
      this.rotations[rIdx + 3]
    ];
    const sca: [number, number, number] = [this.scales[sIdx], this.scales[sIdx + 1], this.scales[sIdx + 2]];

    const eOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    Mat4.fromTranslationRotationScale(pos, rot, sca, this.entityFloatView, eOffset);
  }

  setEntityActive(id: number, active: boolean): void {
    if (id < this.activeEntityCount) {
      const eOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
      this.entityUintView[eOffset + 22] = active ? 1 : 0;
      if (this.entityRecords[id]) {
        this.entityRecords[id].isActive = active;
      }
    }
  }

  clear(): void {
    this.activeEntityCount = 0;
    this.nextEntityId = 0;
    this.meshRegistry = [];
    this.materialCount = 0;
    this.totalJointsCount = 0;
    this.entityRecords = [];
    this.entityUintView.fill(0);
    this.indirectCommandsData.fill(0);
  }
}
