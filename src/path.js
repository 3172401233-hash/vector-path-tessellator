// 公共 Path API：解析 SVG path data、展开曲线、应用仿射变换，
// 并输出确定性的顶点/三角形索引（填充与描边）。

import { parsePath } from './parse-path.js';
import { flatten } from './flatten.js';
import { applyPoint, identity } from './matrix.js';
import { tessellateFill } from './fill-tessellate.js';
import { tessellateStroke } from './stroke.js';
import { assertFinite, assertPoint } from './math-utils.js';

export class Path {
  constructor() {
    this._commands = [];
  }

  static fromSVG(d) {
    const path = new Path();
    path._commands = parsePath(d);
    return path;
  }

  get commands() {
    return this._commands;
  }

  get isEmpty() {
    return this._commands.length === 0;
  }

  // 返回折线子路径 [{ points, closed }]，曲线按 tolerance 自适应展开。
  toSubpaths(options = {}) {
    return flatten(this._commands, options);
  }

  // 应用仿射矩阵，返回新的 Path，原对象不变。
  transform(matrix) {
    if (!Array.isArray(matrix) || matrix.length !== 6) {
      throw new TypeError('transform 需要长度为 6 的仿射矩阵 [a,b,c,d,e,f]');
    }
    const copy = new Path();
    copy._commands = this._commands.map((cmd) => transformCommand(cmd, matrix));
    return copy;
  }

  tessellate(options = {}) {
    if (this.isEmpty) {
      return {
        vertices: [],
        indices: [],
        fill: { vertices: [], indices: [] },
        stroke: null,
      };
    }
    const subpaths = flatten(this._commands, options);
    const fill = tessellateFill(subpaths, options);
    validateOutput(fill);

    let stroke = null;
    if (options.stroke) {
      stroke = tessellateStroke(subpaths, options);
      validateOutput(stroke);
    }

    return {
      vertices: fill.vertices,
      indices: fill.indices,
      fill,
      stroke,
    };
  }

  tessellateFill(options = {}) {
    if (this.isEmpty) return { vertices: [], indices: [] };
    const subpaths = flatten(this._commands, options);
    const result = tessellateFill(subpaths, options);
    validateOutput(result);
    return result;
  }

  tessellateStroke(options = {}) {
    if (this.isEmpty) return { vertices: [], indices: [] };
    const subpaths = flatten(this._commands, options);
    const result = tessellateStroke(subpaths, options);
    validateOutput(result);
    return result;
  }
}

function transformCommand(cmd, matrix) {
  const map = (pt) => {
    const out = applyPoint(matrix, pt.x, pt.y);
    assertPoint(out.x, out.y);
    return out;
  };
  if (cmd.type === 'M' || cmd.type === 'L') {
    const pt = map(cmd);
    return { type: cmd.type, x: pt.x, y: pt.y };
  }
  if (cmd.type === 'C') {
    return {
      type: 'C',
      c1: map(cmd.c1),
      c2: map(cmd.c2),
      end: map(cmd.end),
    };
  }
  if (cmd.type === 'Q') {
    return { type: 'Q', c: map(cmd.c), end: map(cmd.end) };
  }
  return { ...cmd };
}

function validateOutput(result) {
  for (const value of result.vertices) {
    assertFinite(value, 'output vertex');
  }
  const vertexCount = result.vertices.length / 2;
  for (const index of result.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError(`三角形索引越界: ${index}`);
    }
  }
}

export { identity };
