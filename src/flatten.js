// 把解析后的命令序列展开为折线子路径。
// 曲线采用自适应递归细分：当控制点相对弦的偏差小于容差时停止。

import { assertFinite } from './math-utils.js';

export const DEFAULT_TOLERANCE = 0.25;
const MAX_DEPTH = 24;

function normalizeTolerance(tolerance) {
  if (tolerance === undefined) return DEFAULT_TOLERANCE;
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError(`tolerance 必须是正数，收到: ${String(tolerance)}`);
  }
  return tolerance;
}

// 控制点到弦的距离上界，用于判断三次贝塞尔是否足够平。
function cubicFlatness(p0, p1, p2, p3) {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const len2 = dx * dx + dy * dy;
  let d1;
  let d2;
  if (len2 === 0) {
    d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    d2 = Math.hypot(p2.x - p0.x, p2.y - p0.y);
  } else {
    const invLen = 1 / Math.sqrt(len2);
    d1 = Math.abs(dy * p1.x - dx * p1.y + p3.x * p0.y - p3.y * p0.x) * invLen;
    d2 = Math.abs(dy * p2.x - dx * p2.y + p3.x * p0.y - p3.y * p0.x) * invLen;
  }
  return Math.max(d1, d2);
}

function subdivideCubic(p0, p1, p2, p3, tolerance, depth, out) {
  if (depth >= MAX_DEPTH || cubicFlatness(p0, p1, p2, p3) <= tolerance) {
    out.push({ x: p3.x, y: p3.y });
    return;
  }
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const p0123 = mid(p012, p123);
  subdivideCubic(p0, p01, p012, p0123, tolerance, depth + 1, out);
  subdivideCubic(p0123, p123, p23, p3, tolerance, depth + 1, out);
}

function quadraticFlatness(p0, p1, p2) {
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return Math.hypot(p1.x - p0.x, p1.y - p0.y);
  }
  return Math.abs(dy * p1.x - dx * p1.y + p2.x * p0.y - p2.y * p0.x) / Math.sqrt(len2);
}

function subdivideQuadratic(p0, p1, p2, tolerance, depth, out) {
  if (depth >= MAX_DEPTH || quadraticFlatness(p0, p1, p2) <= tolerance) {
    out.push({ x: p2.x, y: p2.y });
    return;
  }
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p012 = mid(p01, p12);
  subdivideQuadratic(p0, p01, p012, tolerance, depth + 1, out);
  subdivideQuadratic(p012, p12, p2, tolerance, depth + 1, out);
}

function mid(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

// 返回子路径数组：{ points: [{x,y}...], closed: boolean }
export function flatten(commands, options = {}) {
  const tolerance = normalizeTolerance(options.tolerance);
  const subpaths = [];
  let current = null;
  let pen = { x: 0, y: 0 };

  const ensureSubpath = (start) => {
    if (current === null) {
      current = { points: [{ x: start.x, y: start.y }], closed: false };
      subpaths.push(current);
    }
  };

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      current = { points: [{ x: cmd.x, y: cmd.y }], closed: false };
      subpaths.push(current);
      pen = { x: cmd.x, y: cmd.y };
    } else if (cmd.type === 'L') {
      ensureSubpath(pen);
      current.points.push({ x: cmd.x, y: cmd.y });
      pen = { x: cmd.x, y: cmd.y };
    } else if (cmd.type === 'C') {
      ensureSubpath(pen);
      const p0 = { ...pen };
      subdivideCubic(p0, cmd.c1, cmd.c2, cmd.end, tolerance, 0, current.points);
      pen = { ...cmd.end };
    } else if (cmd.type === 'Q') {
      ensureSubpath(pen);
      const p0 = { ...pen };
      subdivideQuadratic(p0, cmd.c, cmd.end, tolerance, 0, current.points);
      pen = { ...cmd.end };
    } else if (cmd.type === 'Z') {
      if (current !== null) {
        current.closed = true;
        const first = current.points[0];
        pen = { x: first.x, y: first.y };
        current = null;
      }
    }
  }

  for (const sub of subpaths) {
    for (const pt of sub.points) {
      assertFinite(pt.x, 'flatten.x');
      assertFinite(pt.y, 'flatten.y');
    }
  }
  return subpaths;
}
