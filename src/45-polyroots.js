// SPDX-License-Identifier: MIT
/* 模块 8/10：高次整式方程（三次及以上）
 *
 * 两条腿走路：
 *   1) 有理根定理 —— 把系数化成整数后，凡形如 ±p/q（p 整除常数项、q 整除最高次项
 *      系数）的有理数都试一遍，命中就用综合除法降一次，直到剩下的部分是一次或二次
 *      方程，再套求根公式得到精确解（有理数 / 根式 / 复数）。
 *   2) Durand–Kerner 迭代 —— 剩下的因式次数还 ≥ 3（没有有理根）时，用复平面上的
 *      同时迭代把全部根数值地求出来，给出带 ≈ 的近似解。
 *
 * 系数一律是 NS.Frac（精确有理数），只有第 2 步才转成双精度。
 */
(function (NS) {
  'use strict';
  const Frac = NS.Frac;
  const Error_ = NS.EquationError;
  const P = NS.poly;
  const F = NS.fmt;
  const Q = NS.quad;
  const C = NS.C;
  const U = NS.util;

  const SUB_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  const SUP_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  /** 下标：1 → ₁，12 → ₁₂ */
  function subscript(n) {
    return String(n).split('').map(d => SUB_DIGITS[+d]).join('');
  }
  /** 上标（幂）：3 → ³ */
  function superscript(n) {
    return String(n).split('').map(d => SUP_DIGITS[+d]).join('');
  }

  /** x^k 的文字写法（用于步骤讲解） */
  function powerText(k, v) {
    if (k === 0) return '1';
    if (k === 1) return v;
    if (k === 2) return v + '²';
    if (k === 3) return v + '³';
    return v + '^' + k;
  }

  function degreeOf(p) { return P.pTrim(p).length - 1; }

  /** 精确求值：Horner，系数与自变量都是 Frac */
  function polyEvalFrac(p, x) {
    let z = new Frac(0);
    for (let k = p.length - 1; k >= 0; k--) z = z.mul(x).add(p[k]);
    return z;
  }

  /** 把系数（Frac）清分母变成整数（BigInt 数组） */
  function toIntegerCoeffs(p) {
    let L = 1n;
    p.forEach(function (c) { L = U.lcmBig(L, new Frac(c).d); });
    return p.map(function (c) {
      const f = new Frac(c);
      return f.n * (L / f.d);
    });
  }

  /** 正整数的全部正因子（试除到平方根；上界由调用方保证） */
  function divisors(n) {
    const out = [];
    if (n === 0n) return [1n];
    for (let d = 1n; d * d <= n; d++) {
      if (n % d === 0n) {
        out.push(d);
        if (d * d !== n) out.push(n / d);
      }
    }
    return out.sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
  }

  const DIVISOR_LIMIT = 1000000000n;   // 1e9：再大就放弃枚举（改用数值求根）

  /** ±p/q 形式的有理根候选（已去重，按数值升序） */
  function rationalCandidates(p) {
    const ints = toIntegerCoeffs(P.pTrim(p));
    const a0 = ints[0], an = ints[ints.length - 1];
    if (a0 === 0n) return [new Frac(0)];
    if (U.absBig(a0) > DIVISOR_LIMIT || U.absBig(an) > DIVISOR_LIMIT) return [];
    const ps = divisors(U.absBig(a0)), qs = divisors(U.absBig(an));
    const seen = Object.create(null), out = [];
    ps.forEach(function (pd) {
      qs.forEach(function (qd) {
        [1n, -1n].forEach(function (sg) {
          const f = new Frac(sg * pd, qd);
          const key = f.n + '/' + f.d;
          if (!seen[key]) { seen[key] = true; out.push(f); }
        });
      });
    });
    return out.sort(function (a, b) { return a.cmp(b); });
  }

  /** 综合除法：p ÷ (x - r)，返回商的系数（次数 -1） */
  function deflate(p, r) {
    p = P.pTrim(p);
    const n = p.length - 1;
    if (n <= 0) return [P.ZERO];
    const b = new Array(n);
    let acc = new Frac(0);
    for (let k = n - 1; k >= 0; k--) {
      acc = p[k + 1].add(r.mul(acc));
      b[k] = acc;
    }
    return P.pTrim(b);
  }

  /** 复系数 Horner（数值），系数是 number 数组（升幂） */
  function evalNumeric(p, z) {
    let v = C.make(0, 0);
    for (let k = p.length - 1; k >= 0; k--) v = C.add(C.mul(v, z), C.make(p[k], 0));
    return v;
  }

  /**
   * Durand–Kerner：同时迭代逼近 n 个复根。
   * @param {number[]} coeffs 升幂系数（最高次项不为 0）
   * @returns {Array<{re:number, im:number}>}
   */
  function numericRoots(coeffs) {
    const n = coeffs.length - 1;
    if (n < 1) return [];
    const lead = coeffs[n];
    const monic = coeffs.map(function (c) { return c / lead; });   // 首一
    const zs = [];
    for (let k = 0; k < n; k++) {
      const t = 2 * Math.PI * (k + 0.5) / n;
      zs.push(C.make(0.4 + 0.9 * Math.cos(t), 0.4 + 0.9 * Math.sin(t)));
    }
    for (let iter = 0; iter < 1200; iter++) {
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const v = evalNumeric(monic, zs[i]);
        let d = C.make(1, 0);
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const pair = C.sub(zs[i], zs[j]);
          if (C.modulus(pair) < 1e-280) { d = C.make(0, 0); break; }
          d = C.mul(d, pair);
        }
        if (C.modulus(d) < 1e-280) continue;
        const delta = C.div(v, d);
        zs[i] = C.sub(zs[i], delta);
        moved = Math.max(moved, C.modulus(delta));
      }
      if (moved < 1e-15) break;
    }
    /* 收拾残局：把可以忽略的虚部归零，再用牛顿法抛光一次 */
    return zs.map(function (z) {
      const scale = Math.max(1, Math.abs(z.re));
      let v = { re: z.re, im: Math.abs(z.im) < 1e-9 * scale ? 0 : z.im };
      for (let k = 0; k < 3; k++) {
        const fv = evalNumeric(monic, v);
        if (C.modulus(fv) < 1e-15) break;
        /* 导数系数：k * c[k] */
        const dv = [];
        for (let i = 1; i < monic.length; i++) dv.push(i * monic[i]);
        const d = evalNumeric(dv, v);
        if (C.modulus(d) < 1e-280) break;
        v = C.sub(v, C.div(fv, d));
      }
      const s2 = Math.max(1, Math.abs(v.re));
      if (Math.abs(v.im) < 1e-9 * s2) v = C.make(v.re, 0);
      return v;
    });
  }

  /* ---------------- 根的描述对象 ---------------- */

  function realRootDescriptor(f) {
    f = new Frac(f);
    const num = f.toNumber();
    return {
      exact: F.fmtFrac(f), display: F.fmtFracBoth(f), approx: num,
      re: num, im: 0, complex: false, mult: 1
    };
  }

  function numericRootDescriptor(z) {
    const real = Math.abs(z.im) === 0;
    const text = F.fmtComplex(z, 6);
    return {
      exact: text, display: '≈ ' + text, approx: real ? z.re : null,
      re: z.re, im: z.im, complex: !real, mult: 1, numeric: true
    };
  }

  /** 剩余二次因式 ax²+bx+c 的精确根（顺序：小根在前；复数根 +i 在前） */
  function quadraticRoots(a, b, c, v) {
    const twoA = a.mul(new Frac(2n));
    const delta = b.mul(b).sub(a.mul(c).mul(new Frac(4n)));
    if (delta.isZero()) {
      return { delta: delta, kind: 'double', roots: [realRootDescriptor(b.neg().div(twoA))] };
    }
    if (delta.sign() > 0) {
      const sq = Q.sqrtForm(delta);
      const pair = Q.radicalPair(a, b, sq.s, sq.M, sq.Q);
      if (pair.M === 1n) {
        const rA = new Frac(pair.A - pair.K, pair.D), rB = new Frac(pair.A + pair.K, pair.D);
        const lo = rA.cmp(rB) <= 0 ? rA : rB, hi = rA.cmp(rB) <= 0 ? rB : rA;
        return { delta: delta, kind: 'real', roots: [realRootDescriptor(lo), realRootDescriptor(hi)], sqrt: sq };
      }
      const n1 = Q.realRadicalNumber(pair, -1), n2 = Q.realRadicalNumber(pair, +1);
      const e1 = Q.formatRealRadical(pair, -1), e2 = Q.formatRealRadical(pair, +1);
      return {
        delta: delta, kind: 'real-radical', sqrt: sq,
        roots: [
          { exact: e1, display: e1 + ' ≈ ' + F.numToStr(n1, 6), approx: n1, re: n1, im: 0, complex: false, mult: 1 },
          { exact: e2, display: e2 + ' ≈ ' + F.numToStr(n2, 6), approx: n2, re: n2, im: 0, complex: false, mult: 1 }
        ]
      };
    }
    const sqp = Q.sqrtForm(delta.neg());
    const pair = Q.radicalPair(a, b, sqp.s, sqp.M, sqp.Q);
    const c1 = Q.complexNumber(pair, +1), c2 = Q.complexNumber(pair, -1);
    const e1 = Q.formatComplex(pair, +1), e2 = Q.formatComplex(pair, -1);
    return {
      delta: delta, kind: 'complex', sqrt: null,
      roots: [
        { exact: e1, display: e1, approx: null, re: c1.re, im: c1.im, complex: true, mult: 1 },
        { exact: e2, display: e2, approx: null, re: c2.re, im: c2.im, complex: true, mult: 1 }
      ]
    };
  }

  /**
   * 求解三次及以上整式方程。
   * @param {Array<Frac>} diff 标准形式（左 - 右）的系数，升幂
   * @param {string} v 未知数名
   * @param {object} stepper 40-solve-core 传进来的步骤收集器
   */
  function solve(diff, v, stepper) {
    const poly = P.pTrim(diff.map(function (c) { return new Frac(c); }));
    const deg = degreeOf(poly);
    const coeffList = poly.map(function (c) { return F.fmtFrac(c); });

    stepper.push('识别方程类型', [
      '未知数 ' + v + ' 的最高次数是 ' + deg + ' 次，比二次还高，没有现成的求根公式。',
      '思路：先用「有理根定理」找出能整除的有理根，用综合除法逐次降次；',
      '剩下的一次 / 二次因式用求根公式给出精确解；如果剩下的次数仍然 ≥ 3，就用数值迭代求全部根。'
    ]);

    /* 1) 先把 x = 0 的根（常数项为 0）抽出来 */
    let rest = poly;
    let zeroMult = 0;
    while (rest.length > 1 && rest[0].isZero()) { zeroMult++; rest = P.pTrim(rest.slice(1)); }

    /* 2) 有理根：反复试根 + 降次（一直试到只剩常数，重根会被命中多次） */
    const candidates = degreeOf(rest) > 0 ? rationalCandidates(rest) : [];
    const exactGroups = [];              // { root: Frac, mult }
    let guard = 0;
    if (candidates.length) {
      while (degreeOf(rest) >= 1 && guard++ < 64) {
        let hit = null;
        for (let i = 0; i < candidates.length; i++) {
          if (polyEvalFrac(rest, candidates[i]).isZero()) { hit = candidates[i]; break; }
        }
        if (!hit) break;
        const last = exactGroups[exactGroups.length - 1];
        if (last && last.root.cmp(hit) === 0) last.mult++;
        else exactGroups.push({ root: hit, mult: 1 });
        rest = deflate(rest, hit);
      }
    }
    const restDeg = degreeOf(rest);

    /* 3) 讲解：有理根候选与试根情况 */
    const candTokens = candidates.slice(0, 16).map(function (c) { return F.fmtFrac(c); });
    const tryLines = [];
    if (restDeg >= 2 || exactGroups.length) {
      const candText = candTokens.length
        ? candTokens.join('、') + (candidates.length > candTokens.length ? ' …（共 ' + candidates.length + ' 个）' : '')
        : '（常数项或最高次项系数太大，跳过枚举）';
      tryLines.push('可能的有理根（±p/q，p 整除常数项，q 整除最高次项系数）：' + candText + '。');
    }
    if (exactGroups.length) {
      tryLines.push('试根命中：' + exactGroups.map(function (g) {
        const mult = g.mult > 1 ? '（' + g.mult + ' 重）' : '';
        return v + ' = ' + F.fmtFrac(g.root) + mult;
      }).join('、') + '。');
    } else if (restDeg >= 2) {
      tryLines.push('把上面这些候选逐个代入，都不是根 —— 剩下的因式没有有理根。');
    }
    if (zeroMult > 0) {
      tryLines.push(zeroMult === 1
        ? '另外，常数项为 0，所以 ' + v + ' = 0 也是一个根。'
        : '另外，常数项为 0，可以提出公因式 ' + powerText(zeroMult, v) + '，即 ' + v + ' = 0 是 ' + zeroMult + ' 重根。');
    }
    if (!tryLines.length) tryLines.push('所有因式都已经从 ' + v + ' 的幂里提出来了。');
    stepper.push('寻找有理根', tryLines);

    /* 4) 因式分解的文字形式（重因式写成幂，例如 x³、(x - 1)²） */
    const factorGroups = [];
    const addFactor = function (text, mult) {
      const last = factorGroups[factorGroups.length - 1];
      if (last && last.text === text) last.mult += mult;
      else factorGroups.push({ text: text, mult: mult });
    };
    exactGroups.forEach(function (g) {
      const term = g.root.isZero() ? v : (g.root.sign() < 0
        ? '(' + v + ' + ' + F.fmtFrac(g.root.abs()) + ')'
        : '(' + v + ' - ' + F.fmtFrac(g.root) + ')');
      addFactor(term, g.mult);
    });
    if (zeroMult > 0) addFactor(v, zeroMult);
    const restText = F.polyToText(rest, v);
    if (restDeg >= 1) addFactor('(' + restText + ')', 1);
    const factorsText = factorGroups.map(function (g) {
      return g.mult > 1 ? g.text + superscript(g.mult) : g.text;
    }).join('');
    const removedCount = exactGroups.reduce(function (s, g) { return s + g.mult; }, 0) + zeroMult;
    let factoredText;
    if (!factorGroups.length) factoredText = F.fmtFrac(rest[0]) + ' = 0';
    else if (factorGroups.length === 1 && factorGroups[0].mult === 1) {
      factoredText = factorsText.replace(/^\((.*)\)$/, '$1') + ' = 0';
    } else factoredText = factorsText + ' = 0';
    stepper.push('因式分解', [
      removedCount > 0
        ? '把找到的根对应的因式用综合除法除掉（重根写成幂）：'
        : '没有有理根因式可以提出来，原式保持不变：',
      F.polyToText(poly, v) + ' = 0  →  ' + factoredText
    ]);

    /* 5) 收尾：一次 / 二次 / 数值 */
    const roots = [];
    const notes = [];
    exactGroups.forEach(function (g) {
      const r = realRootDescriptor(g.root);
      r.mult = g.mult;
      roots.push(r);
    });
    if (zeroMult > 0) {
      const r = realRootDescriptor(new Frac(0));
      r.mult = zeroMult;
      roots.push(r);
    }

    if (restDeg === 1) {
      const x1 = rest[0].neg().div(rest[1]);
      const r = realRootDescriptor(x1);
      roots.push(r);
      stepper.push('求解剩下的一次因式', [
        restText + ' = 0 是一次方程，直接移项求根：',
        v + ' = -(' + F.fmtFrac(rest[0]) + ') / ' + F.fmtFrac(rest[1]) + ' = ' + F.fmtFracBoth(x1)
      ]);
    } else if (restDeg === 2) {
      const q = quadraticRoots(rest[2], rest[1], rest[0], v);
      const lines = ['剩下 ' + restText + ' = 0（二次方程），用求根公式继续：',
        'a = ' + F.fmtFrac(rest[2]) + '，b = ' + F.fmtFrac(rest[1]) + '，c = ' + F.fmtFrac(rest[0]),
        'Δ = b² - 4ac = ' + F.fmtFracBoth(q.delta)];
      if (q.kind === 'double') {
        lines.push('Δ = 0，二次因式是完全平方，得到一个二重根：' + v + ' = ' + F.fmtFrac(q.roots[0].exact));
        q.roots[0].mult = 2;
      } else if (q.kind === 'complex') {
        lines.push('Δ < 0，在实数范围内没有解，复数范围内有两个共轭虚根。');
        lines.push('这两个根：' + v + ' = ' + q.roots[0].exact + ' 与 ' + v + ' = ' + q.roots[1].exact);
      } else {
        lines.push('Δ > 0，两个实根：' + v + ' = ' + q.roots[0].display + ' 与 ' + v + ' = ' + q.roots[1].display);
      }
      q.roots.forEach(function (r) { roots.push(r); });
      stepper.push('求解剩下的二次因式', lines);
    } else if (restDeg >= 3) {
      if (restDeg > 10) {
        throw new Error_('化简后的次数是 ' + deg + ' 次，剩下 ' + restDeg + ' 次因式没有有理根，数值求根只支持 10 次以内。');
      }
      const nums = rest.map(function (c) { return c.toNumber(); });
      const found = numericRoots(nums).map(numericRootDescriptor)
        .sort(function (p, q) { return p.re === q.re ? p.im - q.im : p.re - q.re; });
      /* 去掉残差过大的（迭代没收敛） */
      const kept = found.filter(function (r) {
        const value = C.modulus(evalNumeric(nums, C.make(r.re, r.im)));
        return isFinite(value) && value < 1e-4 * Math.max(1, Math.abs(r.re));
      });
      if (!kept.length) throw new Error_('这个 ' + deg + ' 次方程没有有理根，数值求根也没有收敛。');
      kept.forEach(function (r) { roots.push(r); });
      notes.push('剩下的 ' + restDeg + ' 次因式没有有理根，用 Durand–Kerner 迭代求出近似根（带 ≈ 的是数值解）。');
      stepper.push('用数值方法求剩下的根', [
        restText + ' = 0 没有有理根，也没有现成的公式。',
        '用 Durand–Kerner 迭代：把 ' + restDeg + ' 个根当成复平面上的 ' + restDeg + ' 个点同时迭代，直到每个点都落在自己的根上。',
        '得到近似根：' + kept.map(function (r) { return v + ' ≈ ' + r.exact; }).join('，')
      ]);
    }

    /* 6) 合并重复的根（同一个根可能同时被有理根试根和二次求根公式找到），然后排序、编号 */
    const merged = [];
    roots.forEach(function (r) {
      const tol = 1e-9 * Math.max(1, Math.abs(r.re), Math.abs(r.im));
      const hit = merged.filter(function (o) {
        return o.complex === r.complex &&
          Math.abs(o.re - r.re) <= tol && Math.abs(o.im - r.im) <= tol;
      })[0];
      if (hit) hit.mult = (hit.mult || 1) + (r.mult || 1);
      else merged.push(r);
    });
    roots.length = 0;
    merged.forEach(function (r) { roots.push(r); });

    roots.sort(function (p, q) {
      const pr = p.complex ? 1 : 0, qr = q.complex ? 1 : 0;
      if (pr !== qr) return pr - qr;
      if (!p.complex && p.re !== q.re) return p.re - q.re;
      if (p.re !== q.re) return p.re - q.re;
      return q.im - p.im;
    });

    const solutionLines = [];
    roots.forEach(function (r, i) {
      const mult = r.mult > 1 ? '（' + (r.mult === 2 ? '二重根' : r.mult + ' 重根') + '）' : '';
      const label = roots.length > 1
        ? v + subscript(i + 1) + (r.numeric ? ' ≈ ' : ' = ') + r.exact + mult
        : v + (r.numeric ? ' ≈ ' : ' = ') + r.exact + mult;
      r.expr = label;
      solutionLines.push(label);
    });

    const numericUsed = roots.some(function (r) { return r.numeric; });
    const hasReal = roots.some(function (r) { return !r.complex; });
    const typeName = numericUsed ? '一元 ' + deg + ' 次方程（含数值解）' : '一元 ' + deg + ' 次方程';
    const totalMult = roots.reduce(function (s, r) { return s + (r.mult || 1); }, 0);
    let conclusion;
    if (numericUsed) conclusion = '方程在复数范围内共有 ' + roots.length + ' 个根（带 ≈ 的是数值近似解）。';
    else if (totalMult === roots.length) conclusion = '方程在复数范围内共有 ' + roots.length + ' 个根。';
    else conclusion = '按重数计方程共有 ' + totalMult + ' 个根（' + roots.length + ' 个不同的根）。';
    if (!hasReal) conclusion += '这些根全都是复数，实数范围内没有解。';
    conclusion += '解集：' + solutionLines.join('，');

    return {
      typeName: typeName,
      solutionType: 'high-degree',
      roots: roots,
      solutionLines: solutionLines,
      solutionText: solutionLines.join('，'),
      hasRealRoots: hasReal,
      delta: null,
      coefficients: { degree: deg, list: coeffList.join('、') },
      plot: {
        kind: 'expr',
        expr: F.polyToText(poly, v),
        coeffs: poly.map(function (c) { return c.toNumber(); }),
        realRoots: roots.filter(function (r) { return !r.complex && isFinite(r.re); }).map(function (r) { return r.re; }),
        note: notes.join('')
      },
      conclusion: conclusion
    };
  }

  NS.polyroots = {
    solve: solve,
    degreeOf: degreeOf,
    polyEvalFrac: polyEvalFrac,
    toIntegerCoeffs: toIntegerCoeffs,
    divisors: divisors,
    rationalCandidates: rationalCandidates,
    deflate: deflate,
    numericRoots: numericRoots,
    quadraticRoots: quadraticRoots,
    subscript: subscript
  };
})(typeof globalThis !== 'undefined' ? (globalThis.__EqSolver = globalThis.__EqSolver || {}) : this);
