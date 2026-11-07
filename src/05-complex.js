// SPDX-License-Identifier: MIT
/* 模块 2/10：复数（双精度）
 * 表达式计算、函数绘图、高次方程数值求根都用这一份实现。
 * 复数用普通对象 { re, im } 表示（实部、虚部都是 number），
 * 这里只做算术，不做显示；显示见 10-poly.js 的 fmt.fmtComplex。
 */
(function (NS) {
  'use strict';
  const Error_ = NS.EquationError;

  function make(re, im) {
    /* 把 -0 归一成 0：否则 atan2(-0, -1) 会得到 -π，辐角符号就错了 */
    let r = Number(re); if (r === 0) r = 0;
    let i = im === undefined ? 0 : Number(im); if (i === 0) i = 0;
    return { re: r, im: i };
  }

  function isFiniteC(z) {
    return !!z && isFinite(z.re) && isFinite(z.im);
  }

  function modulus(z) { return Math.hypot(z.re, z.im); }

  /** 虚部是否可以忽略（默认相对误差 1e-12） */
  function isReal(z, tol) {
    const t = tol === undefined ? 1e-12 : tol;
    return Math.abs(z.im) <= t * Math.max(1, Math.abs(z.re));
  }

  function isZeroC(z, tol) { return modulus(z) <= (tol === undefined ? 1e-12 : tol); }

  function add(a, b) { return make(a.re + b.re, a.im + b.im); }
  function sub(a, b) { return make(a.re - b.re, a.im - b.im); }
  function neg(a) { return make(-a.re, -a.im); }
  function conj(a) { return make(a.re, -a.im); }
  function mul(a, b) {
    return make(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  }
  function div(a, b) {
    const d = b.re * b.re + b.im * b.im;
    if (d === 0) throw new Error_('除数不能为 0');
    return make((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  }

  /** 整数次幂（平方幂算法，负底数也精确，不会绕到复平面） */
  function ipow(base, k) {
    let n = Math.abs(k), acc = make(1, 0), cur = base;
    while (n > 0) {
      if (n % 2 === 1) acc = mul(acc, cur);
      cur = mul(cur, cur);
      n = Math.floor(n / 2);
    }
    return k < 0 ? div(make(1, 0), acc) : acc;
  }

  function expm(z) {
    const e = Math.exp(z.re);
    return make(e * Math.cos(z.im), e * Math.sin(z.im));
  }

  function log(z) {
    const m = modulus(z);
    if (m === 0) throw new Error_('对 0 取对数没有定义');
    return make(Math.log(m), Math.atan2(z.im, z.re));
  }

  function sqrt(z) {
    if (z.im === 0 && z.re >= 0) return make(Math.sqrt(z.re), 0);
    const m = modulus(z);
    const re = Math.sqrt(Math.max(0, (m + z.re) / 2));
    const im = Math.sqrt(Math.max(0, (m - z.re) / 2)) * (z.im < 0 ? -1 : 1);
    return make(re, im);
  }

  function pow(z, w) {
    if (w.im === 0 && Math.abs(w.re - Math.round(w.re)) < 1e-12 && Math.abs(w.re) < 1e15) {
      return ipow(z, Math.round(w.re));
    }
    if (z.re === 0 && z.im === 0) {
      if (w.re > 0) return make(0, 0);
      throw new Error_('0 的负数次幂没有定义');
    }
    return expm(mul(w, log(z)));
  }

  function sin(z) {
    return make(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
  }
  function cos(z) {
    return make(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));
  }
  function tan(z) {
    const c = cos(z);
    /* 1e-15 是「该点没有定义」的实用判据：它能挡住 tan(90°) 这种浮点残渣 */
    if (modulus(c) < 1e-15) throw new Error_('tan 在该点没有定义（cos = 0）');
    return div(sin(z), c);
  }
  function sinh(z) {
    return make(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im));
  }
  function cosh(z) {
    return make(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im));
  }
  function tanh(z) {
    const c = cosh(z);
    if (modulus(c) < 1e-300) throw new Error_('tanh 在该点没有定义');
    return div(sinh(z), c);
  }

  /* 反三角函数、反双曲函数：i 视为虚数单位，取主值 */
  function asin(z) {
    // -i·log(iz + √(1-z²))
    const t = mul(make(0, 1), z);
    const inner = sqrt(sub(make(1, 0), mul(z, z)));
    return mul(make(0, -1), log(add(t, inner)));
  }
  function acos(z) {
    // π/2 - asin(z)
    return sub(make(Math.PI / 2, 0), asin(z));
  }
  function atan(z) {
    // (1/2i)·log((1+iz)/(1-iz))
    const iz = mul(make(0, 1), z);
    const one = make(1, 0);
    return mul(make(0, -0.5), log(div(add(one, iz), sub(one, iz))));
  }
  function asinh(z) {
    return log(add(z, sqrt(add(mul(z, z), make(1, 0)))));
  }
  function acosh(z) {
    return log(add(z, sqrt(sub(mul(z, z), make(1, 0)))));
  }
  function atanh(z) {
    const one = make(1, 0);
    return mul(make(0.5, 0), log(div(add(one, z), sub(one, z))));
  }

  /** 三次方根：实数负数得到实数（与 cbrt 的直觉一致），其余取主值 */
  function cbrt(z) {
    if (z.im === 0) return make(Math.cbrt(z.re), 0);
    return pow(z, make(1 / 3, 0));
  }

  NS.C = {
    make: make, isFiniteC: isFiniteC, modulus: modulus, isReal: isReal, isZero: isZeroC,
    add: add, sub: sub, neg: neg, conj: conj, mul: mul, div: div, ipow: ipow, pow: pow,
    expm: expm, log: log, sqrt: sqrt, cbrt: cbrt,
    sin: sin, cos: cos, tan: tan, sinh: sinh, cosh: cosh, tanh: tanh,
    asin: asin, acos: acos, atan: atan, asinh: asinh, acosh: acosh, atanh: atanh
  };
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);
