// SPDX-License-Identifier: MIT
/* 模块 4/6：二次方程求解用的数学工具（判别式、根式化简、精确根格式化） */
(function (NS) {
  'use strict';
  const Frac = NS.Frac;
  const Error_ = NS.EquationError;
  const U = NS.util;
  const F = NS.fmt;

  /** 把 √f（f>0，有理数）写成 s·√M / Q 的形式（M 尽量为无平方因子整数） */
  function sqrtForm(f) {
    f = new Frac(f);
    if (f.sign() <= 0) throw new Error_('只有正数才能开平方');
    const prod = f.n * f.d;            // √(n/d) = √(n·d)/d
    let n = prod, s = 1n, M = 1n, d = 2n;
    const LIMIT = 200000n;             // 性能保护：极端大的数不做完全分解
    while (d * d <= n) {
      if (n % d === 0n) {
        let e = 0;
        while (n % d === 0n) { n /= d; e++; }
        const half = e >> 1;
        if (half > 0) s *= d ** BigInt(half);
        if (e % 2 === 1) M *= d;
      }
      if (d > LIMIT) break;
      d += 1n;
    }
    if (n > 1n) M *= n;
    return { s: s, M: M, Q: f.d };
  }

  /**
   * 把 (-b ± s√M/Q) / (2a) 化成 (A ± K√M) / D，A、K、D 为整数且已约简，D > 0。
   * 二次方程求根公式与复数根用的是同一个式子，所以共用这个函数。
   */
  function radicalPair(a, b, s, M, Q) {
    const q = new Frac(Q);
    const D0 = a.mul(new Frac(2n)).mul(q);   // 分母 2aQ
    const N0 = b.neg().mul(q);               // 有理部分 -bQ
    const L = U.lcmBig(N0.d, D0.d);          // 通分因子：分子分母同乘 L，全部变成整数
    if (L === 0n) throw new Error_('计算过程出现异常（分母为 0）');
    let A = N0.n * (L / N0.d);
    let K = s * L;
    let D = D0.n * (L / D0.d);
    let Mv = M;
    let g = U.gcdBig(U.gcdBig(U.absBig(A), U.absBig(K)), U.absBig(D));
    if (g > 1n) { A /= g; K /= g; D /= g; }
    if (D < 0n) { A = -A; K = -K; D = -D; }
    return { A: A, K: K, M: Mv, D: D };
  }

  /** A ± K√M 的文字形式（k 带符号） */
  function numWithRadical(A, k, M) {
    const kk = k < 0n ? -k : k;
    const rad = (kk === 1n ? '' : kk.toString()) + '√' + M.toString();
    if (k === 0n) return A.toString();
    if (A === 0n) return (k < 0n ? '-' : '') + rad;
    return A.toString() + (k < 0n ? ' - ' : ' + ') + rad;
  }

  /** 实根的精确写法：(A ± K√M)/D */
  function formatRealRadical(p, sign) {
    const k = sign > 0 ? p.K : -p.K;
    const inner = numWithRadical(p.A, k, p.M);
    return p.D === 1n ? inner : '(' + inner + ')/' + p.D;
  }

  /** 实根的近似值 */
  function realRadicalNumber(p, sign) {
    const k = sign > 0 ? p.K : -p.K;
    const re = Number(p.A) / Number(p.D);
    const rad = Number(k) * Math.sqrt(Number(p.M)) / Number(p.D);
    return re + rad;
  }

  /** 复根的精确写法：实部 ± 虚部 i */
  function formatComplex(p, sign) {
    const realFrac = new Frac(p.A, p.D);
    const realStr = realFrac.d === 1n ? realFrac.n.toString() : '(' + realFrac.n + '/' + realFrac.d + ')';
    const kk = p.K;
    let imStr;
    if (p.M === 1n) {
      const coef = kk === 1n ? '' : (kk === -1n ? '-' : kk.toString());
      imStr = p.D === 1n ? coef + 'i' : '(' + kk + '/' + p.D + ')i';
    } else {
      const base = (kk === 1n ? '' : kk.toString()) + '√' + p.M.toString();
      imStr = p.D === 1n ? base + 'i' : '(' + base + '/' + p.D + ')i';
    }
    if (realFrac.isZero()) return (sign > 0 ? '' : '-') + imStr;
    return realStr + (sign > 0 ? ' + ' : ' - ') + imStr;
  }

  function complexNumber(p, sign) {
    const re = Number(p.A) / Number(p.D);
    let im = Number(p.K) * Math.sqrt(Number(p.M)) / Number(p.D);
    if (sign < 0) im = -im;
    return { re: re, im: im };
  }

  NS.quad = {
    sqrtForm: sqrtForm,
    radicalPair: radicalPair,
    formatRealRadical: formatRealRadical,
    realRadicalNumber: realRadicalNumber,
    formatComplex: formatComplex,
    complexNumber: complexNumber,
    numWithRadical: numWithRadical
  };
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);