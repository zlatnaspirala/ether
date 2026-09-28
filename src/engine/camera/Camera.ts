/**
 * Destroyer Engine - Orbit & Free Camera with Frustum Extraction
 * Extracts 6 normalized planes for WebGPU compute culling
 */

import { Mat4 } from '../math/Mat4';

export class Camera {
  public position: [number, number, number] = [0, 8, 18];
  public target: [number, number, number] = [0, 1, 0];
  public up: [number, number, number] = [0, 1, 0];

  public fovRad = (55 * Math.PI) / 180;
  public aspect = 16 / 9;
  public near = 0.1;
  public far = 1000.0;

  public viewMatrix = Mat4.create();
  public projMatrix = Mat4.create();
  public viewProjMatrix = Mat4.create();

  // 6 planes * 4 floats = 24 floats
  public frustumPlanes = new Float32Array(24);

  // Orbit parameters
  public radius = 22;
  public theta = 0.5; // horizontal angle
  public phi = 0.45;  // vertical elevation
  public autoOrbit = false;
  public orbitSpeed = 0.35;

  // Frustum freeze mode (for culling visualizer)
  public isFrustumFrozen = false;
  public frozenFrustumPlanes = new Float32Array(24);

  constructor() {
    this.updatePositionFromSpherical();
    this.updateMatrices();
  }

  public updatePositionFromSpherical(): void {
    // Clamp phi to prevent gimbal lock
    this.phi = Math.max(0.01, Math.min(Math.PI * 0.48, this.phi));

    const x = this.target[0] + this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.target[1] + this.radius * Math.cos(this.phi);
    const z = this.target[2] + this.radius * Math.sin(this.phi) * Math.cos(this.theta);

    this.position[0] = x;
    this.position[1] = y;
    this.position[2] = z;
  }

  public updateMatrices(): void {
    Mat4.lookAt(this.position, this.target, this.up, this.viewMatrix);
    Mat4.perspective(this.fovRad, this.aspect, this.near, this.far, this.projMatrix);
    Mat4.multiply(this.projMatrix, this.viewMatrix, this.viewProjMatrix);

    if (!this.isFrustumFrozen) {
      Mat4.extractFrustumPlanes(this.viewProjMatrix, this.frustumPlanes);
      this.frozenFrustumPlanes.set(this.frustumPlanes);
    }
  }

  public update(deltaTime: number): void {
    if (this.autoOrbit) {
      this.theta += this.orbitSpeed * deltaTime;
      this.updatePositionFromSpherical();
    }
    this.updateMatrices();
  }

  public setAspect(aspect: number): void {
    this.aspect = aspect;
    this.updateMatrices();
  }

  public orbit(deltaTheta: number, deltaPhi: number): void {
    this.theta += deltaTheta;
    this.phi += deltaPhi;
    this.updatePositionFromSpherical();
    this.updateMatrices();
  }

  public pan(deltaX: number, deltaY: number): void {
    // Pan parallel to camera view plane
    const forwardX = this.target[0] - this.position[0];
    const forwardZ = this.target[2] - this.position[2];
    const len = Math.hypot(forwardX, forwardZ) || 1;
    const rightX = forwardZ / len;
    const rightZ = -forwardX / len;

    const panScale = this.radius * 0.002;
    this.target[0] += (rightX * deltaX) * panScale;
    this.target[1] -= deltaY * panScale;
    this.target[2] += (rightZ * deltaX) * panScale;

    this.updatePositionFromSpherical();
    this.updateMatrices();
  }

  public zoom(deltaRadius: number): void {
    this.radius = Math.max(2.0, Math.min(250.0, this.radius + deltaRadius));
    this.updatePositionFromSpherical();
    this.updateMatrices();
  }

  public toggleFrustumFreeze(): boolean {
    this.isFrustumFrozen = !this.isFrustumFrozen;
    if (!this.isFrustumFrozen) {
      Mat4.extractFrustumPlanes(this.viewProjMatrix, this.frustumPlanes);
    }
    return this.isFrustumFrozen;
  }
}
