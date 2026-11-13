// vector-path-tessellator 公共入口。
// 纯几何处理：不依赖 Canvas、DOM、浏览器或任何第三方包。

export { Path } from './path.js';
export { parsePath } from './parse-path.js';
export { flatten, DEFAULT_TOLERANCE } from './flatten.js';
export { tessellateFill } from './fill-tessellate.js';
export { tessellateStroke } from './stroke.js';
export {
  identity,
  affine,
  translate,
  scale,
  rotate,
  skewX,
  skewY,
  multiply,
  applyPoint,
  determinant,
  isInvertible,
} from './matrix.js';

// 计算折线子路径的轴对齐包围盒，空路径返回 null。
export function bounds(subpaths) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (const sub of subpaths) {
    for (const pt of sub.points) {
      found = true;
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  return found ? { minX, minY, maxX, maxY } : null;
}
