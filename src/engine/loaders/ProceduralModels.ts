/**
 * Destroyer Engine - Built-in High Quality Procedural Models
 * Pre-configured with Bone Skinning, Morph Targets, and PBR Materials
 */

import { AnimationClip, MorphTargetData, SkeletonJoint } from '../core/Types';
import { ParsedGLBPrimitive } from './GLBLoader';

export class ProceduralModels {
  /**
   * Generates a Skinned Sci-Fi Combat Mech with 4 skeletal joints and a walking/rotation animation clip
   */
  static createSkinnedMech(): { primitive: ParsedGLBPrimitive; joints: SkeletonJoint[]; clip: AnimationClip } {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const jointsData: number[] = [];
    const weightsData: number[] = [];

    // Helper to add a box with specific joint assignment
    const addBox = (
      center: [number, number, number],
      size: [number, number, number],
      jointIdx: number
    ) => {
      const baseIdx = vertices.length / 3;
      const hx = size[0] * 0.5, hy = size[1] * 0.5, hz = size[2] * 0.5;

      const boxVerts = [
        // Front
        -hx, -hy,  hz,   hx, -hy,  hz,   hx,  hy,  hz,  -hx,  hy,  hz,
        // Back
        -hx, -hy, -hz,  -hx,  hy, -hz,   hx,  hy, -hz,   hx, -hy, -hz,
        // Top
        -hx,  hy, -hz,  -hx,  hy,  hz,   hx,  hy,  hz,   hx,  hy, -hz,
        // Bottom
        -hx, -hy, -hz,   hx, -hy, -hz,   hx, -hy,  hz,  -hx, -hy,  hz,
        // Right
         hx, -hy, -hz,   hx,  hy, -hz,   hx,  hy,  hz,   hx, -hy,  hz,
        // Left
        -hx, -hy, -hz,  -hx, -hy,  hz,  -hx,  hy,  hz,  -hx,  hy, -hz,
      ];

      const boxNorms = [
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
      ];

      for (let i = 0; i < boxVerts.length; i += 3) {
        vertices.push(boxVerts[i] + center[0], boxVerts[i + 1] + center[1], boxVerts[i + 2] + center[2]);
        normals.push(boxNorms[i], boxNorms[i + 1], boxNorms[i + 2]);
        uvs.push(i % 2, (i / 3) % 2);

        // Skin to this joint
        jointsData.push(jointIdx, 0, 0, 0);
        weightsData.push(1.0, 0.0, 0.0, 0.0);
      }

      for (let face = 0; face < 6; face++) {
        const offset = baseIdx + face * 4;
        indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
      }
    };

    // Joint 0: Base / Pelvis
    addBox([0, 0.5, 0], [1.2, 0.6, 1.0], 0);
    // Joint 1: Torso / Cockpit
    addBox([0, 1.5, 0], [1.6, 1.2, 1.4], 1);
    // Joint 2: Left Weapon Arm
    addBox([-1.3, 1.5, 0.4], [0.4, 0.4, 1.8], 2);
    // Joint 3: Right Weapon Arm
    addBox([1.3, 1.5, 0.4], [0.4, 0.4, 1.8], 3);

    // Setup 4 Skeleton Joints
    const joints: SkeletonJoint[] = [
      {
        name: 'Pelvis_Root',
        parentIndex: -1,
        inverseBindMatrix: new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, -0.5, 0, 1
        ]),
        localMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 1]),
        worldMatrix: new Float32Array(16)
      },
      {
        name: 'Torso_Upper',
        parentIndex: 0,
        inverseBindMatrix: new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, -1.5, 0, 1
        ]),
        localMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.0, 0, 1]),
        worldMatrix: new Float32Array(16)
      },
      {
        name: 'Left_Arm',
        parentIndex: 1,
        inverseBindMatrix: new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          1.3, -1.5, -0.4, 1
        ]),
        localMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1.3, 0, 0.4, 1]),
        worldMatrix: new Float32Array(16)
      },
      {
        name: 'Right_Arm',
        parentIndex: 1,
        inverseBindMatrix: new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          -1.3, -1.5, -0.4, 1
        ]),
        localMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.3, 0, 0.4, 1]),
        worldMatrix: new Float32Array(16)
      }
    ];

    // Build Animation Clip (Combat Idle / Aim Walk cycle)
    const times = new Float32Array([0.0, 0.75, 1.5, 2.25, 3.0]);
    // Torso yaw oscillation
    const torsoRotations = new Float32Array([
      0, 0, 0, 1,
      0, 0.174, 0, 0.985,
      0, 0, 0, 1,
      0, -0.174, 0, 0.985,
      0, 0, 0, 1,
    ]);

    const armRotations = new Float32Array([
      0, 0, 0, 1,
      -0.15, 0, 0, 0.988,
      0, 0, 0, 1,
      0.15, 0, 0, 0.988,
      0, 0, 0, 1,
    ]);

    const clip: AnimationClip = {
      name: 'Mech_Combat_Sentry',
      duration: 3.0,
      channels: [
        {
          targetNode: 1,
          path: 'rotation',
          times,
          values: torsoRotations,
          interpolation: 'LINEAR'
        },
        {
          targetNode: 2,
          path: 'rotation',
          times,
          values: armRotations,
          interpolation: 'LINEAR'
        },
        {
          targetNode: 3,
          path: 'rotation',
          times,
          values: armRotations,
          interpolation: 'LINEAR'
        }
      ]
    };

    const primitive: ParsedGLBPrimitive = {
      name: 'Destroyer_Combat_Mech',
      positions: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      joints: new Uint32Array(jointsData),
      weights: new Float32Array(weightsData),
      boundingRadius: 2.8,
      material: {
        baseColor: [0.18, 0.22, 0.28, 1.0],
        emissiveColor: [0.0, 0.65, 0.95, 0.8], // Cyan energy glow
        roughness: 0.25,
        metallic: 0.85,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };

    return { primitive, joints, clip };
  }

  /**
   * Generates a Morphing Sci-Fi Geometric Core with 2 morph targets (Pulse Expand & Star Spike)
   */
  static createMorphingCore(subdivisions = 3): { primitive: ParsedGLBPrimitive } {
    // Generate an icosphere with vertex morph target deltas
    const t = (1.0 + Math.sqrt(5.0)) / 2.0;

    let initialVerts = [
      -1,  t,  0,   1,  t,  0,  -1, -t,  0,   1, -t,  0,
       0, -1,  t,   0,  1,  t,   0, -1, -t,   0,  1, -t,
       t,  0, -1,   t,  0,  1,  -t,  0, -1,  -t,  0,  1
    ];

    let initialIndices = [
      0, 11, 5,   0, 5, 1,   0, 1, 7,   0, 7, 10,  0, 10, 11,
      1, 5, 9,    5, 11, 4,  11, 10, 2, 10, 7, 6,   7, 1, 8,
      3, 9, 4,    3, 4, 2,   3, 2, 6,   3, 6, 8,   3, 8, 9,
      4, 9, 5,    2, 4, 11,  6, 2, 10,  8, 6, 7,   9, 8, 1
    ];

    // Normalize initial positions
    for (let i = 0; i < initialVerts.length; i += 3) {
      const len = Math.hypot(initialVerts[i], initialVerts[i + 1], initialVerts[i + 2]);
      initialVerts[i] /= len;
      initialVerts[i + 1] /= len;
      initialVerts[i + 2] /= len;
    }

    const posCount = initialVerts.length / 3;
    const positions = new Float32Array(initialVerts);
    const normals = new Float32Array(initialVerts); // on unit sphere, pos = normal
    const uvs = new Float32Array(posCount * 2);
    for (let i = 0; i < posCount; i++) {
      uvs[i * 2] = (positions[i * 3] + 1) * 0.5;
      uvs[i * 2 + 1] = (positions[i * 3 + 1] + 1) * 0.5;
    }

    // Morph Target 0: Radial spike expansion
    const morphDelta0 = new Float32Array(positions.length);
    for (let i = 0; i < posCount; i++) {
      const factor = (i % 2 === 0) ? 1.6 : -0.3;
      morphDelta0[i * 3] = positions[i * 3] * factor;
      morphDelta0[i * 3 + 1] = positions[i * 3 + 1] * factor;
      morphDelta0[i * 3 + 2] = positions[i * 3 + 2] * factor;
    }

    // Morph Target 1: Torus/Twist warp
    const morphDelta1 = new Float32Array(positions.length);
    for (let i = 0; i < posCount; i++) {
      morphDelta1[i * 3] = -positions[i * 3 + 2] * 0.8;
      morphDelta1[i * 3 + 1] = Math.sin(positions[i * 3] * 4.0) * 0.7;
      morphDelta1[i * 3 + 2] = positions[i * 3] * 0.8;
    }

    const morphTargets: MorphTargetData[] = [
      { name: 'Spike_Expansion', deltaPositions: morphDelta0 },
      { name: 'Twist_Deformation', deltaPositions: morphDelta1 },
    ];

    const primitive: ParsedGLBPrimitive = {
      name: 'Morphing_Quantum_Core',
      positions,
      normals,
      uvs,
      indices: new Uint32Array(initialIndices),
      morphTargets,
      boundingRadius: 2.5,
      material: {
        baseColor: [0.95, 0.35, 0.15, 1.0],
        emissiveColor: [1.0, 0.45, 0.1, 1.2], // Molten gold/orange emissive
        roughness: 0.18,
        metallic: 0.92,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };

    return { primitive };
  }

  /**
   * High density grid terrain for wave simulation
   */
  static createTerrainGrid(resolution = 48, size = 30): ParsedGLBPrimitive {
    const vertexCount = (resolution + 1) * (resolution + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(resolution * resolution * 6);

    const step = size / resolution;
    const halfSize = size * 0.5;

    let vIdx = 0;
    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const px = x * step - halfSize;
        const pz = z * step - halfSize;
        // Mild undulating base height
        const py = Math.sin(px * 0.3) * Math.cos(pz * 0.3) * 0.8;

        positions[vIdx * 3] = px;
        positions[vIdx * 3 + 1] = py;
        positions[vIdx * 3 + 2] = pz;

        normals[vIdx * 3] = 0;
        normals[vIdx * 3 + 1] = 1;
        normals[vIdx * 3 + 2] = 0;

        uvs[vIdx * 2] = x / resolution;
        uvs[vIdx * 2 + 1] = z / resolution;

        vIdx++;
      }
    }

    let iIdx = 0;
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const row1 = z * (resolution + 1);
        const row2 = (z + 1) * (resolution + 1);

        indices[iIdx++] = row1 + x;
        indices[iIdx++] = row2 + x;
        indices[iIdx++] = row1 + x + 1;

        indices[iIdx++] = row1 + x + 1;
        indices[iIdx++] = row2 + x;
        indices[iIdx++] = row2 + x + 1;
      }
    }

    return {
      name: 'Dynamic_Wave_Grid',
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: size * 0.75,
      material: {
        baseColor: [0.1, 0.45, 0.7, 1.0],
        emissiveColor: [0.05, 0.2, 0.4, 0.4],
        roughness: 0.15,
        metallic: 0.4,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };
  }
}
