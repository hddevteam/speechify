#!/usr/bin/env node

'use strict';

const { spawnSync } = require('child_process');

if (typeof globalThis.structuredClone !== 'function') {
  try {
    const v8 = require('v8');
    globalThis.structuredClone = (value) => v8.deserialize(v8.serialize(value));
  } catch {
    globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  }
}

const args = process.argv.slice(2);
const finalArgs = args.length > 0 ? args : ['src', '--ext', 'ts'];
const eslintBin = process.platform === 'win32' ? 'eslint.cmd' : 'eslint';

const result = spawnSync(eslintBin, finalArgs, {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
