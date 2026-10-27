/* 随机方程属性测试：随机生成一元一次 / 一元二次方程，检查
 *   1) 一定能求解；2) 解的类型与判别式符号一致；
 *   3) 每个根代回后精确为 0（有理根）或数值上约等于 0（无理根 / 复数根）。
 * 用法：node test/property.js [数量]
 */
'use strict';
const S = require('../src/index.js');
const NS = S.ns;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261010);
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

function term(coef, power, v, first) {
  if (coef === 0) return '';
  const sign = coef < 0 ? (first ? '-' : ' - ') : (first ? '' : ' + ');
  const a = Math.abs(coef);
  const body = power === 0 ? String(a) : (power === 1 ? (a === 1 ? v : a + v) : (a === 1 ? v + '^' + power : a + v + '^' + power));
  return sign + body;
}

/** 用给定系数造出一条随机写法的方程字符串（可把部分项移到等号右边） */
function buildEquation(coefs, v) {
  const terms = [];
  coefs.forEach((c, p) => { if (c !== 0) terms.push({ c: c, p: p }); });
  // 随机把一部分项挪到右边（取相反数）
  const moved = terms.map(t => rnd() < 0.35);
  if (moved.every(x => x)) moved[moved.length - 1] = false;
  let lhs = '', rhs = '', firstL = true, firstR = true;
  terms.forEach((t, i) => {
    if (moved[i]) { rhs += term(-t.c, t.p, v, firstR); firstR = false; }
    else { lhs += term(t.c, t.p, v, firstL); firstL = false; }
  });
  if (!lhs) lhs = '0';
  if (!rhs) rhs = '0';
  return lhs + (rnd() < 0.5 ? '=' : ' = ') + rhs;
}

function horner(coeffs, re, im) {
  let zr = 0, zi = 0;
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const c = coeffs[k];
    const nr = zr * re - zi * im + c, ni = zr * im + zi * re;
    zr = nr; zi = ni;
  }
  return Math.hypot(zr, zi);
}

function exactValue(str) {
  try { return NS.Frac.parse(String(str).trim()); } catch (e) { return null; }
}

const N = parseInt(process.argv[2] || '2000', 10);
const fails = [];
const typeCount = {};

for (let i = 0; i < N; i++) {
  const v = rnd() < 0.5 ? 'x' : 'X';
  const deg = rnd() < 0.45 ? 1 : 2;
  let coefs;
  if (deg === 1) {
    let a = 0;
    while (a === 0) a = ri(-9, 9);
    coefs = [ri(-9, 9), a];
  } else {
    let a = 0;
    while (a === 0) a = ri(-9, 9);
    coefs = [ri(-9, 9), ri(-9, 9), a];
  }
  const q = buildEquation(coefs, v);
  const res = S.solve(q);
  const mark = (msg) => fails.push({ q: q, msg: msg, text: res.ok ? res.solutionText : res.error });

  if (!res.ok) { mark('求解失败'); continue; }
  typeCount[res.solutionType] = (typeCount[res.solutionType] || 0) + 1;

  const A = coefs[coefs.length - 1], B = deg === 2 ? coefs[1] : 0, C = coefs[0];
  const delta = B * B - 4 * A * C;

  if (deg === 1) {
    if (res.solutionType !== 'linear') mark('一次方程的类型不对：' + res.solutionType);
  } else if (delta > 0) {
    if (res.solutionType !== 'two-roots') mark('Δ>0 但类型是 ' + res.solutionType + '（Δ=' + delta + '）');
  } else if (delta === 0) {
    if (res.solutionType !== 'double') mark('Δ=0 但类型是 ' + res.solutionType);
  } else if (res.solutionType !== 'complex') {
    mark('Δ<0 但类型是 ' + res.solutionType + '（Δ=' + delta + '）');
  }

  // 每个根都要满足方程
  const exact = res.plot ? res.plot.coeffs : null;
  res.roots.forEach((r, k) => {
    if (!exact) return;
    if (!isFinite(r.re) || !isFinite(r.im)) { mark('第 ' + (k + 1) + ' 个根数值异常'); return; }
    const num = horner(exact, r.re, r.im);
    if (!(num < 1e-6)) { mark('第 ' + (k + 1) + ' 个根数值验证不通过：' + num); return; }
    // 有理根还要做精确验证
    const fx = exactValue(r.exact);
    if (fx && !r.complex) {
      const P = [exact[0], exact[1], exact[2]];
      let z = new NS.Frac(0);
      for (let p = 2; p >= 0; p--) z = z.mul(fx).add(new NS.Frac(P[p] || 0));
      if (!z.isZero()) mark('第 ' + (k + 1) + ' 个有理根精确验证不通过：' + r.exact + ' 使方程等于 ' + z.toString());
    }
  });
}

console.log('随机方程数量：' + N);
console.log('解的类型分布：' + JSON.stringify(typeCount));
if (fails.length) {
  console.log('失败 ' + fails.length + ' 例，前 8 例：');
  fails.slice(0, 8).forEach(f => console.log('  ✗ ' + JSON.stringify(f.q) + ' → ' + f.msg + '（' + f.text + '）'));
  process.exitCode = 1;
} else {
  console.log('全部随机方程通过精确 / 数值验证 ✓');
}