// 在所有线段之间求交点并切分，输出互不交叉的有向线段集合。
// 处理：普通交点、端点相接、T 型相交、共线重叠。

import { scaleEpsilon } from './math-utils.js';

function collectSegments(subpaths) {
  const segments = [];
  const allCoords = [];
  for (const sub of subpaths) {
    const pts = sub.points;
    const count = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a.x === b.x && a.y === b.y) continue; // 退化线段直接丢弃
      segments.push({
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        dir: 1,
      });
      allCoords.push(a.x, a.y, b.x, b.y);
    }
  }
  return { segments, eps: scaleEpsilon(allCoords) };
}

function pointOnSegment(px, py, seg, eps) {
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  let t = ((px - seg.ax) * dx + (py - seg.ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = seg.ax + t * dx;
  const cy = seg.ay + t * dy;
  return Math.hypot(px - cx, py - cy) <= eps;
}

// 返回两条线段的交点参数列表：对 seg1 用 t，对 seg2 用 u（0..1）。
function intersect(s1, s2, eps) {
  const rX = s1.bx - s1.ax;
  const rY = s1.by - s1.ay;
  const sX = s2.bx - s2.ax;
  const sY = s2.by - s2.ay;
  const denom = rX * sY - rY * sX;
  const qpx = s2.ax - s1.ax;
  const qpy = s2.ay - s1.ay;

  if (Math.abs(denom) > eps) {
    const t = (qpx * sY - qpy * sX) / denom;
    const u = (qpx * rY - qpy * rX) / denom;
    if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
      return [
        { which: 1, t: Math.max(0, Math.min(1, t)) },
        { which: 2, t: Math.max(0, Math.min(1, u)) },
      ];
    }
    return [];
  }

  // 平行：检查共线重叠。
  if (Math.abs(qpx * rY - qpy * rX) > eps) {
    return [];
  }
  const len2 = rX * rX + rY * rY;
  const tOf = (px, py) => ((px - s1.ax) * rX + (py - s1.ay) * rY) / len2;
  const uOf = (px, py) => ((px - s2.ax) * sX + (py - s2.ay) * sY) / (sX * sX + sY * sY);

  const hits = [];
  // s2 的两个端点若落在 s1 上，切分 s1；s1 的两个端点若落在 s2 上，切分 s2。
  if (pointOnSegment(s2.ax, s2.ay, s1, eps)) {
    hits.push({ which: 1, t: clamp01(tOf(s2.ax, s2.ay)) });
    hits.push({ which: 2, t: 0 });
  }
  if (pointOnSegment(s2.bx, s2.by, s1, eps)) {
    hits.push({ which: 1, t: clamp01(tOf(s2.bx, s2.by)) });
    hits.push({ which: 2, t: 1 });
  }
  if (pointOnSegment(s1.ax, s1.ay, s2, eps)) {
    hits.push({ which: 2, t: clamp01(uOf(s1.ax, s1.ay)) });
  }
  if (pointOnSegment(s1.bx, s1.by, s2, eps)) {
    hits.push({ which: 2, t: clamp01(uOf(s1.bx, s1.by)) });
  }
  return hits;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// 主入口：subpaths -> 切分后的线段数组（保留原始方向）。
export function splitAtIntersections(subpaths) {
  const { segments, eps } = collectSegments(subpaths);
  if (segments.length === 0) return [];

  const cuts = segments.map(() => new Set([0, 1]));

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const hits = intersect(segments[i], segments[j], eps);
      for (const hit of hits) {
        if (hit.which === 1) cuts[i].add(hit.t);
        else cuts[j].add(hit.t);
      }
    }
  }

  const result = [];
  // 切分参数 t 是 0..1 的无量纲量，使用独立的参数容差，
  // 不能与按坐标量级缩放的 eps 混用（否则极大坐标下所有段都会被丢弃）。
  const tEps = 1e-12;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const ts = [...cuts[i]].sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k += 1) {
      const t0 = ts[k];
      const t1 = ts[k + 1];
      if (t1 - t0 <= tEps) continue;
      result.push({
        ax: seg.ax + t0 * (seg.bx - seg.ax),
        ay: seg.ay + t0 * (seg.by - seg.ay),
        bx: seg.ax + t1 * (seg.bx - seg.ax),
        by: seg.ay + t1 * (seg.by - seg.ay),
      });
    }
  }
  return result;
}
