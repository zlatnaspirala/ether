/**
 * Destroyer Engine - Vertex Animation System
 * Handles:
 * 1. GPU Morph Targets (Blend Shapes) with interpolation & weight control
 * 2. Skeletal Joint Skinning with animation clip evaluation
 * 3. Procedural Harmonic Vertex Wave simulation
 */

import { Mat4 } from '../math/Mat4';
import { AnimationClip, MorphTargetData, SkeletonJoint } from '../core/Types';

export class VertexAnimationController {
  // Morph target state
  public morphWeights: Float32Array = new Float32Array(4); // Supports 4 active morph weights
  public morphTargets: MorphTargetData[] = [];

  // Skeletal skinning state
  public joints: SkeletonJoint[] = [];
  public clips: AnimationClip[] = [];
  public currentClipIndex = 0;
  public currentTime = 0;
  public isPlaying = true;
  public playbackSpeed = 1.0;

  // Procedural wave factor
  public waveFactor = 0.0;
  public waveSpeed = 1.0;

  constructor() {
    this.morphWeights[0] = 0.0;
    this.morphWeights[1] = 0.0;
    this.morphWeights[2] = 0.0;
    this.morphWeights[3] = 0.0;
  }

  setMorphWeight(index: number, weight: number): void {
    if (index >= 0 && index < this.morphWeights.length) {
      this.morphWeights[index] = Math.max(0, Math.min(1, weight));
    }
  }

  addClip(clip: AnimationClip): number {
    this.clips.push(clip);
    return this.clips.length - 1;
  }

  playClip(index: number): void {
    if (index >= 0 && index < this.clips.length) {
      this.currentClipIndex = index;
      this.currentTime = 0;
      this.isPlaying = true;
    }
  }

  update(deltaTimeSeconds: number, outJointMatrices?: Float32Array, jointMatrixOffset = 0): void {
    if (this.isPlaying && this.clips.length > 0) {
      const clip = this.clips[this.currentClipIndex];
      if (clip && clip.duration > 0) {
        this.currentTime = (this.currentTime + deltaTimeSeconds * this.playbackSpeed) % clip.duration;
        this.evaluateClip(clip, this.currentTime, outJointMatrices, jointMatrixOffset);
      }
    }
  }

  private evaluateClip(
    clip: AnimationClip,
    time: number,
    outMatrices?: Float32Array,
    offset = 0
  ): void {
    // Evaluate all animation channels
    for (const channel of clip.channels) {
      const times = channel.times;
      const values = channel.values;
      if (times.length === 0) continue;

      // Find keyframe interval
      let k0 = 0;
      let k1 = 0;
      while (k1 < times.length && times[k1] <= time) {
        k1++;
      }
      k0 = Math.max(0, k1 - 1);
      k1 = Math.min(times.length - 1, k1);

      const t0 = times[k0];
      const t1 = times[k1];
      const factor = (t1 > t0) ? (time - t0) / (t1 - t0) : 0;

      if (channel.path === 'weights') {
        // Morph target weights animation
        const w0 = values[k0];
        const w1 = values[k1];
        const weight = w0 + (w1 - w0) * factor;
        this.setMorphWeight(channel.targetNode, weight);
      } else if (channel.path === 'rotation') {
        // Slerp or nlerp quaternion
        const i0 = k0 * 4;
        const i1 = k1 * 4;
        const q0 = [values[i0], values[i0 + 1], values[i0 + 2], values[i0 + 3]];
        const q1 = [values[i1], values[i1 + 1], values[i1 + 2], values[i1 + 3]];
        // Fast nlerp
        let dot = q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3];
        if (dot < 0) {
          q1[0] = -q1[0]; q1[1] = -q1[1]; q1[2] = -q1[2]; q1[3] = -q1[3];
        }
        const qx = q0[0] + (q1[0] - q0[0]) * factor;
        const qy = q0[1] + (q1[1] - q0[1]) * factor;
        const qz = q0[2] + (q1[2] - q0[2]) * factor;
        const qw = q0[3] + (q1[3] - q0[3]) * factor;
        const len = 1 / (Math.hypot(qx, qy, qz, qw) || 1);

        if (this.joints[channel.targetNode]) {
          const joint = this.joints[channel.targetNode];
          Mat4.fromTranslationRotationScale(
            [0, 0, 0],
            [qx * len, qy * len, qz * len, qw * len],
            [1, 1, 1],
            joint.localMatrix
          );
        }
      }
    }

    // Update joint world matrices & compute skin matrices
    if (outMatrices && this.joints.length > 0) {
      const tempMat = new Float32Array(16);
      for (let i = 0; i < this.joints.length; i++) {
        const joint = this.joints[i];
        if (joint.parentIndex >= 0 && this.joints[joint.parentIndex]) {
          Mat4.multiply(this.joints[joint.parentIndex].worldMatrix, joint.localMatrix, joint.worldMatrix);
        } else {
          joint.worldMatrix.set(joint.localMatrix);
        }

        // Skin matrix = jointWorldMatrix * inverseBindMatrix
        Mat4.multiply(joint.worldMatrix, joint.inverseBindMatrix, tempMat);

        const outOffset = offset + i * 16;
        outMatrices.set(tempMat, outOffset);
      }
    }
  }
}
