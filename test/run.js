/* 命令行测试入口：node test/run.js
 * 依次跑三套用例：方程（含高次）、算式（含复数 / 函数 / 角度制）、绘图。
 */
'use strict';
const S = require('../src/index.js');
const harness = require('./harness.js');

const suites = [
  { name: '方程', cases: require('./cases.js'), run: harness.runCases },
  { name: '算式', cases: require('./expr-cases.js'), run: harness.runExprCases },
  { name: '绘图', cases: require('./plot-cases.js'), run: harness.runPlotCases }
];

console.log('求解器版本：' + S.version);
let total = 0, passed = 0, failed = 0;
const failures = [];

suites.forEach(function (s) {
  const r = s.run(S, s.cases);
  total += r.total; passed += r.passed; failed += r.failed;
  console.log('  ' + s.name + '：' + r.total + ' 例，通过 ' + r.passed + '，失败 ' + r.failed);
  if (r.failures.length) failures.push({ name: s.name, text: harness.formatFailures(r) });
});

console.log('用例总数：' + total + '，通过：' + passed + '，失败：' + failed);
if (failed) {
  console.log('');
  failures.forEach(function (f) { console.log('[' + f.name + ']'); console.log(f.text); });
  process.exitCode = 1;
} else {
  console.log('全部用例通过 ✓');
}
