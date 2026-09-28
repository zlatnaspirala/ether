/**
 * Destroyer Engine - High Performance Flat Matrix & Vector Math
 * Zero-allocation math operating on Float32Array
 */

export class Mat4 {
  static create(): Float32Array {
    const out = new Float32Array(16);
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
  }

  static identity(out: Float32Array): Float32Array {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  static perspective(fovRad: number, aspect: number, near: number, far: number, out: Float32Array): Float32Array {
    const f = 1.0 / Math.tan(fovRad / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = far * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = far * near * nf;
    out[15] = 0;
    return out;
  }

  static lookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number], out: Float32Array): Float32Array {
    let z0 = eye[0] - target[0];
    let z1 = eye[1] - target[1];
    let z2 = eye[2] - target[2];
    let len = 1 / Math.hypot(z0, z1, z2);
    z0 *= len; z1 *= len; z2 *= len;

    let x0 = up[1] * z2 - up[2] * z1;
    let x1 = up[2] * z0 - up[0] * z2;
    let x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2);
    if (!len) {
      x0 = 0; x1 = 0; x2 = 0;
    } else {
      len = 1 / len;
      x0 *= len; x1 *= len; x2 *= len;
    }

    let y0 = z1 * x2 - z2 * x1;
    let y1 = z2 * x0 - z0 * x2;
    let y2 = z0 * x1 - z1 * x0;
    len = Math.hypot(y0, y1, y2);
    if (len) {
      len = 1 / len;
      y0 *= len; y1 *= len; y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    out[15] = 1;
    return out;
  }

  static multiply(a: Float32Array, b: Float32Array, out: Float32Array): Float32Array {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  }

  static fromTranslationRotationScale(
    t: [number, number, number],
    q: [number, number, number, number], // x, y, z, w
    s: [number, number, number],
    out: Float32Array,
    offset = 0
  ): void {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;

    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    const sx = s[0];
    const sy = s[1];
    const sz = s[2];

    out[offset + 0] = (1 - (yy + zz)) * sx;
    out[offset + 1] = (xy + wz) * sx;
    out[offset + 2] = (xz - wy) * sx;
    out[offset + 3] = 0;

    out[offset + 4] = (xy - wz) * sy;
    out[offset + 5] = (1 - (xx + zz)) * sy;
    out[offset + 6] = (yz + wx) * sy;
    out[offset + 7] = 0;

    out[offset + 8] = (xz + wy) * sz;
    out[offset + 9] = (yz - wx) * sz;
    out[offset + 10] = (1 - (xx + yy)) * sz;
    out[offset + 11] = 0;

    out[offset + 12] = t[0];
    out[offset + 13] = t[1];
    out[offset + 14] = t[2];
    out[offset + 15] = 1;
  }

  /**
   * Extract 6 frustum planes (Ax + By + Cz + D = 0) from View-Projection matrix
   * Format: 6 planes * 4 floats (x, y, z, w/distance) normalized
   */
  static extractFrustumPlanes(vp: Float32Array, outPlanes: Float32Array): void {
    // Left: row3 + row0
    outPlanes[0] = vp[3] + vp[0];
    outPlanes[1] = vp[7] + vp[4];
    outPlanes[2] = vp[11] + vp[8];
    outPlanes[3] = vp[15] + vp[12];

    // Right: row3 - row0
    outPlanes[4] = vp[3] - vp[0];
    outPlanes[5] = vp[7] - vp[4];
    outPlanes[6] = vp[11] - vp[8];
    outPlanes[7] = vp[15] - vp[12];

    // Bottom: row3 + row1
    outPlanes[8] = vp[3] + vp[1];
    outPlanes[9] = vp[7] + vp[5];
    outPlanes[10] = vp[11] + vp[9];
    outPlanes[11] = vp[15] + vp[13];

    // Top: row3 - row1
    outPlanes[12] = vp[3] - vp[1];
    outPlanes[13] = vp[7] - vp[5];
    outPlanes[14] = vp[11] - vp[9];
    outPlanes[15] = vp[15] - vp[13];

    // Near: row2 (WebGPU near plane is 0 <= z <= w)
    outPlanes[16] = vp[2];
    outPlanes[17] = vp[6];
    outPlanes[18] = vp[10];
    outPlanes[19] = vp[14];

    // Far: row3 - row2
    outPlanes[20] = vp[3] - vp[2];
    outPlanes[21] = vp[7] - vp[6];
    outPlanes[22] = vp[11] - vp[10];
    outPlanes[23] = vp[15] - vp[14];

    // Normalize planes
    for (let i = 0; i < 6; i++) {
      const idx = i * 4;
      const len = Math.hypot(outPlanes[idx], outPlanes[idx + 1], outPlanes[idx + 2]);
      if (len > 0.00001) {
        const inv = 1.0 / len;
        outPlanes[idx] *= inv;
        outPlanes[idx + 1] *= inv;
        outPlanes[idx + 2] *= inv;
        outPlanes[idx + 3] *= inv;
      }
    }
  }
}
