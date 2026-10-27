/* 命令行测试入口：node test/run.js */
'use strict';
const S = require('../src/index.js');
const cases = require('./cases.js');
const harness = require('./harness.js');

const result = harness.runCases(S, cases);
console.log('求解器版本：' + S.version);
console.log('用例总数：' + result.total + '，通过：' + result.passed + '，失败：' + result.failed);
if (result.failed) {
  console.log('');
  console.log(harness.formatFailures(result));
  process.exitCode = 1;
} else {
  console.log('全部用例通过 ✓');
}