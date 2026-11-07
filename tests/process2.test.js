'use strict';
const test = require('node:test'), assert = require('node:assert');
const E = require('../js/process2.js');
test('process2 module loads', () => { assert.ok(E.tasks); });
