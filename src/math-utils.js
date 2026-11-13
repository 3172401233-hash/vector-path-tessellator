// 基础二维数学工具。所有几何模块共用这些纯函数，避免依赖任何第三方包。

export function assertFinite(value, name = 'value') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} 必须是有限数字，收到: ${String(value)}`);
  }
  return value;
}

export function assertPoint(x, y) {
  assertFinite(x, 'x');
  assertFinite(y, 'y');
}

// 三角形有符号面积的两倍，正值表示顶点逆时针排列。
export function signedArea2(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len === 0) {
    throw new RangeError('无法归一化零长度向量');
  }
  return { x: x / len, y: y / len, len };
}

// 依据坐标量级计算纯相对容差：随图形尺度同比缩放，
// 既不会在大坐标下失效，也不会把极小尺度图形整体合并。
// 仅用于吸收同一点经不同浮点路径计算产生的 ULP 级噪声。
export function scaleEpsilon(coords) {
  let max = 0;
  for (const value of coords) {
    if (Number.isFinite(value)) {
      const abs = Math.abs(value);
      if (abs > max) max = abs;
    }
  }
  // max 为 0（全零退化输入）时给一个极小的安全下限。
  // 系数取 2：仅吸收 1~2 个 ULP 的浮点噪声，避免误合并真实存在的微小边。
  return max === 0 ? Number.EPSILON : max * Number.EPSILON * 2;
}
