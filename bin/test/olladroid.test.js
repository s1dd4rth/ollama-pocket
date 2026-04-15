// =============================================================================
// bin/test/olladroid.test.js — unit tests for the bin/olladroid dispatcher
//
// Tests spawn `node bin/olladroid <args>` as a child process so stdout/stderr
// capture is clean and matches the real CLI invocation path. Doing this
// in-process via a stdout override conflicts with Node's built-in test runner
// (which writes its own TAP/spec output to the same stdout we'd be overriding).
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const bin = require('../olladroid');
const olladroidSDK = require('../../sdk/olladroid.js');

const execFileP = promisify(execFile);
const BIN_PATH = path.join(__dirname, '..', 'olladroid');

// Run the CLI as a subprocess. Returns { code, stdout, stderr } regardless of
// whether the child exited 0 or non-zero — execFile's error shape carries the
// captured output even on non-zero exits, so we normalise both paths.
async function runBin(args) {
  try {
    const { stdout, stderr } = await execFileP('node', [BIN_PATH, ...args]);
    return { code: 0, stdout: stdout, stderr: stderr };
  } catch (err) {
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

// -----------------------------------------------------------------------------
// Exported surface (in-process)
// -----------------------------------------------------------------------------

test('OLLADROID_VERSION matches sdk/olladroid.js VERSION', () => {
  assert.equal(bin.OLLADROID_VERSION, olladroidSDK.VERSION);
});

test('module exports dispatch, USAGE, and OLLADROID_VERSION', () => {
  assert.equal(typeof bin.dispatch, 'function');
  assert.equal(typeof bin.USAGE, 'string');
  assert.match(bin.USAGE, /olladroid v/);
  assert.equal(typeof bin.OLLADROID_VERSION, 'string');
});

// -----------------------------------------------------------------------------
// --version / -v
// -----------------------------------------------------------------------------

test('--version prints the SDK version and exits 0', async () => {
  const { code, stdout } = await runBin(['--version']);
  assert.equal(code, 0);
  assert.match(stdout, new RegExp('olladroid v' + olladroidSDK.VERSION));
});

test('-v is an alias for --version', async () => {
  const { code, stdout } = await runBin(['-v']);
  assert.equal(code, 0);
  assert.match(stdout, new RegExp('olladroid v' + olladroidSDK.VERSION));
});

// -----------------------------------------------------------------------------
// --help / -h / no-args
// -----------------------------------------------------------------------------

test('--help prints usage and exits 0', async () => {
  const { code, stdout } = await runBin(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /olladroid new \[options\]/);
  assert.match(stdout, /olladroid update <app-dir>/);
});

test('-h is an alias for --help', async () => {
  const { code, stdout } = await runBin(['-h']);
  assert.equal(code, 0);
  assert.match(stdout, /olladroid new/);
});

test('no arguments prints usage and exits 0', async () => {
  const { code, stdout } = await runBin([]);
  assert.equal(code, 0);
  assert.match(stdout, /olladroid new/);
});

// -----------------------------------------------------------------------------
// Dispatch routing
// -----------------------------------------------------------------------------

test('unknown subcommand prints error + usage and exits 2', async () => {
  const { code, stderr } = await runBin(['frobnitz']);
  assert.equal(code, 2);
  assert.match(stderr, /unknown subcommand: frobnitz/);
});

test('"new --help" forwards to cli/new.js usage (exit 0)', async () => {
  const { code, stdout } = await runBin(['new', '--help']);
  assert.equal(code, 0);
  // cli/new.js printUsage() documents the scaffolder flags.
  assert.match(stdout, /--slug/);
  assert.match(stdout, /--template/);
});

test('"update --help" forwards to cli/update.js usage (exit 0)', async () => {
  const { code, stdout } = await runBin(['update', '--help']);
  assert.equal(code, 0);
  assert.match(stdout, /usage: node cli\/update\.js/);
});

test('"new" with an unknown positional returns cli/new.js exit code 2', async () => {
  // cli/new.js parseFlags() throws on unknown positionals; main() converts
  // that to exit code 2. The dispatcher passes exit codes through unchanged.
  const { code } = await runBin(['new', 'banana']);
  assert.equal(code, 2);
});

test('"update" with a nonexistent path returns cli/update.js exit code 1', async () => {
  const { code, stderr } = await runBin(['update', '/nonexistent/path/that/cannot/exist']);
  assert.equal(code, 1);
  assert.match(stderr, /does not exist/);
});
