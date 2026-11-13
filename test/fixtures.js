// 测试夹具：全部由代码生成，保证可复现、确定性，不依赖外部资源。

import assert from 'node:assert/strict';

// 生成轴对齐矩形的 SVG path 数据。
export function rectPath(x, y, w, h) {
  return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
}

// 生成绕 (cx, cy) 的正 n 边形（用三次贝塞尔逼近圆的替代：这里给多边形）。
export function polygonPath(cx, cy, radius, sides) {
  const pts = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`)
    .join(' ') + ' Z';
}

// 三次贝塞尔组成的封闭曲线形状（花瓣），用于曲线误差测试。
export function curvePath() {
  return [
    'M0,0',
    'C10,-20 30,-20 40,0',
    'C30,20 10,20 0,0',
    'Z',
  ].join(' ');
}

// 带孔形状：外框 + 反向内框。
export function holePath(outer = 50, inner = 30) {
  const o = outer / 2;
  const i = inner / 2;
  return [
    `M${-o},${-o} L${o},${-o} L${o},${o} L${-o},${o} Z`,
    `M${-i},${-i} L${-i},${i} L${i},${i} L${i},${-i} Z`,
  ].join(' ');
}

// 自交蝴蝶结路径。
export function bowtiePath(size = 10) {
  const s = size;
  return `M0,0 L${s},${s} L${s},0 L0,${s} Z`;
}

// 带退化段与重复顶点的路径。
export function degeneratePath() {
  return 'M0,0 L0,0 L10,0 L10,0 L10,10 L0,10 Z';
}

// 一组覆盖各种命令（含相对命令、H/V）的路径。
export function mixedCommandsPath() {
  return [
    'M0,0',
    'h20', // 相对水平线
    'v15', // 相对垂直线
    'l-8,5',
    'c-4,2 -4,8 0,10',
    'q-6,3 -12,0',
    'Z',
  ].join(' ');
}

// 全部描边转角/端点组合。
export function strokeOptionsMatrix() {
  const joins = ['miter', 'round', 'bevel'];
  const caps = ['butt', 'round', 'square'];
  const combos = [];
  for (const lineJoin of joins) {
    for (const lineCap of caps) {
      combos.push({ lineJoin, lineCap });
    }
  }
  return combos;
}

// 计算三角化结果的有符号面积之和（逆时针为正）。
export function triangleArea(result) {
  const v = result.vertices;
  let area2 = 0;
  for (let i = 0; i < result.indices.length; i += 3) {
    const a = result.indices[i];
    const b = result.indices[i + 1];
    const c = result.indices[i + 2];
    area2 +=
      (v[b * 2] - v[a * 2]) * (v[c * 2 + 1] - v[a * 2 + 1]) -
      (v[b * 2 + 1] - v[a * 2 + 1]) * (v[c * 2] - v[a * 2]);
  }
  return area2 / 2;
}

// 校验通用输出不变量：有限、索引合法、无重复索引、无重复三角形、全部逆时针。
export function assertValidMesh(result) {
  const { vertices, indices } = result;
  assert.ok(vertices.length % 2 === 0);
  for (const value of vertices) {
    assert.ok(Number.isFinite(value), '顶点必须有限');
  }
  const vertexCount = vertices.length / 2;
  const seen = new Set();
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    for (const idx of tri) {
      assert.ok(Number.isInteger(idx) && idx >= 0 && idx < vertexCount, '索引必须合法');
    }
    assert.notEqual(tri[0], tri[1]);
    assert.notEqual(tri[1], tri[2]);
    assert.notEqual(tri[0], tri[2]);
    const key = [...tri].sort((a, b) => a - b).join(',');
    assert.ok(!seen.has(key), '不能出现重复三角形');
    seen.add(key);
    const area2 =
      (vertices[tri[1] * 2] - vertices[tri[0] * 2]) *
        (vertices[tri[2] * 2 + 1] - vertices[tri[0] * 2 + 1]) -
      (vertices[tri[1] * 2 + 1] - vertices[tri[0] * 2 + 1]) *
        (vertices[tri[2] * 2] - vertices[tri[0] * 2]);
    assert.ok(area2 > 0, '三角形必须逆时针且非退化');
  }
}
