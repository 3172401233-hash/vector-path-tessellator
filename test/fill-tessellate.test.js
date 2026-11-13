import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path } from '../src/index.js';
import {
  rectPath,
  holePath,
  bowtiePath,
  degeneratePath,
  polygonPath,
  triangleArea,
  assertValidMesh,
} from './fixtures.js';

test('矩形填充为两个逆时针三角形且面积正确', () => {
  const r = Path.fromSVG(rectPath(0, 0, 40, 40)).tessellateFill();
  assertValidMesh(r);
  assert.equal(r.indices.length / 3, 2);
  assert.equal(triangleArea(r), 1600);
});

test('nonzero 与 evenodd 对简单矩形结果一致', () => {
  const d = rectPath(0, 0, 40, 40);
  const nz = Path.fromSVG(d).tessellateFill({ fillRule: 'nonzero' });
  const eo = Path.fromSVG(d).tessellateFill({ fillRule: 'evenodd' });
  assert.deepEqual(nz.vertices, eo.vertices);
  assert.deepEqual(nz.indices, eo.indices);
});

test('反向内边界在 nonzero 下形成孔洞', () => {
  const r = Path.fromSVG(holePath(50, 30)).tessellateFill({ fillRule: 'nonzero' });
  assertValidMesh(r);
  // 外框 2500 减内孔 900
  assert.equal(triangleArea(r), 1600);
});

test('evenodd 下同向嵌套环也会挖空', () => {
  const sameDir = [
    'M-25,-25 L25,-25 L25,25 L-25,25 Z',
    'M-15,-15 L15,-15 L15,15 L-15,15 Z',
  ].join(' ');
  const eo = Path.fromSVG(sameDir).tessellateFill({ fillRule: 'evenodd' });
  const nz = Path.fromSVG(sameDir).tessellateFill({ fillRule: 'nonzero' });
  assertValidMesh(eo);
  assert.equal(triangleArea(eo), 2500 - 900);
  // 同向嵌套 nonzero 不挖空
  assert.equal(triangleArea(nz), 2500);
});

test('自交蝴蝶结在两种规则下都不崩溃且覆盖两叶', () => {
  for (const fillRule of ['nonzero', 'evenodd']) {
    const r = Path.fromSVG(bowtiePath(10)).tessellateFill({ fillRule });
    assertValidMesh(r);
    assert.ok(r.indices.length > 0);
    // 两叶各 25，总覆盖面积 50
    assert.equal(triangleArea(r), 50);
  }
});

test('退化线段与重复顶点不产生无效三角形也不丢数据', () => {
  const r = Path.fromSVG(degeneratePath()).tessellateFill();
  assertValidMesh(r);
  assert.equal(triangleArea(r), 100);
});

test('开放子路径填充时被隐式闭合', () => {
  const r = Path.fromSVG('M0,0 L10,0 L10,10 L0,10').tessellateFill();
  assertValidMesh(r);
  assert.equal(triangleArea(r), 100);
});

test('正多边形填充面积接近期望值', () => {
  const r = Path.fromSVG(polygonPath(0, 0, 10, 32)).tessellateFill();
  assertValidMesh(r);
  const expected = Math.PI * 100;
  assert.ok(Math.abs(triangleArea(r) - expected) / expected < 0.01);
});

test('重复运行输出完全确定（顶点与索引逐字节一致）', () => {
  const d = holePath(60, 24) + ' ' + bowtiePath(8);
  const opt = { fillRule: 'evenodd', tolerance: 0.3 };
  const a = JSON.stringify(Path.fromSVG(d).tessellateFill(opt));
  const b = JSON.stringify(Path.fromSVG(d).tessellateFill(opt));
  const c = JSON.stringify(Path.fromSVG(d).tessellateFill({ ...opt }));
  assert.equal(a, b);
  assert.equal(b, c);
});

test('空路径返回空顶点与空索引', () => {
  const r = Path.fromSVG('').tessellateFill();
  assert.deepEqual(r.vertices, []);
  assert.deepEqual(r.indices, []);
});

test('未知填充规则抛出 RangeError', () => {
  assert.throws(
    () => Path.fromSVG(rectPath(0, 0, 10, 10)).tessellateFill({ fillRule: 'odd' }),
    RangeError
  );
});

test('极大与极小坐标都能产出有限的有效网格', () => {
  const big = Path.fromSVG(
    'M1e12,1e12 L1000000000100,1e12 L1000000000100,1000000000100 L1e12,1000000000100 Z'
  ).tessellateFill({ tolerance: 1 });
  assertValidMesh(big);

  const tiny = Path.fromSVG('M0,0 L1e-9,0 L1e-9,1e-9 L0,1e-9 Z').tessellateFill({
    tolerance: 1e-12,
  });
  assertValidMesh(tiny);
  assert.equal(tiny.indices.length / 3, 2);
});

test('跨越 1e100 与 1e-100 量级的坐标仍能正确三角化', () => {
  const huge = Path.fromSVG(
    'M1e100,1e100 L1.0000000001e100,1e100 L1.0000000001e100,1.0000000001e100 L1e100,1.0000000001e100 Z'
  ).tessellateFill({ tolerance: 1e80 });
  assertValidMesh(huge);
  assert.equal(huge.indices.length / 3, 2);

  const micro = Path.fromSVG(
    'M0,0 L1e-100,0 L1e-100,1e-100 L0,1e-100 Z'
  ).tessellateFill({ tolerance: 1e-102 });
  assertValidMesh(micro);
  assert.equal(micro.indices.length / 3, 2);
});

test('三层嵌套环在 evenodd 下交替填充', () => {
  const d = [
    'M0,0 L30,0 L30,30 L0,30 Z',
    'M5,5 L25,5 L25,25 L5,25 Z',
    'M10,10 L20,10 L20,20 L10,20 Z',
  ].join(' ');
  const eo = Path.fromSVG(d).tessellateFill({ fillRule: 'evenodd' });
  assertValidMesh(eo);
  // 外框 900 - 中环 400 + 内框 100 = 600
  assert.equal(triangleArea(eo), 600);
});

test('完全重叠的两个环在 evenodd 下相互抵消', () => {
  const d = 'M0,0 L10,0 L10,10 L0,10 Z M0,0 L10,0 L10,10 L0,10 Z';
  const eo = Path.fromSVG(d).tessellateFill({ fillRule: 'evenodd' });
  assert.deepEqual(eo.indices, []);
  const nz = Path.fromSVG(d).tessellateFill({ fillRule: 'nonzero' });
  assertValidMesh(nz);
  assert.equal(triangleArea(nz), 100);
});

test('所有三角形统一逆时针绕序', () => {
  const r = Path.fromSVG(holePath(40, 16)).tessellateFill({ fillRule: 'evenodd' });
  const v = r.vertices;
  for (let i = 0; i < r.indices.length; i += 3) {
    const [a, b, c] = [r.indices[i], r.indices[i + 1], r.indices[i + 2]];
    const area2 =
      (v[b * 2] - v[a * 2]) * (v[c * 2 + 1] - v[a * 2 + 1]) -
      (v[b * 2 + 1] - v[a * 2 + 1]) * (v[c * 2] - v[a * 2]);
    assert.ok(area2 > 0);
  }
});
