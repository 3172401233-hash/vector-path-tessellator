// 仿射变换矩阵，采用 SVG/Canvas 的 6 元素约定 [a, b, c, d, e, f]：
// x' = a*x + c*y + e
// y' = b*x + d*y + f

import { assertFinite } from './math-utils.js';

export function identity() {
  return [1, 0, 0, 1, 0, 0];
}

export function affine(a, b, c, d, e, f) {
  const m = [a, b, c, d, e, f];
  for (let i = 0; i < 6; i += 1) {
    assertFinite(m[i], `matrix[${i}]`);
  }
  return m;
}

export function translate(tx, ty) {
  assertFinite(tx, 'tx');
  assertFinite(ty, 'ty');
  return [1, 0, 0, 1, tx, ty];
}

export function scale(sx, sy = sx) {
  assertFinite(sx, 'sx');
  assertFinite(sy, 'sy');
  return [sx, 0, 0, sy, 0, 0];
}

export function rotate(rad, cx = 0, cy = 0) {
  assertFinite(rad, 'rad');
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  if (cx === 0 && cy === 0) {
    return [cos, sin, -sin, cos, 0, 0];
  }
  assertFinite(cx, 'cx');
  assertFinite(cy, 'cy');
  // translate(cx,cy) * rotate * translate(-cx,-cy)
  return [
    cos,
    sin,
    -sin,
    cos,
    cx - cos * cx + sin * cy,
    cy - sin * cx - cos * cy,
  ];
}

export function skewX(rad) {
  assertFinite(rad, 'rad');
  return [1, 0, Math.tan(rad), 1, 0, 0];
}

export function skewY(rad) {
  assertFinite(rad, 'rad');
  return [1, Math.tan(rad), 0, 1, 0, 0];
}

// 矩阵乘法：先应用 m2 再应用 m1，返回 m1 * m2。
export function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyPoint(m, x, y) {
  const [a, b, c, d, e, f] = m;
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  };
}

// 行列式为零表示变换不可逆（会把平面压成线/点）。
export function determinant(m) {
  const [a, b, c, d] = m;
  return a * d - b * c;
}

export function isInvertible(m) {
  return Number.isFinite(determinant(m)) && determinant(m) !== 0;
}
