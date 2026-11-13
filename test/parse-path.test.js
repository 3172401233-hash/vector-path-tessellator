import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath } from '../src/parse-path.js';

test('解析绝对移动与直线命令', () => {
  const cmds = parsePath('M10,20 L30,40');
  assert.deepEqual(cmds, [
    { type: 'M', x: 10, y: 20 },
    { type: 'L', x: 30, y: 40 },
  ]);
});

test('相对命令基于当前画笔坐标累加', () => {
  const cmds = parsePath('m10,10 l5,0 l0,5');
  assert.deepEqual(cmds, [
    { type: 'M', x: 10, y: 10 },
    { type: 'L', x: 15, y: 10 },
    { type: 'L', x: 15, y: 15 },
  ]);
});

test('H/V 被规范化为 L，且支持相对形式', () => {
  const cmds = parsePath('M10,10 H30 V20 h-5 v-5');
  assert.deepEqual(cmds, [
    { type: 'M', x: 10, y: 10 },
    { type: 'L', x: 30, y: 10 },
    { type: 'L', x: 30, y: 20 },
    { type: 'L', x: 25, y: 20 },
    { type: 'L', x: 25, y: 15 },
  ]);
});

test('三次与二次贝塞尔的绝对/相对解析', () => {
  const abs = parsePath('M0,0 C1,2 3,4 5,6 Q7,8 9,10');
  assert.equal(abs[1].type, 'C');
  assert.deepEqual(abs[1].c1, { x: 1, y: 2 });
  assert.deepEqual(abs[1].end, { x: 5, y: 6 });
  assert.equal(abs[2].type, 'Q');
  assert.deepEqual(abs[2].c, { x: 7, y: 8 });

  const rel = parsePath('M1,1 c1,2 3,4 5,6 q1,1 2,2');
  assert.deepEqual(rel[1].c1, { x: 2, y: 3 });
  assert.deepEqual(rel[1].end, { x: 6, y: 7 });
  // C 结束后画笔在 (6,7)，相对 Q 的控制点与端点都相对该点累加。
  assert.deepEqual(rel[2].c, { x: 7, y: 8 });
  assert.deepEqual(rel[2].end, { x: 8, y: 9 });
});

test('Z 关闭子路径并把画笔移回起点', () => {
  const cmds = parsePath('M0,0 L10,0 L10,10 Z M20,20 L30,30');
  assert.equal(cmds[3].type, 'Z');
  assert.deepEqual(cmds[4], { type: 'M', x: 20, y: 20 });
});

test('M 的隐式重复坐标对按 L 处理', () => {
  const cmds = parsePath('M0,0 10,10 20,20');
  assert.deepEqual(cmds, [
    { type: 'M', x: 0, y: 0 },
    { type: 'L', x: 10, y: 10 },
    { type: 'L', x: 20, y: 20 },
  ]);
});

test('容忍空格、逗号、换行与无分隔数字', () => {
  const cmds = parsePath('M 10 , 20\nL30 40L50,60');
  assert.equal(cmds.length, 3);
  assert.deepEqual(cmds[2], { type: 'L', x: 50, y: 60 });
});

test('支持科学计数法与带符号指数', () => {
  const cmds = parsePath('M1e2,2E+1 L3e-1,4.5');
  assert.deepEqual(cmds[0], { type: 'M', x: 100, y: 20 });
  assert.deepEqual(cmds[1], { type: 'L', x: 0.3, y: 4.5 });
});

test('空字符串与纯空白返回空命令', () => {
  assert.deepEqual(parsePath(''), []);
  assert.deepEqual(parsePath('   \n\t '), []);
});

test('非法命令抛出 SyntaxError', () => {
  assert.throws(() => parsePath('M0,0 X1,1'), SyntaxError);
  assert.throws(() => parsePath('M0,0 A1,1 0 0 1 2,2'), SyntaxError);
});

test('路径必须以 M 开头', () => {
  assert.throws(() => parsePath('L1,1'), SyntaxError);
});

test('参数数量错误抛出明确错误', () => {
  assert.throws(() => parsePath('M0,0 L1'), /缺少参数/);
  assert.throws(() => parsePath('M0,0 C1,2 3,4 5'), /缺少参数/);
});

test('NaN 与 Infinity 坐标被拒绝', () => {
  assert.throws(() => parsePath('M0,0 LNaN,1'), RangeError);
  assert.throws(() => parsePath('M0,0 LInfinity,1'), RangeError);
  assert.throws(() => parsePath('M0,0 L-Infinity,1'), RangeError);
  assert.throws(() => parsePath('M0,0 1e999,0'), RangeError);
});

test('非字符串输入抛出 TypeError', () => {
  assert.throws(() => parsePath(42), TypeError);
  assert.throws(() => parsePath(null), TypeError);
});

test('Z 不能隐式重复', () => {
  assert.throws(() => parsePath('M0,0 L1,1 Z 2,3'), SyntaxError);
});
