/* 界面冒烟测试：用最小 DOM 桩把「单文件版」里的脚本真正跑一遍，
 * 验证界面能渲染解集 / 计算结果 / 函数图像，按钮、回车、折叠区块、角度制切换、
 * 复制、历史记录、错误提示都正常。
 * 用法：node test/dom-smoke.js   （需先运行 node build.js）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = /<script>([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.error('未在单文件里找到内联脚本，请先运行 node build.js'); process.exit(1); }
const code = m[1];

/* ---------------- 最小 DOM 桩 ---------------- */
function ctxStub() {
  const calls = { count: 0 };
  return new Proxy({}, {
    get(t, k) {
      if (k === '__calls') return calls;
      if (!(k in t)) t[k] = function () { calls.count++; };
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

function mkNode(tag) {
  const n = {
    tagName: tag, children: [], className: '', _text: '', text: '', style: {}, hidden: false, open: false,
    value: '', type: '', width: 0, height: 0, clientWidth: 640, clientHeight: 260, title: '', placeholder: '',
    _listeners: {}, _attrs: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener() {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    getContext() { return this._ctx || (this._ctx = ctxStub()); },
    select() {}, focus() {}, scrollIntoView() {},
    contains() { return true; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); this.children.length = 0; }
  };
  Object.defineProperty(n, 'firstChild', { get() { return this.children.length ? this.children[0] : null; } });
  return n;
}

// 真实页面里 #historyCard 是 <details>，这里同样预置，保证行为一致
const registry = { historyCard: mkNode('details') };
const document = {
  readyState: 'complete',
  body: mkNode('body'),
  createElement: mkNode,
  createTextNode(t) { const n = mkNode('#text'); n.textContent = t; return n; },
  getElementById(id) {
    if (id === 'examples') return null;          // 页面里已经没有示例区
    return registry[id] || (registry[id] = mkNode('div'));
  },
  addEventListener() {},
  execCommand() { return true; }
};
const localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); }
};
const window = { document, innerWidth: 1200, devicePixelRatio: 1, addEventListener() {} };
const navigator = {};

const sandbox = {
  document, window, navigator, localStorage, console,
  setTimeout, clearTimeout, Math, JSON, Date, String, Number, Boolean, Array, Object,
  isFinite, isNaN, parseInt, parseFloat, Error, TypeError, BigInt, Proxy, Symbol, Function, RegExp
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ---------------- 工具 ---------------- */
function textOf(node) {
  if (!node) return '';
  let s = node._text || '';
  (node.children || []).forEach(c => { s += ' ' + textOf(c); });
  return s;
}
function collect(node, tag, out) {
  out = out || [];
  (node.children || []).forEach(c => {
    if (c.tagName === tag) out.push(c);
    collect(c, tag, out);
  });
  return out;
}
function findDetails(node) { return collect(node, 'details'); }
function findCanvas(node) { return collect(node, 'canvas'); }
function fire(node, type, ev) { (node._listeners[type] || []).forEach(fn => fn(ev || {})); }

const problems = [];
function expect(cond, msg) { if (!cond) problems.push(msg); }
function resultText() { return textOf(registry.result); }
function solve(q) {
  registry.eq.value = q;
  fire(registry.solveBtn, 'click');
}
function enter(q) {
  registry.eq.value = q;
  fire(registry.eq, 'keydown', { key: 'Enter', preventDefault() {} });
}
function foldState() {
  try { return JSON.parse(localStorage.getItem('eq-solver-fold-v1')) || {}; } catch (e) { return {}; }
}

try {
  vm.runInContext(code, sandbox, { filename: 'built-inline.js' });
} catch (err) {
  console.error('✗ 单文件内联脚本运行出错：' + err.message + '\n' + (err.stack || ''));
  process.exit(1);
}
const NS = sandbox.__EqSolver;
expect(NS && typeof NS.compute === 'function', '内联脚本没有暴露 compute 接口');
expect(NS && typeof NS.solve === 'function', '内联脚本没有暴露 solve 接口');
expect(NS && typeof NS.plot === 'object', '内联脚本没有暴露绘图模块');

/* 1. 打开页面：不带示例、不自动求解 */
expect(registry.eq.value === '', '输入框不应预填示例：' + registry.eq.value);
expect(registry.result.children.length === 0, '未计算时结果区应该是空的');
expect(!/id="examples"/.test(html), '单文件里仍然残留示例区 #examples');
expect(registry.historyCard.hidden === true, '没有历史记录时该区块应隐藏');
expect(/角度制/.test(registry.angleBtn._text), '角度制按钮没有初始化为角度制：' + registry.angleBtn._text);

/* 2. 解方程 x² - 5x + 6 = 0 */
solve('x² - 5x + 6 = 0');
let t = resultText();
expect(/x₁ = 2/.test(t) && /x₂ = 3/.test(t), '解集没有渲染出来：' + t.slice(0, 160));
expect(/判别式 Δ/.test(t), '界面没有显示判别式');
expect(/解题步骤/.test(t), '界面没有解题步骤区块');
expect(/函数图像/.test(t), '界面没有函数图像区块');
expect(/代入验算/.test(t), '界面没有代入验算步骤');
const canvas0 = findCanvas(registry.result)[0];
expect(canvas0 && canvas0.width > 0, '函数图像的画布没有初始化');
expect(canvas0 && canvas0._ctx && canvas0._ctx.__calls.count > 20, '函数图像没有真正画上去');

/* 3. 图像 / 步骤都应该是可折叠的（<details>，默认收起） */
const folds = findDetails(registry.result);
expect(folds.length === 2, '结果区应有 2 个折叠区块（图像、步骤），实际 ' + folds.length);
folds.forEach((f, i) => {
  expect(f.open === false, '第 ' + (i + 1) + ' 个折叠区块默认应处于收起状态');
  expect((f._listeners.toggle || []).length === 1, '第 ' + (i + 1) + ' 个折叠区块没有绑定折叠事件');
  expect(textOf(f).length > 0, '折叠区块标题为空');
});
const plotFold = folds.filter(f => /函数图像/.test(textOf(f)))[0];
const stepsFold = folds.filter(f => /解题步骤/.test(textOf(f)))[0];
expect(/共 \d+ 步/.test(textOf(stepsFold)), '步骤区块标题没有显示步数');

/* 4. 展开折叠区块：不应报错，并且状态被记住 */
if (plotFold) { plotFold.open = true; fire(plotFold, 'toggle'); }
if (stepsFold) { stepsFold.open = true; fire(stepsFold, 'toggle'); }
const st = foldState();
expect(st.plot === true && st.steps === true, '展开状态没有被记住：' + JSON.stringify(st));
expect(/x₁ = 2/.test(resultText()), '展开后内容丢失');

/* 5. 图像卡片的 x 范围可以手动调整 */
const numInputs = collect(plotFold, 'input');
expect(numInputs.length === 2, '图像卡片里应有 2 个 x 范围输入框，实际 ' + numInputs.length);
if (numInputs.length === 2) {
  numInputs[0].value = '-1';
  numInputs[1].value = '4';
  fire(numInputs[0], 'change');
  const canvasAfter = findCanvas(registry.result)[0];
  expect(canvasAfter && canvasAfter._ctx.__calls.count > 20, '调整 x 范围后没有重画');
}

/* 6. 一次方程：2x + 3 = 5x - 9 → x = 4 */
solve('2x + 3 = 5x - 9');
expect(/x = 4/.test(resultText()), '点击求解后没有得到 x = 4：' + resultText().slice(0, 160));

/* 7. 回车求解复数根 */
enter('x^2 + 1 = 0');
expect(/复数/.test(resultText()) && /i/.test(resultText()), '复数根没有正确显示');

/* 8. 高次方程：x^3 = 8 */
enter('x^3 = 8');
expect(/x₁ = 2/.test(resultText()) && /√3/.test(resultText()), '高次方程没有求出全部根：' + resultText().slice(0, 200));

/* 9. 恒等式 */
enter('x + 1 = x + 1');
expect(/任意实数/.test(resultText()), '恒等式提示不正确');

/* 10. 算式模式：2+3*4 = 14 */
solve('2+3*4');
t = resultText();
expect(/计算结果/.test(t), '算式模式没有显示「计算结果」卡片：' + t.slice(0, 120));
expect(/= 14/.test(t), '算式 2+3*4 没有得到 14：' + t.slice(0, 120));
expect(findDetails(registry.result).length === 0, '算式结果不应该有折叠区块');

/* 11. 角度制 / 弧度制切换：sin(pi/2) 在弧度制下是 1 */
solve('sin(pi/2)');
expect(/= 0\.02/.test(resultText()), '角度制下 sin(pi/2) 应该约等于 0.0274：' + resultText().slice(0, 120));
fire(registry.angleBtn, 'click');
expect(/弧度制/.test(registry.angleBtn._text), '点击后按钮没有变成弧度制：' + registry.angleBtn._text);
expect(/= 1/.test(resultText()), '弧度制下 sin(pi/2) 应该等于 1，实际：' + resultText().slice(0, 120));
fire(registry.angleBtn, 'click');
expect(/角度制/.test(registry.angleBtn._text), '再点一次应切回角度制');
expect(localStorage.getItem('eq-solver-angle-v1') === 'deg', '角度制设置没有写进 localStorage');

/* 12. 绘图命令：plot x^2 - 4 */
solve('plot x^2 - 4');
t = resultText();
expect(/函数图像/.test(t), '绘图命令没有生成图像卡片');
const plotFolds = findDetails(registry.result);
expect(plotFolds.length === 1 && plotFolds[0].open === true, '绘图命令的图像卡片应当只有一个并且默认展开');
expect(/二次函数/.test(t), '图像卡片没有显示函数类型：' + t.slice(0, 160));
expect(/与 x 轴的交点/.test(t), '图像说明里没有交点信息：' + t.slice(0, 200));
const canvas2 = findCanvas(registry.result)[0];
expect(canvas2 && canvas2._ctx.__calls.count > 20, '绘图命令没有真正画出曲线');

/* 13. 非法输入应给出友好提示，而不是崩掉 */
solve('1/x = 2');
expect(/算不出来/.test(resultText()), '非法输入没有显示错误卡片');
solve('x+y=1');
expect(/只支持一个未知数/.test(resultText()), '多变量方程的错误提示不对：' + resultText().slice(0, 160));

/* 14. 复制按钮不应报错 */
fire(registry.copyBtn, 'click');
expect(registry.toast && registry.toast._text.length > 0, '点击复制后没有任何反馈');

/* 15. 历史记录：可折叠、有内容、点击可复用 */
expect(registry.historyCard.hidden === false, '有历史记录时该区块仍隐藏');
expect(registry.history.children.length >= 5, '历史记录没有累积：' + registry.history.children.length);
expect((registry.historyCard._listeners.toggle || []).length === 1, '历史记录区块没有绑定折叠事件');
registry.historyCard.open = true;
fire(registry.historyCard, 'toggle');
expect(foldState().history === true, '历史记录的展开状态没有被记住');
fire(registry.history.children[0], 'click');
expect(resultText().length > 0, '点击历史记录没有重新计算');

if (problems.length) {
  console.log('界面冒烟测试失败：');
  problems.forEach(p => console.log('  ✗ ' + p));
  process.exitCode = 1;
} else {
  console.log('界面冒烟测试全部通过 ✓（方程 / 算式 / 绘图 / 角度制 / 折叠区块 / 范围调节 / 错误提示 / 复制 / 历史记录）');
}
