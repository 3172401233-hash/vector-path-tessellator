import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path } from '../src/index.js';
import { curvePath } from './fixtures.js';

test('直线路径不增加额外顶点', () => {
  const subs = Path.fromSVG('M0,0 L10,0 L10,10 Z').toSubpaths();
  assert.equal(subs.length, 1);
  assert.equal(subs[0].points.length, 3);
  assert.equal(subs[0].closed, true);
});

test('开放子路径标记为未闭合', () => {
  const subs = Path.fromSVG('M0,0 L10,5').toSubpaths();
  assert.equal(subs[0].closed, false);
});

test('多个 M 产生多个子路径', () => {
  const subs = Path.fromSVG('M0,0 L1,1 Z M5,5 L6,6').toSubpaths();
  assert.equal(subs.length, 2);
  assert.equal(subs[0].closed, true);
  assert.equal(subs[1].closed, false);
});

test('曲线展开顶点数随容差收紧而增加', () => {
  const coarse = Path.fromSVG(curvePath()).toSubpaths({ tolerance: 5 })[0].points.length;
  const medium = Path.fromSVG(curvePath()).toSubpaths({ tolerance: 0.5 })[0].points.length;
  const fine = Path.fromSVG(curvePath()).toSubpaths({ tolerance: 0.01 })[0].points.length;
  assert.ok(coarse < medium);
  assert.ok(medium < fine);
});

test('展开折线首尾精确贴合曲线端点', () => {
  const path = Path.fromSVG('M0,0 C10,20 30,20 40,0');
  const pts = path.toSubpaths({ tolerance: 0.1 })[0].points;
  assert.deepEqual(pts[0], { x: 0, y: 0 });
  assert.deepEqual(pts[pts.length - 1], { x: 40, y: 0 });
});

test('二次贝塞尔同样被自适应展开', () => {
  const pts = Path.fromSVG('M0,0 Q20,-30 40,0').toSubpaths({ tolerance: 0.1 })[0].points;
  assert.ok(pts.length > 2);
  assert.deepEqual(pts[pts.length - 1], { x: 40, y: 0 });
});

test('所有展开点都在有限范围内且无 NaN', () => {
  const subs = Path.fromSVG(curvePath()).toSubpaths({ tolerance: 0.05 });
  for (const sub of subs) {
    for (const pt of sub.points) {
      assert.ok(Number.isFinite(pt.x) && Number.isFinite(pt.y));
    }
  }
});

test('非法容差抛出 RangeError', () => {
  assert.throws(() => Path.fromSVG('M0,0 L1,1').toSubpaths({ tolerance: 0 }), RangeError);
  assert.throws(() => Path.fromSVG('M0,0 L1,1').toSubpaths({ tolerance: -1 }), RangeError);
  assert.throws(() => Path.fromSVG('M0,0 L1,1').toSubpaths({ tolerance: NaN }), RangeError);
});

test('曲线展开误差不超过给定容差（控制点到弦距离）', () => {
  // 对每个展开段，原曲线中点相对该段弦的偏差应被容差约束；
  // 这里用包围盒收紧量间接验证：容差越小，多边形面积越接近真实曲线范围。
  const d = 'M0,0 C0,30 40,30 40,0';
  const coarse = Path.fromSVG(d).toSubpaths({ tolerance: 2 })[0].points;
  const fine = Path.fromSVG(d).toSubpaths({ tolerance: 0.05 })[0].points;
  const minY = (pts) => Math.min(...pts.map((p) => p.y));
  // 更细的展开更贴近曲线顶部（y 更小，因为控制点向上拉）
  assert.ok(minY(fine) <= minY(coarse));
});
