'use strict';
const test = require('node:test'), assert = require('node:assert');
const E = require('../js/amos.js');
test('amos module loads', () => { assert.ok(E.tasks); });
