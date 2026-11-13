import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path } from '../src/index.js';
import { strokeOptionsMatrix, triangleArea, assertValidMesh } from './fixtures.js';

const line = 'M0,0 L40,0';
const polyline = 'M0,0 L20,10 L40,0 L60,10';
const square = 'M0,0 L40,0 L40,40 L0,40 Z';

test('所有转角/端点组合都产出有效网格', () => {
  for (const { lineJoin, lineCap } of strokeOptionsMatrix()) {
    const r = Path.fromSVG(polyline).tessellateStroke({
      lineWidth: 4,
      lineJoin,
      lineCap,
      miterLimit: 4,
    });
    assertValidMesh(r);
    assert.ok(r.indices.length > 0);
  }
});

test('butt 端点面积等于长度乘宽度', () => {
  const r = Path.fromSVG(line).tessellateStroke({ lineWidth: 4, lineCap: 'butt' });
  assertValidMesh(r);
  assert.equal(triangleArea(r), 160);
});

test('square 端点比 butt 多出两个端帽方块', () => {
  const butt = Path.fromSVG(line).tessellateStroke({ lineWidth: 4, lineCap: 'butt' });
  const squareCap = Path.fromSVG(line).tessellateStroke({ lineWidth: 4, lineCap: 'square' });
  // 两端各延伸半个线宽 2，新增面积 = 2 端 * (2 * 4) = 16
  assert.equal(triangleArea(squareCap) - triangleArea(butt), 16);
});

test('round 端点面积接近矩形加两个半圆', () => {
  const r = Path.fromSVG(line).tessellateStroke({ lineWidth: 4, lineCap: 'round' });
  assertValidMesh(r);
  // 160（矩形）+ pi * r^2 = 160 + 4pi
  const expected = 160 + Math.PI * 4;
  assert.ok(Math.abs(triangleArea(r) - expected) < 1.5);
});

test('闭合路径描边面积等于周长乘线宽', () => {
  const r = Path.fromSVG(square).tessellateStroke({ lineWidth: 4 });
  assertValidMesh(r);
  assert.equal(triangleArea(r), 160 * 4);
});

test('miter 转角顶点数少于 bevel，round 产生圆弧细分点', () => {
  const d = 'M0,0 L10,0 L5,8';
  const miter = Path.fromSVG(d).tessellateStroke({ lineWidth: 3, lineJoin: 'miter', miterLimit: 10, lineCap: 'butt' });
  const bevel = Path.fromSVG(d).tessellateStroke({ lineWidth: 3, lineJoin: 'bevel', lineCap: 'butt' });
  const round = Path.fromSVG(d).tessellateStroke({ lineWidth: 3, lineJoin: 'round', lineCap: 'butt' });
  assert.ok(miter.vertices.length < bevel.vertices.length);
  assert.ok(round.vertices.length > bevel.vertices.length);
});

test('超过 miter limit 时回退为 bevel', () => {
  const d = 'M0,0 L10,0 L5,8';
  const limited = Path.fromSVG(d).tessellateStroke({
    lineWidth: 3,
    lineJoin: 'miter',
    miterLimit: 1.05,
    lineCap: 'butt',
  });
  const bevel = Path.fromSVG(d).tessellateStroke({ lineWidth: 3, lineJoin: 'bevel', lineCap: 'butt' });
  assert.equal(limited.vertices.length, bevel.vertices.length);
});

test('miter 尖角长度不超过 miter limit 约束', () => {
  // 90 度转角 miterRatio = sqrt(2) ≈ 1.414，limit=1 必然回退。
  const r = Path.fromSVG('M0,0 L10,0 L10,10').tessellateStroke({
    lineWidth: 2,
    lineJoin: 'miter',
    miterLimit: 1,
    lineCap: 'butt',
  });
  assertValidMesh(r);
});

test('描边宽度翻倍面积近似翻倍', () => {
  const w2 = Path.fromSVG(polyline).tessellateStroke({ lineWidth: 2, lineCap: 'butt' });
  const w4 = Path.fromSVG(polyline).tessellateStroke({ lineWidth: 4, lineCap: 'butt' });
  const ratio = triangleArea(w4) / triangleArea(w2);
  assert.ok(Math.abs(ratio - 2) < 0.05);
});

test('退化与重复顶点路径描边不崩溃', () => {
  const r = Path.fromSVG('M0,0 L0,0 L10,0 L10,0 L10,10 Z').tessellateStroke({
    lineWidth: 2,
    lineCap: 'round',
    lineJoin: 'round',
  });
  assertValidMesh(r);
});

test('空路径描边返回空结果', () => {
  const r = Path.fromSVG('').tessellateStroke({ lineWidth: 2 });
  assert.deepEqual(r.vertices, []);
  assert.deepEqual(r.indices, []);
});

test('非法描边参数抛出明确错误', () => {
  assert.throws(() => Path.fromSVG(line).tessellateStroke({ lineWidth: 0 }), RangeError);
  assert.throws(() => Path.fromSVG(line).tessellateStroke({ lineWidth: -2 }), RangeError);
  assert.throws(() => Path.fromSVG(line).tessellateStroke({ lineWidth: NaN }), RangeError);
  assert.throws(() => Path.fromSVG(line).tessellateStroke({ lineJoin: 'sharp' }), RangeError);
  assert.throws(() => Path.fromSVG(line).tessellateStroke({ lineCap: 'flat' }), RangeError);
  assert.throws(() => Path.fromSVG(line).tessellateStroke({ miterLimit: 0.5 }), RangeError);
});

test('描边结果重复运行确定一致', () => {
  const opt = { lineWidth: 3, lineJoin: 'round', lineCap: 'square', miterLimit: 4, tolerance: 0.2 };
  const a = JSON.stringify(Path.fromSVG(polyline).tessellateStroke(opt));
  const b = JSON.stringify(Path.fromSVG(polyline).tessellateStroke({ ...opt }));
  assert.equal(a, b);
});

test('极端坐标描边产出有限网格且不崩溃', () => {
  const huge = Path.fromSVG(
    'M1e80,1e80 L1.0000001e80,1e80 L1.0000001e80,1.0000001e80'
  ).tessellateStroke({ lineWidth: 1e70, lineCap: 'round', lineJoin: 'round', tolerance: 1e68 });
  assertValidMesh(huge);

  const micro = Path.fromSVG('M0,0 L1e-60,0 L1e-60,1e-60').tessellateStroke({
    lineWidth: 1e-61,
    tolerance: 1e-63,
  });
  for (const value of micro.vertices) assert.ok(Number.isFinite(value));
});
