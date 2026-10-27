// SPDX-License-Identifier: MIT
/* Node 入口：按顺序加载各模块，然后导出 API */
require('./00-frac.js');
require('./10-poly.js');
require('./20-parser.js');
require('./30-quadratic.js');
require('./40-solve-core.js');
module.exports = require('./90-entry.js');
module.exports.modules = [
  '00-frac.js', '10-poly.js', '20-parser.js', '30-quadratic.js', '40-solve-core.js', '90-entry.js'
];