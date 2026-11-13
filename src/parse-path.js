// SVG path data 解析器。
// 输出规范化的绝对命令序列：M / L / C / Q / Z。
// 支持命令：M L H V C Q Z（绝对大写、相对小写）。

const COMMAND_PARAMS = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  Q: 4,
  Z: 0,
};

const SUPPORTED = new Set(Object.keys(COMMAND_PARAMS));

// 数字词法：符号、整数/小数、可选指数。
function readNumber(src, start) {
  let i = start;
  // 显式拒绝 NaN / Infinity 关键字，给出非有限坐标的明确错误，
  // 而不是让它们在词法层退化成含糊的“缺少参数”。
  const rest = src.slice(start);
  if (/^NaN/.test(rest) || /^[+-]?Infinity/.test(rest)) {
    const token = /^NaN/.test(rest) ? 'NaN' : rest.match(/^[+-]?Infinity/)[0];
    throw new RangeError(`位置 ${start} 的坐标不是有限数字: "${token}"`);
  }
  if (src[i] === '+' || src[i] === '-') i += 1;
  let digits = 0;
  while (i < src.length && src[i] >= '0' && src[i] <= '9') {
    i += 1;
    digits += 1;
  }
  if (src[i] === '.') {
    i += 1;
    while (i < src.length && src[i] >= '0' && src[i] <= '9') {
      i += 1;
      digits += 1;
    }
  }
  if (digits === 0) {
    return null;
  }
  if (src[i] === 'e' || src[i] === 'E') {
    i += 1;
    if (src[i] === '+' || src[i] === '-') i += 1;
    let expDigits = 0;
    while (i < src.length && src[i] >= '0' && src[i] <= '9') {
      i += 1;
      expDigits += 1;
    }
    if (expDigits === 0) {
      throw new SyntaxError(`位置 ${i} 附近的指数缺少数字`);
    }
  }
  const raw = src.slice(start, i);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new RangeError(`位置 ${start} 的坐标不是有限数字: "${raw}"`);
  }
  return { value, next: i };
}

function skipSeparators(src, i) {
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',') {
      i += 1;
    } else {
      break;
    }
  }
  return i;
}

function readParams(src, start, count) {
  const values = [];
  let i = skipSeparators(src, start);
  for (let k = 0; k < count; k += 1) {
    const token = readNumber(src, i);
    if (token === null) {
      throw new SyntaxError(
        `位置 ${i} 处缺少参数：该命令需要 ${count} 个数字，当前只解析到 ${k} 个`
      );
    }
    values.push(token.value);
    i = token.next;
    i = skipSeparators(src, i);
  }
  return { values, next: i };
}

export function parsePath(d) {
  if (typeof d !== 'string') {
    throw new TypeError(`路径数据必须是字符串，收到: ${typeof d}`);
  }

  const commands = [];
  let i = 0;
  let current = null; // 当前命令字母（大写）
  let rel = false; // 当前（含隐式重复）命令是否为相对形式
  let pen = { x: 0, y: 0 };
  let startPoint = null; // 当前子路径起点

  while (i < d.length) {
    i = skipSeparators(d, i);
    if (i >= d.length) break;

    const ch = d[i];
    const isLetter = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');

    if (isLetter) {
      const upper = ch.toUpperCase();
      if (!SUPPORTED.has(upper)) {
        throw new SyntaxError(`不支持的路径命令 "${ch}"（位置 ${i}）`);
      }
      if (commands.length === 0 && upper !== 'M') {
        throw new SyntaxError(`路径必须以移动命令 M/m 开头，位置 ${i} 处发现 "${ch}"`);
      }
      current = upper;
      rel = ch >= 'a' && ch <= 'z';
      i += 1;
    } else if (current === null) {
      throw new SyntaxError(`路径必须以移动命令 M/m 开头，位置 ${i} 处发现 "${ch}"`);
    }

    if (!isLetter && current === 'Z') {
      throw new SyntaxError(`位置 ${i} 处命令 Z/z 不能隐式重复，必须显式给出新命令`);
    }

    // 隐式重复命令：M 的后续隐式坐标对按 L 处理（SVG 标准）。
    let effective = current;
    if (!isLetter && current === 'M') effective = 'L';

    if (effective === 'Z') {
      commands.push({ type: 'Z' });
      if (startPoint !== null) {
        pen = { x: startPoint.x, y: startPoint.y };
      }
      startPoint = null;
      continue;
    }

    const need = COMMAND_PARAMS[effective];
    const parsed = readParams(d, i, need);
    i = parsed.next;
    const p = parsed.values;

    if (effective === 'M') {
      const x = rel ? pen.x + p[0] : p[0];
      const y = rel ? pen.y + p[1] : p[1];
      commands.push({ type: 'M', x, y });
      pen = { x, y };
      startPoint = { x, y };
      current = 'M';
    } else if (effective === 'L') {
      const x = rel ? pen.x + p[0] : p[0];
      const y = rel ? pen.y + p[1] : p[1];
      commands.push({ type: 'L', x, y });
      pen = { x, y };
      if (startPoint === null) startPoint = { x, y };
    } else if (effective === 'H') {
      const x = rel ? pen.x + p[0] : p[0];
      commands.push({ type: 'L', x, y: pen.y });
      pen = { x, y: pen.y };
      if (startPoint === null) startPoint = { ...pen };
    } else if (effective === 'V') {
      const y = rel ? pen.y + p[0] : p[0];
      commands.push({ type: 'L', x: pen.x, y });
      pen = { x: pen.x, y };
      if (startPoint === null) startPoint = { ...pen };
    } else if (effective === 'C') {
      const c1 = rel
        ? { x: pen.x + p[0], y: pen.y + p[1] }
        : { x: p[0], y: p[1] };
      const c2 = rel
        ? { x: pen.x + p[2], y: pen.y + p[3] }
        : { x: p[2], y: p[3] };
      const end = rel
        ? { x: pen.x + p[4], y: pen.y + p[5] }
        : { x: p[4], y: p[5] };
      commands.push({ type: 'C', c1, c2, end });
      pen = { ...end };
      if (startPoint === null) startPoint = { ...pen };
    } else if (effective === 'Q') {
      const c = rel
        ? { x: pen.x + p[0], y: pen.y + p[1] }
        : { x: p[0], y: p[1] };
      const end = rel
        ? { x: pen.x + p[2], y: pen.y + p[3] }
        : { x: p[2], y: p[3] };
      commands.push({ type: 'Q', c, end });
      pen = { ...end };
      if (startPoint === null) startPoint = { ...pen };
    }
  }

  return commands;
}
