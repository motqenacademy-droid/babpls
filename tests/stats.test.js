'use strict';
const test = require('node:test'), assert = require('node:assert');
const E = require('../js/stats.js');
test('stats module loads', () => { assert.ok(E.tasks); });
