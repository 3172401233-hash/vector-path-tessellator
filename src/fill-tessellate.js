// 填充三角化：水平条带 + 环绕数判定。
// 天然支持 nonzero / evenodd、自交路径、孔洞与反向边界，结果确定且无退化三角形。

import { splitAtIntersections } from './intersections.js';
import { scaleEpsilon, signedArea2 } from './math-utils.js';

function buildVertexWelder(eps) {
  const cache = new Map();
  const keyOf = (x, y) => `${Math.round(x / eps)},${Math.round(y / eps)}`;
  return function weld(x, y, vertices) {
    const key = keyOf(x, y);
    if (cache.has(key)) return cache.get(key);
    const index = vertices.length / 2;
    vertices.push(x, y);
    cache.set(key, index);
    return index;
  };
}

function crossingX(seg, y) {
  return seg.ax + ((y - seg.ay) / (seg.by - seg.ay)) * (seg.bx - seg.ax);
}

function isFilled(winding, crossings, fillRule) {
  if (fillRule === 'evenodd') return crossings % 2 === 1;
  return winding !== 0;
}

function closeOpenSubpaths(subpaths) {
  return subpaths.map((sub) => {
    if (sub.closed) return sub;
    const first = sub.points[0];
    const last = sub.points[sub.points.length - 1];
    if (first.x === last.x && first.y === last.y) {
      return { points: sub.points, closed: true };
    }
    return { points: [...sub.points, { x: first.x, y: first.y }], closed: true };
  });
}

export function tessellateFill(subpaths, options = {}) {
  const fillRule = options.fillRule ?? 'nonzero';
  if (fillRule !== 'nonzero' && fillRule !== 'evenodd') {
    throw new RangeError(`未知填充规则: ${String(fillRule)}`);
  }

  const vertices = [];
  const indices = [];
  if (!subpaths || subpaths.length === 0) {
    return { vertices, indices };
  }

  const closed = closeOpenSubpaths(subpaths);
  const segs = splitAtIntersections(closed);
  if (segs.length === 0) {
    return { vertices, indices };
  }

  const coords = [];
  for (const seg of segs) coords.push(seg.ax, seg.ay, seg.bx, seg.by);
  const eps = scaleEpsilon(coords);
  const weld = buildVertexWelder(eps);

  // 收集所有唯一 y 事件。
  const ySet = new Set();
  for (const seg of segs) {
    ySet.add(seg.ay);
    ySet.add(seg.by);
  }
  const ys = [...ySet].sort((a, b) => a - b);

  for (let k = 0; k < ys.length - 1; k += 1) {
    const yLow = ys[k];
    const yHigh = ys[k + 1];
    if (yHigh - yLow <= eps) continue;
    const yMid = (yLow + yHigh) * 0.5;

    const active = segs.filter(
      (seg) => seg.ay !== seg.by && Math.min(seg.ay, seg.by) <= yMid && yMid < Math.max(seg.ay, seg.by)
    );
    if (active.length === 0) continue;

    // 条带内没有顶点事件，跨边从下到上的左右顺序保持一致。
    // 在条带中线高度排序并取区间中点，保证判定点严格落在区间内部。
    const midCrossings = active
      .map((seg, id) => ({ seg, x: crossingX(seg, yMid), id }))
      .sort((a, b) => (a.x - b.x) || a.id - b.id);
    const lowBySeg = new Map(active.map((seg) => [seg, crossingX(seg, yLow)]));
    const highBySeg = new Map(active.map((seg) => [seg, crossingX(seg, yHigh)]));

    // 从左到右扫描跨边区间，环绕数随跨边逐条累积。
    let winding = 0;
    let crossings = 0;
    for (let n = 0; n < midCrossings.length - 1; n += 1) {
      const left = midCrossings[n].seg;
      const right = midCrossings[n + 1].seg;
      // SVG 坐标系 y 轴向下：沿 +y 的边对环绕数贡献 -1，沿 -y 的边贡献 +1。
      winding += left.by > left.ay ? -1 : 1;
      crossings += 1;
      if (!isFilled(winding, crossings, fillRule)) continue;
      emitQuad(
        lowBySeg.get(left),
        lowBySeg.get(right),
        highBySeg.get(left),
        highBySeg.get(right),
        yLow,
        yHigh,
        weld,
        vertices,
        indices,
        eps
      );
    }
  }

  return { vertices, indices };
}

function emitQuad(
  leftLow,
  rightLow,
  leftHigh,
  rightHigh,
  yLow,
  yHigh,
  weld,
  vertices,
  indices,
  eps
) {
  const bl = weld(leftLow, yLow, vertices);
  const br = weld(rightLow, yLow, vertices);
  const tl = weld(leftHigh, yHigh, vertices);
  const tr = weld(rightHigh, yHigh, vertices);
  pushIfValid([bl, br, tr], vertices, indices, eps);
  pushIfValid([bl, tr, tl], vertices, indices, eps);
}

function pushIfValid(tri, vertices, indices, eps) {
  const [i0, i1, i2] = tri;
  if (i0 === i1 || i1 === i2 || i0 === i2) return;
  const area = signedArea2(
    vertices[i0 * 2],
    vertices[i0 * 2 + 1],
    vertices[i1 * 2],
    vertices[i1 * 2 + 1],
    vertices[i2 * 2],
    vertices[i2 * 2 + 1]
  );
  const areaThreshold = eps * eps;
  if (Math.abs(area) <= areaThreshold) return;
  if (area < 0) {
    indices.push(i0, i2, i1);
  } else {
    indices.push(...tri);
  }
}
