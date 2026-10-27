// SPDX-License-Identifier: MIT
/* 命令行版：直接解方程
 * 用法：
 *   node cli.js "2x + 3 = 5x - 9"      → 打印分步解答
 *   node cli.js -s "x^2 - 5x + 6 = 0"  → 只打印解集
 *   echo "x²-2=0" | node cli.js         → 从标准输入逐行求解
 */
'use strict';
const S = require('./src/index.js');

function main() {
  let args = process.argv.slice(2);
  let short = false;
  args = args.filter(a => {
    if (a === '-s' || a === '--short') { short = true; return false; }
    if (a === '-h' || a === '--help') {
      console.log('用法：node cli.js [-s] "方程"\n  例：node cli.js "2x+3=5x-9"\n  例：node cli.js -s "x^2-5x+6=0"');
      process.exit(0);
    }
    return true;
  });

  let list = [];
  if (args.length) {
    list = [args.join(' ')];
  } else {
    let raw = '';
    try { raw = require('fs').readFileSync(0, 'utf8'); } catch (e) { raw = ''; }
    list = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  if (!list.length) {
    console.log('请提供方程，例如：node cli.js "2x + 3 = 5x - 9"');
    process.exitCode = 1;
    return;
  }

  let bad = 0;
  list.forEach((q, i) => {
    if (list.length > 1) console.log((i ? '\n' : '') + '> ' + q);
    const res = S.solve(q);
    if (!res.ok) { console.log('无法求解：' + res.error); bad++; return; }
    console.log(short ? res.solutionText : S.formatReport(res));
  });
  if (bad) process.exitCode = 1;
}

main();