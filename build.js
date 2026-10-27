// SPDX-License-Identifier: MIT
/* 打包脚本：把模板 + 各模块拼成一个可离线运行的单文件 HTML
 * 用法：node build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const FILES = [
  'src/00-frac.js', 'src/10-poly.js', 'src/20-parser.js', 'src/30-quadratic.js',
  'src/40-solve-core.js', 'src/90-entry.js',
  'src/ui/app-plot.js', 'src/ui/app-core.js', 'src/ui/app-boot.js'
];

const banner = '<!--\n  解方程计算器（一元一次 / 一元二次）—— 单文件离线版\n' +
  '  由 build.js 自动生成，请勿直接修改本文件；改源码后重新运行 node build.js\n' +
  '-->';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const tpl = read('src/ui/template.html');
const chunks = FILES.map(f => '/* ===================== ' + f + ' ===================== */\n' + read(f));
const bundleJs = chunks.join('\n');

// 先做语法检查，避免打包出一个坏文件
new vm.Script(bundleJs, { filename: 'bundle.js' });

const inline = '<script>\n' + bundleJs + '\n</scr' + 'ipt>';
const built = tpl.replace(
  /<!-- DEV-SCRIPTS-START -->[\s\S]*?<!-- DEV-SCRIPTS-END -->/,
  '<!-- 全部脚本已内联，双击即可离线运行 -->\n' + inline
);

if (/<script src=/.test(built)) throw new Error('打包失败：仍有外部脚本引用');
if (!/解方程计算器/.test(built)) throw new Error('打包失败：模板内容异常');

const out = path.join(root, 'index.html');
fs.writeFileSync(out, built.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + banner), 'utf8');

const kb = (Buffer.byteLength(built, 'utf8') / 1024).toFixed(1);
console.log('已生成单文件：' + out);
console.log('大小：' + kb + ' KB，内联模块：' + FILES.length + ' 个');