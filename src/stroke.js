// 描边轮廓生成：把每条子路径展开为宽度为 lineWidth 的封闭轮廓环，
// 再复用填充三角化（evenodd）输出三角形。

import { normalize } from './math-utils.js';
import { tessellateFill } from './fill-tessellate.js';

const VALID_JOINS = new Set(['miter', 'round', 'bevel']);
const VALID_CAPS = new Set(['butt', 'round', 'square']);

function arcSteps(radius, tolerance) {
  // 弦高误差 = r*(1-cos(theta/2)) ~ r*theta^2/8 <= tolerance
  const theta = 2 * Math.acos(Math.max(0, 1 - tolerance / Math.max(radius, tolerance)));
  const steps = Math.max(6, Math.ceil(Math.PI / Math.max(theta, 1e-6)));
  return Math.min(steps, 256);
}

function dedupe(points) {
  const out = [];
  for (const pt of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== pt.x || last.y !== pt.y) {
      out.push(pt);
    }
  }
  return out;
}

// 把环的末点吸附回首点，消除圆弧累计的浮点误差（否则会产生一条伪闭合边）。
function snapRingClosure(points) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const span = points.reduce(
    (max, pt) => Math.max(max, Math.abs(pt.x), Math.abs(pt.y)),
    0
  );
  const eps = Math.max(1e-9, span * 1e-9);
  if (Math.abs(last.x - first.x) <= eps && Math.abs(last.y - first.y) <= eps) {
    return points.slice(0, -1);
  }
  return points;
}

// 返回一个或多个封闭简单环（点数组，不含重复首点，由 closed 标记闭合）。
export function buildRing(points, closed, halfWidth, opts) {
  let pts = dedupe(points);
  if (closed && pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.x === last.x && first.y === last.y) {
      pts = pts.slice(0, -1);
    }
  }
  if (pts.length < 2) return null;

  const n = pts.length;
  const segments = [];
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dir = normalize(b.x - a.x, b.y - a.y);
    segments.push({
      a,
      b,
      tx: dir.x,
      ty: dir.y,
      // 左侧法线（行进方向逆时针 90°）
      nx: -dir.y,
      ny: dir.x,
    });
  }

  const left = [];
  const right = [];
  const tolerance = opts.tolerance;

  const offset = (pt, nx, ny) => ({
    x: pt.x + nx * halfWidth,
    y: pt.y + ny * halfWidth,
  });

  // 逐顶点构建左右偏移链。
  // 闭环：顶点 0..n-1 全是转角；开放路径：两端是端点（首段/末段法线偏移），中间是转角。
  const firstVertex = 0;
  const lastVertex = closed ? n - 1 : n - 1;
  for (let i = firstVertex; i <= lastVertex; i += 1) {
    const pt = pts[i % n];
    const prev = segments[(i - 1 + segCount) % segCount];
    const next = segments[i % segCount];
    const isJoin = closed || (i > 0 && i < n - 1);

    if (!isJoin) {
      const seg = i === 0 ? next : prev;
      left.push(offset(pt, seg.nx, seg.ny));
      right.push(offset(pt, -seg.nx, -seg.ny));
      continue;
    }

    const dot = prev.tx * next.tx + prev.ty * next.ty;
    const crossZ = prev.tx * next.ty - prev.ty * next.tx;

    // 同向共线：直接用法线偏移。
    if (Math.abs(crossZ) < 1e-12 && dot > 0) {
      left.push(offset(pt, next.nx, next.ny));
      right.push(offset(pt, -next.nx, -next.ny));
      continue;
    }

    // 角平分线（miter 方向）。
    let mx = prev.nx + next.nx;
    let my = prev.ny + next.ny;
    const mLen = Math.hypot(mx, my);
    if (mLen < 1e-12) {
      // 反向共线（180° 折返）退化为 bevel。
      left.push(offset(pt, prev.nx, prev.ny));
      left.push(offset(pt, next.nx, next.ny));
      right.push(offset(pt, -prev.nx, -prev.ny));
      right.push(offset(pt, -next.nx, -next.ny));
      continue;
    }
    mx /= mLen;
    my /= mLen;
    // miter 长度比 = 1/sin(theta/2)
    const sinHalf = Math.sqrt(Math.max(0, (1 - dot) * 0.5));
    const miterRatio = 1 / Math.max(sinHalf, 1e-12);
    const limited = miterRatio > opts.miterLimit;

    if (opts.lineJoin === 'miter' && !limited) {
      const m = halfWidth * miterRatio;
      left.push({ x: pt.x + mx * m, y: pt.y + my * m });
      right.push({ x: pt.x - mx * m, y: pt.y - my * m });
      continue;
    }

    if (opts.lineJoin === 'round' && !limited) {
      addRoundJoin(pt, prev, next, halfWidth, crossZ, left, right, tolerance);
      continue;
    }

    // bevel，以及超出 miter limit 时回退为 bevel。
    left.push(offset(pt, prev.nx, prev.ny));
    left.push(offset(pt, next.nx, next.ny));
    right.push(offset(pt, -prev.nx, -prev.ny));
    right.push(offset(pt, -next.nx, -next.ny));
  }

  if (closed) {
    // 闭环描边产生两个独立简单环：外角环逆时针、内角环顺时针，
    // 方向相反，nonzero 填充时内角自动成为孔洞。
    const outer = snapRingClosure(dedupe(right));
    const inner = snapRingClosure(dedupe(left.slice().reverse()));
    if (outer.length < 3 || inner.length < 3) return null;
    return [outer, inner];
  }

  const startCap = capPoints(
    pts[0],
    segments[0].tx,
    segments[0].ty,
    segments[0].nx,
    segments[0].ny,
    halfWidth,
    opts,
    true
  );
  const endCap = capPoints(
    pts[n - 1],
    segments[segCount - 1].tx,
    segments[segCount - 1].ty,
    segments[segCount - 1].nx,
    segments[segCount - 1].ny,
    halfWidth,
    opts,
    false
  );

  // 环顺序：左链（起点->终点）+ 终点帽（左->右）+ 右链反向（终点->起点）+ 起点帽（右->左）。
  const ring = snapRingClosure(dedupe([
    ...left,
    ...endCap,
    ...right.slice().reverse(),
    ...startCap,
  ]));
  return ring.length >= 3 ? [ring] : null;
}

function addRoundJoin(pt, prev, next, halfWidth, crossZ, left, right, tolerance) {
  const steps = arcSteps(halfWidth, tolerance);
  const aPrev = Math.atan2(prev.ny, prev.nx);
  const aNext = Math.atan2(next.ny, next.nx);
  let delta = aNext - aPrev;
  // 左转弯（crossZ>0）在左侧走短弧，右转弯在右侧走短弧。
  if (crossZ > 0) {
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    left.push(...sweepArc(pt, halfWidth, aPrev, aPrev + delta, steps));
    right.push({ x: pt.x - next.nx * halfWidth, y: pt.y - next.ny * halfWidth });
  } else {
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    left.push({ x: pt.x + next.nx * halfWidth, y: pt.y + next.ny * halfWidth });
    const rPrev = Math.atan2(-prev.ny, -prev.nx);
    const rNext = Math.atan2(-next.ny, -next.nx);
    let rDelta = rNext - rPrev;
    while (rDelta > Math.PI) rDelta -= 2 * Math.PI;
    while (rDelta < -Math.PI) rDelta += 2 * Math.PI;
    right.push(...sweepArc(pt, halfWidth, rPrev, rPrev + rDelta, steps));
  }
}

function sweepArc(center, radius, a0, a1, steps) {
  const out = [];
  for (let i = 1; i <= steps; i += 1) {
    const angle = a0 + ((a1 - a0) * i) / steps;
    out.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return out;
}

// 返回帽上除左右偏移端点外的中间点；端点由左右链提供，dedupe 负责合并重合点。
function capPoints(pt, tx, ty, nx, ny, halfWidth, opts, isStart) {
  if (opts.lineCap === 'butt') {
    return [];
  }
  if (opts.lineCap === 'square') {
    const leftPt = { x: pt.x + nx * halfWidth, y: pt.y + ny * halfWidth };
    const rightPt = { x: pt.x - nx * halfWidth, y: pt.y - ny * halfWidth };
    const sign = isStart ? -1 : 1;
    const l = { x: leftPt.x + tx * sign * halfWidth, y: leftPt.y + ty * sign * halfWidth };
    const r = { x: rightPt.x + tx * sign * halfWidth, y: rightPt.y + ty * sign * halfWidth };
    return isStart ? [r, l] : [l, r];
  }

  // round：半圆。环按「左链正向 -> 终点帽 -> 右链反向 -> 起点帽」缠绕，
  // 终点帽从左偏移绕到右偏移（沿 -PI 方向），起点帽从右偏移绕回左偏移（沿 +PI 方向）。
  const steps = arcSteps(halfWidth, opts.tolerance);
  const aLeft = Math.atan2(ny, nx);
  const aRight = Math.atan2(-ny, -nx);
  if (isStart) {
    // 从右偏移角沿角度递减方向（经 -x 外侧）扫到左偏移角，固定 -PI 的半圆弧。
    return sweepArc(pt, halfWidth, aRight, aRight - Math.PI, steps);
  }
  // 终点从左偏移角沿角度递减方向（经 +x 外侧）扫到右偏移角。
  return sweepArc(pt, halfWidth, aLeft, aLeft - Math.PI, steps);
}

function shortestDelta(a0, a1) {
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

export function tessellateStroke(subpaths, options = {}) {
  const lineJoin = options.lineJoin ?? 'miter';
  const lineCap = options.lineCap ?? 'butt';
  const lineWidth = options.lineWidth ?? 1;
  const miterLimit = options.miterLimit ?? 10;
  const tolerance = options.tolerance ?? 0.25;

  if (!VALID_JOINS.has(lineJoin)) throw new RangeError(`未知转角类型: ${String(lineJoin)}`);
  if (!VALID_CAPS.has(lineCap)) throw new RangeError(`未知端点类型: ${String(lineCap)}`);
  if (typeof lineWidth !== 'number' || !Number.isFinite(lineWidth) || lineWidth <= 0) {
    throw new RangeError(`lineWidth 必须是正数，收到: ${String(lineWidth)}`);
  }
  if (typeof miterLimit !== 'number' || !Number.isFinite(miterLimit) || miterLimit < 1) {
    throw new RangeError(`miterLimit 必须 >= 1，收到: ${String(miterLimit)}`);
  }
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError(`tolerance 必须是正数，收到: ${String(tolerance)}`);
  }

  const rings = [];
  const halfWidth = lineWidth * 0.5;
  for (const sub of subpaths) {
    const built = buildRing(sub.points, sub.closed, halfWidth, {
      lineJoin,
      lineCap,
      miterLimit,
      tolerance,
    });
    if (built) {
      for (const ring of built) {
        rings.push({ points: ring, closed: true });
      }
    }
  }

  if (rings.length === 0) {
    return { vertices: [], indices: [] };
  }
  // 描边环的内外边界方向相反，nonzero 能正确挖出孔洞；
  // evenodd 对自接触的单一描边轮廓也成立，但双环方案下 nonzero 更直接。
  return tessellateFill(rings, { fillRule: 'nonzero' });
}
