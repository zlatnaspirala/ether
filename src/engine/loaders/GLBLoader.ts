/**
 * Destroyer Engine - Fast Binary GLB (glTF 2.0) Loader
 * Pure TypeScript, zero external dependencies.
 * Parses vertex positions, normals, UVs, morph targets, joints/weights, materials, and animations.
 */

import { AnimationChannel, AnimationClip, FlatMaterial, MorphTargetData, SkeletonJoint } from '../core/Types';

export interface ParsedGLBPrimitive {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  joints?: Uint32Array; // 4 uints per vertex
  weights?: Float32Array; // 4 floats per vertex
  morphTargets?: MorphTargetData[];
  material?: FlatMaterial;
  boundingRadius: number;
}

export interface ParsedGLBResult {
  primitives: ParsedGLBPrimitive[];
  joints: SkeletonJoint[];
  clips: AnimationClip[];
}

export class GLBLoader {
  /**
   * Parse an ArrayBuffer representing a .glb file
   */
  static parse(arrayBuffer: ArrayBuffer): ParsedGLBResult {
    const dataView = new DataView(arrayBuffer);

    // 1. Header (12 bytes)
    const magic = dataView.getUint32(0, true);
    if (magic !== 0x46546c67) { // "glTF"
      throw new Error('Invalid GLB file: Magic signature mismatch (expected 0x46546C67)');
    }

    const version = dataView.getUint32(4, true);
    if (version !== 2) {
      throw new Error(`Unsupported GLB version: ${version} (expected version 2)`);
    }

    const totalLength = dataView.getUint32(8, true);
    let byteOffset = 12;

    let jsonChunk: any = null;
    let binBuffer: ArrayBuffer | null = null;

    // 2. Read Chunks
    while (byteOffset < totalLength && byteOffset < arrayBuffer.byteLength) {
      const chunkLength = dataView.getUint32(byteOffset, true);
      const chunkType = dataView.getUint32(byteOffset + 4, true);
      byteOffset += 8;

      if (chunkType === 0x4e4f534a) { // "JSON"
        const jsonBytes = new Uint8Array(arrayBuffer, byteOffset, chunkLength);
        const jsonText = new TextDecoder('utf-8').decode(jsonBytes);
        jsonChunk = JSON.parse(jsonText);
      } else if (chunkType === 0x004e4942) { // "BIN\0"
        binBuffer = arrayBuffer.slice(byteOffset, byteOffset + chunkLength);
      }

      byteOffset += chunkLength;
    }

    if (!jsonChunk) {
      throw new Error('GLB parser error: Missing JSON chunk');
    }
    if (!binBuffer) {
      binBuffer = new ArrayBuffer(0);
    }

    return GLBLoader.extractData(jsonChunk, binBuffer);
  }

  private static extractData(gltf: any, bin: ArrayBuffer): ParsedGLBResult {
    const primitives: ParsedGLBPrimitive[] = [];
    const getAccessorData = (accessorIdx: number): { data: any; count: number; componentType: number; type: string } => {
      const accessor = gltf.accessors[accessorIdx];
      const bufferView = gltf.bufferViews[accessor.bufferView];
      const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
      const count = accessor.count;

      const componentsPerType: Record<string, number> = {
        SCALAR: 1,
        VEC2: 2,
        VEC3: 3,
        VEC4: 4,
        MAT4: 16
      };
      const numComponents = componentsPerType[accessor.type] || 1;
      const totalElements = count * numComponents;

      if (accessor.componentType === 5126) { // FLOAT
        return {
          data: new Float32Array(bin, byteOffset, totalElements),
          count,
          componentType: accessor.componentType,
          type: accessor.type
        };
      } else if (accessor.componentType === 5123) { // UNSIGNED_SHORT
        return {
          data: new Uint16Array(bin, byteOffset, totalElements),
          count,
          componentType: accessor.componentType,
          type: accessor.type
        };
      } else if (accessor.componentType === 5125) { // UNSIGNED_INT
        return {
          data: new Uint32Array(bin, byteOffset, totalElements),
          count,
          componentType: accessor.componentType,
          type: accessor.type
        };
      } else if (accessor.componentType === 5121) { // UNSIGNED_BYTE
        return {
          data: new Uint8Array(bin, byteOffset, totalElements),
          count,
          componentType: accessor.componentType,
          type: accessor.type
        };
      }
      return {
        data: new Float32Array(bin, byteOffset, totalElements),
        count,
        componentType: accessor.componentType,
        type: accessor.type
      };
    };

    // Extract Materials
    const materials: FlatMaterial[] = [];
    if (gltf.materials) {
      for (const m of gltf.materials) {
        const pbr = m.pbrMetallicRoughness || {};
        const baseColor = pbr.baseColorFactor || [1, 1, 1, 1];
        const emissive = m.emissiveFactor || [0, 0, 0];
        materials.push({
          baseColor: [baseColor[0], baseColor[1], baseColor[2], baseColor[3] ?? 1.0],
          emissiveColor: [emissive[0], emissive[1], emissive[2], 1.0],
          roughness: pbr.roughnessFactor ?? 0.5,
          metallic: pbr.metallicFactor ?? 0.0,
          ao: 1.0,
          alphaCutoff: m.alphaCutoff ?? 0.5,
        });
      }
    }

    // Extract Meshes & Primitives
    if (gltf.meshes) {
      for (let mIdx = 0; mIdx < gltf.meshes.length; mIdx++) {
        const mesh = gltf.meshes[mIdx];
        const meshName = mesh.name || `GLB_Mesh_${mIdx}`;

        for (let pIdx = 0; pIdx < mesh.primitives.length; pIdx++) {
          const prim = mesh.primitives[pIdx];
          const attrs = prim.attributes;

          // Positions (required)
          if (attrs.POSITION === undefined) continue;
          const posAcc = getAccessorData(attrs.POSITION);
          const positions = new Float32Array(posAcc.data);
          const vertexCount = posAcc.count;

          // Calculate bounding radius
          let maxDistSq = 0;
          for (let i = 0; i < vertexCount; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];
            const distSq = x * x + y * y + z * z;
            if (distSq > maxDistSq) maxDistSq = distSq;
          }
          const boundingRadius = Math.max(0.5, Math.sqrt(maxDistSq));

          // Normals
          let normals: Float32Array;
          if (attrs.NORMAL !== undefined) {
            normals = new Float32Array(getAccessorData(attrs.NORMAL).data);
          } else {
            // Generate basic up normals
            normals = new Float32Array(vertexCount * 3);
            for (let i = 0; i < vertexCount; i++) {
              normals[i * 3 + 1] = 1.0;
            }
          }

          // UVs
          let uvs: Float32Array;
          if (attrs.TEXCOORD_0 !== undefined) {
            uvs = new Float32Array(getAccessorData(attrs.TEXCOORD_0).data);
          } else {
            uvs = new Float32Array(vertexCount * 2);
          }

          // Indices
          let indices: Uint32Array;
          if (prim.indices !== undefined) {
            const idxAcc = getAccessorData(prim.indices);
            if (idxAcc.data instanceof Uint32Array) {
              indices = idxAcc.data;
            } else {
              indices = new Uint32Array(idxAcc.data);
            }
          } else {
            indices = new Uint32Array(vertexCount);
            for (let i = 0; i < vertexCount; i++) indices[i] = i;
          }

          // Skinning Joints & Weights
          let joints: Uint32Array | undefined;
          let weights: Float32Array | undefined;
          if (attrs.JOINTS_0 !== undefined && attrs.WEIGHTS_0 !== undefined) {
            const jAcc = getAccessorData(attrs.JOINTS_0);
            const wAcc = getAccessorData(attrs.WEIGHTS_0);
            joints = new Uint32Array(jAcc.data);
            weights = new Float32Array(wAcc.data);
          }

          // Morph Targets (Blend Shapes)
          const morphTargets: MorphTargetData[] = [];
          if (prim.targets) {
            for (let tIdx = 0; tIdx < prim.targets.length; tIdx++) {
              const target = prim.targets[tIdx];
              if (target.POSITION !== undefined) {
                const targetPosData = new Float32Array(getAccessorData(target.POSITION).data);
                morphTargets.push({
                  name: `target_${tIdx}`,
                  deltaPositions: targetPosData
                });
              }
            }
          }

          // Material
          const mat = (prim.material !== undefined && materials[prim.material])
            ? materials[prim.material]
            : {
              baseColor: [0.75, 0.75, 0.8, 1.0] as [number, number, number, number],
              emissiveColor: [0, 0, 0, 0] as [number, number, number, number],
              roughness: 0.4,
              metallic: 0.1,
              ao: 1.0,
              alphaCutoff: 0.5
            };

          primitives.push({
            name: `${meshName}_prim_${pIdx}`,
            positions,
            normals,
            uvs,
            indices,
            joints,
            weights,
            morphTargets,
            material: mat,
            boundingRadius
          });
        }
      }
    }

    // Extract Skeletal Joints & Skins
    const joints: SkeletonJoint[] = [];
    if (gltf.skins && gltf.skins.length > 0) {
      const skin = gltf.skins[0];
      let invBindData: Float32Array | null = null;
      if (skin.inverseBindMatrices !== undefined) {
        invBindData = new Float32Array(getAccessorData(skin.inverseBindMatrices).data);
      }

      for (let jIdx = 0; jIdx < skin.joints.length; jIdx++) {
        const nodeIdx = skin.joints[jIdx];
        const node = gltf.nodes[nodeIdx] || {};

        const invMat = new Float32Array(16);
        if (invBindData) {
          invMat.set(invBindData.subarray(jIdx * 16, (jIdx + 1) * 16));
        } else {
          invMat[0] = 1; invMat[5] = 1; invMat[10] = 1; invMat[15] = 1;
        }

        const localMat = new Float32Array(16);
        localMat[0] = 1; localMat[5] = 1; localMat[10] = 1; localMat[15] = 1;
        const worldMat = new Float32Array(localMat);

        joints.push({
          name: node.name || `Joint_${jIdx}`,
          parentIndex: -1, // will link
          inverseBindMatrix: invMat,
          localMatrix: localMat,
          worldMatrix: worldMat
        });
      }
    }

    // Extract Animations
    const clips: AnimationClip[] = [];
    if (gltf.animations) {
      for (let aIdx = 0; aIdx < gltf.animations.length; aIdx++) {
        const anim = gltf.animations[aIdx];
        const channels: AnimationChannel[] = [];
        let maxDuration = 0;

        for (const ch of anim.channels) {
          const sampler = anim.samplers[ch.sampler];
          const timeData = new Float32Array(getAccessorData(sampler.input).data);
          const valData = new Float32Array(getAccessorData(sampler.output).data);

          const duration = timeData[timeData.length - 1] || 0;
          if (duration > maxDuration) maxDuration = duration;

          channels.push({
            targetNode: ch.target.node ?? 0,
            path: ch.target.path,
            times: timeData,
            values: valData,
            interpolation: sampler.interpolation || 'LINEAR'
          });
        }

        clips.push({
          name: anim.name || `Clip_${aIdx}`,
          duration: maxDuration,
          channels
        });
      }
    }

    return { primitives, joints, clips };
  }
}
