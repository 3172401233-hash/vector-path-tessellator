# vector-path-tessellator

零依赖的 Node.js 二维路径几何与三角化库，面向游戏编辑器导入玩家自定义图标的场景。
只做几何处理：解析 SVG path data、自适应展开曲线、应用仿射变换，并输出确定性的
顶点数组与三角形索引。**不依赖 Canvas、DOM、浏览器、图形界面或任何第三方包。**

## 特性

- **路径解析**：支持 `M L H V C Q Z` 的绝对（大写）与相对（小写）命令，自动处理
  隐式重复命令、`H/V` 归一化、科学计数法、逗号/空白分隔。
- **自适应曲线展开**：三次/二次贝塞尔曲线按可配置 `tolerance` 递归细分
  （de Casteljau），容差越小顶点越多，误差有界且收敛。
- **仿射变换**：平移、缩放、旋转、错切、任意 6 元素矩阵及矩阵复合，变换作用于
  直线端点与曲线控制点。
- **填充规则**：`nonzero` 与 `evenodd`，基于水平条带 + 环绕数扫描，原生支持
  闭合子路径、带洞多边形、自交路径与反向边界。
- **描边**：`miter` / `round` / `bevel` 转角与 `butt` / `round` / `square` 端点，
  正确实现 `miterLimit`（超限回退 bevel）。
- **健壮输出**：顶点焊接、退化三角形剔除、统一逆时针绕序、无 NaN/无限坐标/
  反绕/重复三角形；相同输入重复运行结果逐字节一致。
- **严格报错**：非法命令、参数数量错误、非有限坐标、非法枚举值均抛出带中文说明的
  `SyntaxError` / `RangeError` / `TypeError`。

## 环境要求

- Node.js >= 18（仅使用内置的 `node:test`、`node:assert` 与标准 ES 模块）。

## 安装与测试

```bash
npm test          # 等价于 node --test
```

## 快速上手

```js
import { Path, translate, scale } from 'vector-path-tessellator';

// 1. 解析 SVG path
const path = Path.fromSVG('M0,0 C10,-20 30,-20 40,0 L40,20 L0,20 Z');

// 2. 应用仿射变换（返回新 Path，原对象不变）
const moved = path.transform(translate(100, 100)).transform(scale(2, 2));

// 3. 填充三角化
const fill = moved.tessellateFill({
  fillRule: 'evenodd', // 'nonzero'（默认）或 'evenodd'
  tolerance: 0.25,     // 曲线展开误差，默认 0.25
});
// fill.vertices: 扁平数字数组 [x0,y0,x1,y1,...]
// fill.indices:  扁平三角形索引 [a,b,c, ...]，每个三角形逆时针

// 4. 描边三角化
const stroke = path.tessellateStroke({
  lineWidth: 4,
  lineJoin: 'miter',   // 'miter' | 'round' | 'bevel'
  lineCap: 'butt',     // 'butt'  | 'round' | 'square'
  miterLimit: 10,
  tolerance: 0.25,
});

// 5. 一次调用同时拿到填充与描边
const out = path.tessellate({ fillRule: 'nonzero', stroke: true, lineWidth: 2 });
```

空路径返回空结果而非抛错：

```js
Path.fromSVG('').tessellateFill();   // { vertices: [], indices: [] }
Path.fromSVG('').tessellateStroke({ lineWidth: 2 }); // { vertices: [], indices: [] }
```

## API

### `Path`

- `Path.fromSVG(d)`：从 SVG path 字符串构造。
- `path.commands`：规范化后的绝对命令序列（`M/L/C/Q/Z`）。
- `path.isEmpty`：是否无任何命令。
- `path.toSubpaths({ tolerance })`：展开为 `[{ points: [{x,y}...], closed }]`。
- `path.transform(matrix)`：返回变换后的新 `Path`。
- `path.tessellateFill(options)`：填充三角化。
- `path.tessellateStroke(options)`：描边三角化。
- `path.tessellate(options)`：同时返回 `{ vertices, indices, fill, stroke }`，
  未开启 `stroke` 时 `stroke` 为 `null`。

### 矩阵（`src/matrix.js`）

采用 SVG/Canvas 的 6 元素约定 `[a,b,c,d,e,f]`：
`x' = a*x + c*y + e`，`y' = b*x + d*y + f`。

- `identity()`、`affine(a,b,c,d,e,f)`、`translate(tx,ty)`、`scale(sx,sy?)`、
  `rotate(rad,cx?,cy?)`、`skewX(rad)`、`skewY(rad)`
- `multiply(m1, m2)`：矩阵复合（先应用 `m2` 再应用 `m1`）
- `applyPoint(m, x, y)`、`determinant(m)`、`isInvertible(m)`

### 选项

| 选项 | 适用 | 默认 | 说明 |
| --- | --- | --- | --- |
| `tolerance` | 填充/描边 | `0.25` | 曲线展开与圆弧细分的误差上限，必须为正数 |
| `fillRule` | 填充 | `nonzero` | `nonzero` 或 `evenodd` |
| `lineWidth` | 描边 | `1` | 描边宽度，必须为正数 |
| `lineJoin` | 描边 | `miter` | `miter` / `round` / `bevel` |
| `lineCap` | 描边 | `butt` | `butt` / `round` / `square` |
| `miterLimit` | 描边 | `10` | 斜接长度比上限，小于 1 报错，超限回退 bevel |

## 实现概要

- **曲线展开**：基于控制点到弦的距离判断平展度，递归 de Casteljau 细分，
  设最大深度防止无限递归。
- **相交处理**：填充前对所有线段求交并切分，覆盖普通交点、端点相接、T 型相交、
  共线重叠；随后的水平条带内不再存在顶点事件，跨边左右顺序稳定。
- **环绕数扫描**：逐条带从左到右累积环绕数（nonzero 看带符号值，evenodd 看跨边
  奇偶），把填充区间输出为梯形并拆成两个逆时针三角形。
- **顶点焊接**：按坐标量级取相对容差的网格键合并重合点，配合退化面积剔除，
  保证无重复/反绕三角形，同时兼顾极大与极小坐标尺度。
- **描边轮廓**：沿折线两侧做法线偏移，按转角类型生成 miter 尖点 / round 圆弧 /
  bevel 切角；闭合路径输出方向相反的内外两个简单环，开放路径用端帽连接成单环。

## 输出约定与错误处理

- `vertices` 为扁平 `number[]`，`indices` 为扁平整数 `number[]`，长度恒为 3 的倍数。
- 所有三角形保证逆时针、索引合法、无重复顶点引用、无重复三角形、坐标全部有限。
- 非法输入抛出异常而非静默丢弃：
  - 不支持的命令、首命令非 `M`、参数缺失 → `SyntaxError`
  - `NaN` / `Infinity` / 溢出坐标、非法枚举、非正容差或线宽 → `RangeError`
  - 非字符串路径、错误形状的矩阵 → `TypeError`
- 重复顶点、退化线段、自交路径、孔洞与反向边界不会导致崩溃或静默丢数据。

## 目录结构

```
src/
  index.js           公共入口与 bounds 工具
  path.js            Path 门面 API
  parse-path.js      SVG path 词法/语法解析
  flatten.js         曲线自适应展开
  matrix.js          仿射矩阵
  intersections.js   线段求交与切分
  fill-tessellate.js 填充三角化（条带 + 环绕数）
  stroke.js          描边轮廓与三角化
  math-utils.js      共享数学工具
test/
  fixtures.js                代码生成的测试夹具与不变量断言
  parse-path.test.js
  flatten.test.js
  fill-tessellate.test.js
  stroke.test.js
  transform.test.js
  integration.test.js
```

## 范围与已知边界

库只实现二维路径几何，不做渲染、光栅化或字体解析。当前不支持 SVG 的 `A`（椭圆弧）
命令与 `S/T` 平滑命令——遇到这些命令会明确抛出 `SyntaxError`，而不是静默产生错误结果。
