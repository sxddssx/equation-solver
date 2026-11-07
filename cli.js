// SPDX-License-Identifier: MIT
/* 命令行版：方程 / 算式 / 绘图三合一
 * 用法：
 *   node cli.js "2x + 3 = 5x - 9"        → 打印分步解答
 *   node cli.js "sin(30)+1/2"            → 直接算出一个数（自动识别）
 *   node cli.js -s "x^2 - 5x + 6 = 0"    → 只打印解集
 *   node cli.js plot "sin(x)" -360 360   → 在终端里画函数图像
 *   node cli.js --rad "sin(pi/2)"        → 三角函数按弧度制
 *   echo "x²-2=0" | node cli.js          → 从标准输入逐行计算
 */
'use strict';
const S = require('./src/index.js');

const HELP = [
  '用法：node cli.js [选项] "<方程 / 算式>"',
  '      node cli.js [选项] plot "<函数>" [xmin xmax]',
  '',
  '自动识别输入：',
  '  含 =            → 解方程（一元一次 / 二次 / 高次；等号两边都可以有未知数）',
  '  含 x 但没有 =    → 当成 "… = 0" 解方程，例如 x^2-5x+6',
  '  纯数值算式       → 直接算出结果，例如 2^10、sin(30)、nCr(5,2)',
  '  以 plot 开头     → 画函数图像，例如 plot x^2-4',
  '',
  '选项：',
  '  -s, --short     只打印结果（解集 / 数值 / 图像都适用）',
  '  --deg           三角函数按角度制（默认）',
  '  --rad           三角函数按弧度制',
  '  --factpower     改变阶乘与幂的结合顺序：2^3! 从 2^(3!) 变成 (2^3)!',
  '  -h, --help      显示这段帮助',
  '',
  '例：node cli.js "x^3-8=0"',
  '    node cli.js -s "(3+4i)/(1-2i)"',
  '    node cli.js plot "1/x" -8 8'
].join('\n');

/** 把 "plot 表达式 [xmin xmax]" 拆开 */
function parsePlotArgs(args) {
  let rest = args.slice();
  let xMin, xMax;
  if (rest.length >= 3) {
    const last = rest[rest.length - 1], prev = rest[rest.length - 2];
    const numRe = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
    if (numRe.test(last) && numRe.test(prev)) {
      const a = parseFloat(prev), b = parseFloat(last);
      if (isFinite(a) && isFinite(b) && b > a) {
        xMin = a; xMax = b;
        rest = rest.slice(0, rest.length - 2);
      }
    }
  }
  return { expr: rest.join(' '), xMin, xMax };
}

function main() {
  let args = process.argv.slice(2);
  let short = false;
  const flags = [];
  args = args.filter(a => {
    if (a === '-s' || a === '--short') { short = true; return false; }
    if (a === '--rad' || a === '--deg') { flags.push(a); return false; }
    if (a === '--factpower') { flags.push(a); return false; }
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    return true;
  });
  flags.forEach(f => {
    if (f === '--factpower') S.setFactorialMode(true);
    else S.setAngleMode(f === '--rad' ? 'rad' : 'deg');
  });

  /* 绘图子命令：plot <函数> [xmin xmax] */
  let plotJob = null;
  if (args.length && /^plot$/i.test(args[0])) {
    plotJob = parsePlotArgs(args.slice(1));
    if (!plotJob.expr.trim()) {
      console.log('用法：node cli.js plot "<函数>" [xmin xmax]');
      process.exitCode = 1;
      return;
    }
  }

  let list = [];
  if (plotJob) {
    list = [null];                       // 绘图单独处理
  } else if (args.length) {
    list = [args.join(' ')];
  } else {
    let raw = '';
    try { raw = require('fs').readFileSync(0, 'utf8'); } catch (e) { raw = ''; }
    list = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  if (!list.length) {
    console.log('请提供要计算的内容，例如：node cli.js "2x + 3 = 5x - 9"');
    process.exitCode = 1;
    return;
  }

  let bad = 0;
  const emit = function (res, label) {
    if (!res.ok) { console.log('无法计算：' + res.error); bad++; return; }
    if (short && res.mode !== 'plot') {
      console.log(res.mode === 'calc' ? res.valueText : res.solutionText);
      return;
    }
    if (res.mode === 'plot') {
      console.log(S.asciiPlot(res.model, { width: 61, height: 21 }));
      return;
    }
    if (res.mode === 'calc') {
      console.log('= ' + res.valueText + (res.exactText ? '   （= ' + res.exactText + '）' : ''));
      if (res.complex) console.log('（结果为复数，i 为虚数单位）');
      return;
    }
    console.log(S.formatReport(res));
  };

  if (plotJob) {
    emit(S.plot(plotJob.expr, { xMin: plotJob.xMin, xMax: plotJob.xMax }));
  } else {
    list.forEach((q, i) => {
      if (list.length > 1) console.log((i ? '\n' : '') + '> ' + q);
      emit(S.compute(q));
    });
  }
  if (bad) process.exitCode = 1;
}

main();
