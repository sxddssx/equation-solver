// SPDX-License-Identifier: MIT
/* 模块 2/6：多项式运算与显示格式化 */
(function (NS) {
  'use strict';
  const Frac = NS.Frac;
  const Error_ = NS.EquationError;
  const ZERO = new Frac(0n);
  const ONE = new Frac(1n);

  /* 多项式用「系数数组」表示：p[k] 是 x^k 的系数（Frac），下标即次数 */
  function pTrim(p) {
    let i = p.length - 1;
    while (i > 0 && p[i].isZero()) i--;
    return p.slice(0, i + 1);
  }

  function pIsZero(p) { return pTrim(p).length === 1 && pTrim(p)[0].isZero(); }

  function pAdd(a, b) {
    const n = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push((a[i] || ZERO).add(b[i] || ZERO));
    return pTrim(out);
  }

  function pNeg(a) { return pTrim(a.map(c => c.neg())); }

  function pSub(a, b) { return pAdd(a, pNeg(b)); }

  function pMul(a, b) {
    if (a.length === 1 && a[0].isZero()) return [ZERO];
    if (b.length === 1 && b[0].isZero()) return [ZERO];
    const out = new Array(a.length + b.length - 1);
    for (let i = 0; i < out.length; i++) out[i] = ZERO;
    for (let i = 0; i < a.length; i++) {
      if (a[i].isZero()) continue;
      for (let j = 0; j < b.length; j++) {
        if (b[j].isZero()) continue;
        out[i + j] = out[i + j].add(a[i].mul(b[j]));
      }
    }
    return pTrim(out);
  }

  function pScale(a, f) { f = new Frac(f); return pTrim(a.map(c => c.mul(f))); }

  /** 除以常数（除数含未知数时报错：本工具只支持整式方程） */
  function pDiv(a, b) {
    b = pTrim(b);
    if (b.length > 1) throw new Error_('未知数不能出现在分母里，请先把分母化为常数（本工具只支持整式方程）');
    if (b[0].isZero()) throw new Error_('除数不能为 0');
    return pScale(a, b[0].inv());
  }

  function pPow(base, k) {
    base = pTrim(base);
    if (k === 0n) return [ONE];
    if (k === 1n) return base;
    if (BigInt(base.length - 1) * k > 20n) throw new Error_('化简后的次数过高（超过 20 次），无法处理');
    let out = [ONE];
    for (let i = 0n; i < k; i++) out = pMul(out, base);
    return pTrim(out);
  }

  /** 指数必须是 0~20 的整数常数 */
  function pToConstantInt(p) {
    p = pTrim(p);
    if (p.length > 1) throw new Error_('指数必须是常数（不能含未知数）');
    const f = p[0];
    if (f.d !== 1n) throw new Error_('指数必须是整数');
    if (f.n < 0n) throw new Error_('暂不支持负指数（如 x^-1）');
    if (f.n > 20n) throw new Error_('指数太大（最大支持 20 次）');
    return f.n;
  }

  /* ---------------- 数字 / 表达式的显示 ---------------- */

  /** 分数的基本信息：是否整数、是否只有 2 和 5 的因子（可写成有限小数） */
  function decInfo(f) {
    let d = f.d, k2 = 0, k5 = 0;
    while (d % 2n === 0n) { d /= 2n; k2++; }
    while (d % 5n === 0n) { d /= 5n; k5++; }
    if (d !== 1n) return null;
    const e = Math.max(k2, k5);
    if (e > 40) return null;
    return { e: e };
  }

  /** 精确的十进制字符串（仅当分母只含因子 2、5），否则返回 null */
  function exactDecimal(f) {
    if (f.d === 1n) return f.n.toString();
    const info = decInfo(f);
    if (!info) return null;
    const scaled = f.n * (10n ** BigInt(info.e)) / f.d;    // 恰好整除
    const neg = scaled < 0n;
    let s = (neg ? -scaled : scaled).toString();
    const e = info.e;
    if (e > 0) {
      while (s.length <= e) s = '0' + s;
      s = s.slice(0, s.length - e) + '.' + s.slice(s.length - e);
      s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return (neg ? '-' : '') + s;
  }

  function numToStr(x, digits) {
    if (!isFinite(x)) return String(x);
    digits = digits || 6;
    if (Math.abs(x) < 1e-12) return '0';
    const abs = Math.abs(x);
    if (abs >= 1e6 || abs < 1e-4) return x.toExponential(4).replace(/e([+-])(\d+)/, 'e$1$2');
    let s = x.toFixed(digits);
    s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return s;
  }

  /** 分数显示：整数直接显示；分数显示 "n/d" */
  function fmtFrac(f) {
    f = new Frac(f);
    if (f.d === 1n) return f.n.toString();
    return f.n + '/' + f.d;
  }

  /** 分数显示（带小数对照），用于「解」这一类需要直观的地方 */
  function fmtFracBoth(f) {
    f = new Frac(f);
    if (f.d === 1n) return f.n.toString();
    const dec = exactDecimal(f);
    return dec !== null ? (f.n + '/' + f.d + ' = ' + dec) : (f.n + '/' + f.d + ' ≈ ' + numToStr(f.toNumber(), 8));
  }

  /** 作为系数参与乘法时加括号：(2/3)x */
  function fmtCoef(f) { f = new Frac(f); return f.d === 1n ? f.n.toString() : '(' + f.n + '/' + f.d + ')'; }

  /** 系数 + 未知数：-x、3x、(-2/3)x、x */
  function coefVar(f, v) {
    f = new Frac(f);
    if (f.isOne()) return v;
    if (f.isNegOne()) return '-' + v;
    return fmtCoef(f) + v;
  }

  /** 多项式转文字（按次数从高到低），如 2x² - 8x + 6 */
  function polyToText(p, v) {
    p = pTrim(p);
    if (p.length === 1 && p[0].isZero()) return '0';
    const parts = [];
    for (let k = p.length - 1; k >= 0; k--) {
      const c = p[k];
      if (c.isZero()) continue;
      const neg = c.n < 0n;
      const a = c.abs();
      let coefStr = '', varStr = '';
      if (k === 0) {
        coefStr = fmtFrac(a);
      } else if (k === 1) {
        varStr = v;
        coefStr = a.isOne() ? '' : fmtCoef(a);
      } else {
        varStr = v + (k === 2 ? '²' : (k === 3 ? '³' : '^' + k));
        coefStr = a.isOne() ? '' : fmtCoef(a);
      }
      const body = coefStr + varStr;
      if (parts.length === 0) parts.push((neg ? '-' : '') + body);
      else parts.push((neg ? ' - ' : ' + ') + body);
    }
    return parts.length ? parts.join('') : '0';
  }

  NS.poly = {
    ZERO: ZERO, ONE: ONE, pTrim: pTrim, pIsZero: pIsZero, pAdd: pAdd, pNeg: pNeg,
    pSub: pSub, pMul: pMul, pScale: pScale, pDiv: pDiv, pPow: pPow, pToConstantInt: pToConstantInt
  };
  NS.fmt = {
    fmtFrac: fmtFrac, fmtFracBoth: fmtFracBoth, fmtCoef: fmtCoef, coefVar: coefVar,
    polyToText: polyToText, numToStr: numToStr, exactDecimal: exactDecimal
  };
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);