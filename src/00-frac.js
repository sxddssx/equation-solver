// SPDX-License-Identifier: MIT
/* 一元一次/一元二次方程求解器 —— 模块 1/6：有理数与工具
 * 纯逻辑，无 DOM 依赖。所有模块挂在全局命名空间 __EqSolver 上，
 * 既能被浏览器（多个 <script> 或打包成一个文件）使用，也能被 Node require。
 */
(function (NS) {
  'use strict';

  /** 求解器可预期的错误（会作为友好提示返回给用户） */
  class EquationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'EquationError';
    }
  }

  /* ---------------- BigInt 工具 ---------------- */
  function absBig(a) { return a < 0n ? -a : a; }

  function gcdBig(a, b) {
    a = absBig(a); b = absBig(b);
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  function lcmBig(a, b) {
    if (a === 0n || b === 0n) return 0n;
    return absBig((a / gcdBig(a, b)) * b);
  }

  /** 整数平方根（牛顿迭代，只用 BigInt，不怕溢出） */
  function isqrtBig(n) {
    if (n < 0n) throw new EquationError('负数不能开平方');
    if (n < 2n) return n;
    const bits = n.toString(2).length;
    let x = 1n << BigInt(Math.ceil(bits / 2));   // 保证 x >= sqrt(n)
    for (;;) {
      const nx = (x + n / x) >> 1n;
      if (nx >= x) break;
      x = nx;
    }
    return x;
  }

  function isPerfectSquareBig(n) {
    if (n < 0n) return false;
    const r = isqrtBig(n);
    return r * r === n;
  }

  /* ---------------- 有理数 Frac ---------------- */
  /** 精确有理数：分子分母都是 BigInt，自动约分，分母恒为正 */
  function Frac(n, d) {
    if (n instanceof Frac) { this.n = n.n; this.d = n.d; return; }
    if (typeof n === 'string') { const p = Frac.parse(n); this.n = p.n; this.d = p.d; return; }
    n = BigInt(n === undefined || n === null ? 0 : n);
    d = BigInt(d === undefined || d === null ? 1 : d);
    if (d === 0n) throw new EquationError('分母不能为 0');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdBig(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }

  Frac.prototype.isZero = function () { return this.n === 0n; };
  Frac.prototype.isOne = function () { return this.n === 1n && this.d === 1n; };
  Frac.prototype.isNegOne = function () { return this.n === -1n && this.d === 1n; };
  Frac.prototype.isInt = function () { return this.d === 1n; };
  Frac.prototype.sign = function () { return this.n < 0n ? -1 : (this.n > 0n ? 1 : 0); };
  Frac.prototype.add = function (o) { o = new Frac(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); };
  Frac.prototype.sub = function (o) { o = new Frac(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); };
  Frac.prototype.mul = function (o) { o = new Frac(o); return new Frac(this.n * o.n, this.d * o.d); };
  Frac.prototype.div = function (o) {
    o = new Frac(o);
    if (o.isZero()) throw new EquationError('除数不能为 0');
    return new Frac(this.n * o.d, this.d * o.n);
  };
  Frac.prototype.neg = function () { return new Frac(-this.n, this.d); };
  Frac.prototype.abs = function () { return new Frac(absBig(this.n), this.d); };
  Frac.prototype.inv = function () {
    if (this.isZero()) throw new EquationError('分母不能为 0');
    return new Frac(this.d, this.n);
  };
  Frac.prototype.cmp = function (o) {
    o = new Frac(o);
    const l = this.n * o.d, r = o.n * this.d;
    return l < r ? -1 : (l > r ? 1 : 0);
  };
  Frac.prototype.eq = function (o) { return this.cmp(o) === 0; };
  Frac.prototype.toNumber = function () { return Number(this.n) / Number(this.d); };
  Frac.prototype.toString = function () { return this.d === 1n ? this.n.toString() : this.n + '/' + this.d; };
  Frac.prototype.valueOf = function () { return this.toNumber(); };

  /** 解析十进制字符串："3"、"-2.5"、".5"（也可接受分子/分母形式 "3/4"） */
  Frac.parse = function (s) {
    s = String(s).trim();
    const slash = /^([+-]?\d+)\/(\d+)$/.exec(s);
    if (slash) return new Frac(BigInt(slash[1]), BigInt(slash[2]));
    const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (!m[2] && !m[3])) throw new EquationError('无法识别的数字：' + s);
    const sign = m[1] === '-' ? -1n : 1n;
    const intPart = m[2] || '0';
    const fracPart = m[3] || '';
    const n = BigInt(intPart + fracPart) * sign;
    const d = fracPart ? 10n ** BigInt(fracPart.length) : 1n;
    return new Frac(n, d);
  };

  NS.EquationError = EquationError;
  NS.Frac = Frac;
  NS.util = {
    absBig: absBig, gcdBig: gcdBig, lcmBig: lcmBig,
    isqrtBig: isqrtBig, isPerfectSquareBig: isPerfectSquareBig
  };
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);