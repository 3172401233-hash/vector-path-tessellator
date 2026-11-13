import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path, parsePath, flatten, bounds, translate, scale } from '../src/index.js';
import { mixedCommandsPath, assertValidMesh, triangleArea } from './fixtures.js';

test('Path.fromSVG 与 isEmpty/commands 基本行为', () => {
  assert.equal(Path.fromSVG('').isEmpty, true);
  const p = Path.fromSVG('M0,0 L1,1');
  assert.equal(p.isEmpty, false);
  assert.equal(p.commands.length, 2);
});

test('混合相对命令、H/V、C、Q、Z 能完整解析与三角化', () => {
  const cmds = parsePath(mixedCommandsPath());
  assert.ok(cmds.some((c) => c.type === 'C'));
  assert.ok(cmds.some((c) => c.type === 'Q'));
  assert.ok(cmds.some((c) => c.type === 'Z'));
  const r = Path.fromSVG(mixedCommandsPath()).tessellateFill({ tolerance: 0.2 });
  assertValidMesh(r);
});

test('tessellate 同时返回填充与描边结果', () => {
  const out = Path.fromSVG('M0,0 L20,0 L20,20 Z').tessellate({
    fillRule: 'nonzero',
    stroke: true,
    lineWidth: 2,
  });
  assertValidMesh(out.fill);
  assertValidMesh(out.stroke);
  assert.equal(out.vertices, out.fill.vertices);
  assert.ok(out.stroke.indices.length > 0);
});

test('空路径的 tessellate 返回结构化空结果', () => {
  const out = Path.fromSVG('').tessellate({ stroke: true, lineWidth: 2 });
  assert.deepEqual(out.vertices, []);
  assert.deepEqual(out.indices, []);
  assert.deepEqual(out.fill.vertices, []);
  assert.equal(out.stroke, null);
});

test('bounds 计算子路径包围盒，空路径为 null', () => {
  const subs = flatten(parsePath('M5,10 L20,30 L-2,40'));
  assert.deepEqual(bounds(subs), { minX: -2, minY: 10, maxX: 20, maxY: 40 });
  assert.equal(bounds([]), null);
});

test('解析->展开->变换->三角化全链路无 NaN 且确定', () => {
  const build = () =>
    Path.fromSVG('M0,0 C10,-15 30,15 40,0 L40,20 L0,20 Z')
      .transform(translate(100, 100))
      .tessellate({ fillRule: 'evenodd', tolerance: 0.3, stroke: true, lineWidth: 3, lineCap: 'round' });
  const a = JSON.stringify(build());
  const b = JSON.stringify(build());
  assert.equal(a, b);
  const parsed = JSON.parse(a);
  for (const x of parsed.fill.vertices) assert.ok(Number.isFinite(x));
  for (const x of parsed.stroke.vertices) assert.ok(Number.isFinite(x));
});

test('带孔洞路径经仿射变换后孔洞面积比例保持', () => {
  const d = 'M-25,-25 L25,-25 L25,25 L-25,25 Z M-15,-15 L-15,15 L15,15 L15,-15 Z';
  const base = Path.fromSVG(d).tessellateFill({ fillRule: 'nonzero' });
  const scaled = Path.fromSVG(d).transform(scale(3, 3)).tessellateFill({ fillRule: 'nonzero' });
  assertValidMesh(scaled);
  assert.equal(triangleArea(scaled), triangleArea(base) * 9);
});

test('多个独立子路径被统一三角化', () => {
  const d = 'M0,0 L10,0 L10,10 Z M40,40 L50,40 L50,50 Z';
  const r = Path.fromSVG(d).tessellateFill();
  assertValidMesh(r);
  assert.equal(triangleArea(r), 100);
});
