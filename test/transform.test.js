import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Path,
  identity,
  translate,
  scale,
  rotate,
  multiply,
  applyPoint,
  determinant,
  isInvertible,
  affine,
} from '../src/index.js';
import { triangleArea, assertValidMesh } from './fixtures.js';

test('恒等变换不改变坐标', () => {
  const p = applyPoint(identity(), 3, 7);
  assert.deepEqual(p, { x: 3, y: 7 });
});

test('平移矩阵正确映射点', () => {
  assert.deepEqual(applyPoint(translate(10, -5), 1, 2), { x: 11, y: -3 });
});

test('缩放矩阵正确映射点', () => {
  assert.deepEqual(applyPoint(scale(2, 3), 4, 5), { x: 8, y: 15 });
});

test('90 度旋转把 (1,0) 变为 (0,1)', () => {
  const p = applyPoint(rotate(Math.PI / 2), 1, 0);
  assert.ok(Math.abs(p.x) < 1e-12);
  assert.ok(Math.abs(p.y - 1) < 1e-12);
});

test('绕指定中心旋转保持中心不动', () => {
  const m = rotate(Math.PI / 4, 10, 10);
  const p = applyPoint(m, 10, 10);
  assert.ok(Math.abs(p.x - 10) < 1e-12);
  assert.ok(Math.abs(p.y - 10) < 1e-12);
});

test('矩阵乘法满足先平移后旋转的复合语义', () => {
  const m = multiply(rotate(Math.PI / 2), translate(5, 0));
  const p = applyPoint(m, 0, 0);
  assert.ok(Math.abs(p.x) < 1e-12);
  assert.ok(Math.abs(p.y - 5) < 1e-12);
});

test('transform 返回新 Path 且不修改原对象', () => {
  const original = Path.fromSVG('M0,0 L10,0 L10,10 Z');
  const before = JSON.stringify(original.commands);
  const moved = original.transform(translate(1, 2));
  assert.equal(JSON.stringify(original.commands), before);
  assert.notEqual(moved, original);
  assert.equal(moved.commands[0].x, 1);
  assert.equal(moved.commands[0].y, 2);
});

test('变换作用于曲线控制点与端点', () => {
  const moved = Path.fromSVG('M0,0 C1,2 3,4 5,6').transform(scale(2, 2));
  const cubic = moved.commands[1];
  assert.deepEqual(cubic.c1, { x: 2, y: 4 });
  assert.deepEqual(cubic.c2, { x: 6, y: 8 });
  assert.deepEqual(cubic.end, { x: 10, y: 12 });
});

test('均匀缩放保持填充面积按平方变化', () => {
  const base = Path.fromSVG('M0,0 L10,0 L10,10 L0,10 Z').tessellateFill();
  const doubled = Path.fromSVG('M0,0 L10,0 L10,10 L0,10 Z')
    .transform(scale(2, 2))
    .tessellateFill();
  assertValidMesh(doubled);
  assert.equal(triangleArea(doubled), triangleArea(base) * 4);
});

test('平移不改变填充面积', () => {
  const base = Path.fromSVG('M0,0 L10,0 L10,10 L0,10 Z').tessellateFill();
  const moved = Path.fromSVG('M0,0 L10,0 L10,10 L0,10 Z')
    .transform(translate(100, -50))
    .tessellateFill();
  assert.equal(triangleArea(moved), triangleArea(base));
});

test('行列式为零的变换可被检测为不可逆', () => {
  assert.equal(isInvertible(scale(1, 1)), true);
  assert.equal(isInvertible(affine(1, 2, 2, 4, 0, 0)), false);
  assert.equal(determinant(scale(2, 3)), 6);
});

test('非有限变换参数抛出 RangeError', () => {
  assert.throws(() => translate(NaN, 0), RangeError);
  assert.throws(() => scale(Infinity, 1), RangeError);
  assert.throws(() => affine(1, 0, 0, 1, 0, undefined), RangeError);
});

test('transform 拒绝错误形状的矩阵', () => {
  assert.throws(() => Path.fromSVG('M0,0 L1,1').transform([1, 0, 0, 1]), TypeError);
  assert.throws(() => Path.fromSVG('M0,0 L1,1').transform('nope'), TypeError);
});

test('变换后的极端坐标仍产出有限网格', () => {
  const r = Path.fromSVG('M0,0 L1,0 L1,1 L0,1 Z')
    .transform(scale(1e9, 1e9))
    .tessellateFill({ tolerance: 1 });
  assertValidMesh(r);
});
