/* 界面冒烟测试：用最小 DOM 桩把「单文件版」里的脚本真正跑一遍，
 * 验证界面能渲染解集、能响应按钮点击 / 回车、折叠区块可用、错误提示正常。
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
  return new Proxy({}, {
    get(t, k) { if (!(k in t)) t[k] = function () {}; return t[k]; },
    set(t, k, v) { t[k] = v; return true; }
  });
}

function mkNode(tag) {
  const n = {
    tagName: tag, children: [], className: '', _text: '', text: '', style: {}, hidden: false, open: false,
    value: '', type: '', width: 0, height: 0, clientWidth: 640, clientHeight: 260,
    _listeners: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener() {},
    getContext() { return ctxStub(); },
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
function findDetails(node, out) {
  out = out || [];
  (node.children || []).forEach(c => {
    if (c.tagName === 'details') out.push(c);
    findDetails(c, out);
  });
  return out;
}
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
expect(NS && typeof NS.solve === 'function', '内联脚本没有暴露求解接口');

/* 1. 打开页面：不带示例、不自动求解 */
expect(registry.eq.value === '', '输入框不应预填示例方程：' + registry.eq.value);
expect(registry.result.children.length === 0, '未求解时结果区应该是空的');
expect(!/id="examples"/.test(html), '单文件里仍然残留示例区 #examples');
expect(registry.historyCard.hidden === true, '没有历史记录时该区块应隐藏');

/* 2. 求解 x² - 5x + 6 = 0 */
solve('x² - 5x + 6 = 0');
let t = resultText();
expect(/x₁ = 2/.test(t) && /x₂ = 3/.test(t), '解集没有渲染出来：' + t.slice(0, 160));
expect(/判别式 Δ/.test(t), '界面没有显示判别式');
expect(/解题步骤/.test(t), '界面没有解题步骤区块');
expect(/函数图像/.test(t), '界面没有函数图像区块');
expect(/代入验算/.test(t), '界面没有代入验算步骤');

/* 3. 图像 / 步骤 / 历史都应该是可折叠的（<details>，默认收起） */
const folds = findDetails(registry.result);
expect(folds.length === 2, '结果区应有 2 个折叠区块（图像、步骤），实际 ' + folds.length);
folds.forEach((f, i) => {
  expect(f.open === false, '第 ' + (i + 1) + ' 个折叠区块默认应处于收起状态');
  expect((f._listeners.toggle || []).length === 1, '第 ' + (i + 1) + ' 个折叠区块没有绑定折叠事件');
  expect(/fold-meta/.test(textOf(f)) || textOf(f).length > 0, '折叠区块标题为空');
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

/* 5. 点击求解：2x + 3 = 5x - 9 → x = 4 */
solve('2x + 3 = 5x - 9');
expect(/x = 4/.test(resultText()), '点击求解后没有得到 x = 4：' + resultText().slice(0, 160));

/* 6. 回车求解复数根 */
enter('x^2 + 1 = 0');
expect(/复数/.test(resultText()) && /i/.test(resultText()), '复数根没有正确显示');

/* 7. 恒等式 */
enter('x + 1 = x + 1');
expect(/任意实数/.test(resultText()), '恒等式提示不正确');

/* 8. 非法输入应给出友好提示，而不是崩掉 */
solve('1/x = 2');
expect(/算不出来/.test(resultText()), '非法输入没有显示错误卡片');

/* 9. 复制按钮不应报错 */
fire(registry.copyBtn, 'click');
expect(registry.toast && registry.toast._text.length > 0, '点击复制后没有任何反馈');

/* 10. 历史记录：可折叠、有内容、点击可复用 */
expect(registry.historyCard.hidden === false, '有历史记录时该区块仍隐藏');
expect(registry.history.children.length >= 2, '历史记录没有累积：' + registry.history.children.length);
expect((registry.historyCard._listeners.toggle || []).length === 1, '历史记录区块没有绑定折叠事件');
registry.historyCard.open = true;
fire(registry.historyCard, 'toggle');
expect(foldState().history === true, '历史记录的展开状态没有被记住');
fire(registry.history.children[0], 'click');
expect(resultText().length > 0, '点击历史记录没有重新求解');

if (problems.length) {
  console.log('界面冒烟测试失败：');
  problems.forEach(p => console.log('  ✗ ' + p));
  process.exitCode = 1;
} else {
  console.log('界面冒烟测试全部通过 ✓（无示例 / 折叠区块 / 渲染 / 按钮 / 回车 / 错误提示 / 复制 / 历史记录）');
}