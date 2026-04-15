// sdk/test/safejson.test.js — safeJSONForHTMLScript + compareSemver tests
// Run: node --test sdk/test/safejson.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Olladroid = require('../olladroid.js');

const { safeJSONForHTMLScript, compareSemver } = Olladroid;

test('safeJSONForHTMLScript: escapes </script> so it cannot break out', () => {
  const encoded = safeJSONForHTMLScript({
    systemPrompt: '</script><script>alert(1)</script>',
  });
  // The literal string "</script>" must NOT appear in the output.
  assert.ok(!encoded.includes('</script>'));
  assert.ok(!encoded.includes('<script>'));
  // Must contain the escaped form.
  assert.ok(encoded.includes('\\u003c'));
});

test('safeJSONForHTMLScript: output is still valid JSON (parses cleanly)', () => {
  const input = {
    appName: 'Spell Bee',
    systemPrompt: 'Hello <world> & "friends"',
    meta: { nested: 'yes' },
  };
  const encoded = safeJSONForHTMLScript(input);
  // JSON.parse accepts \uXXXX escapes, so round-trip should match.
  const decoded = JSON.parse(encoded);
  assert.deepStrictEqual(decoded, input);
});

test('safeJSONForHTMLScript: escapes U+2028 and U+2029 line separators', () => {
  const encoded = safeJSONForHTMLScript({ text: 'a\u2028b\u2029c' });
  assert.ok(!encoded.includes('\u2028'));
  assert.ok(!encoded.includes('\u2029'));
  assert.ok(encoded.includes('\\u2028'));
  assert.ok(encoded.includes('\\u2029'));
});

test('safeJSONForHTMLScript: escapes & to \\u0026', () => {
  const encoded = safeJSONForHTMLScript({ q: 'a & b' });
  assert.ok(!encoded.includes('& '));
  assert.ok(encoded.includes('\\u0026'));
});

test('safeJSONForHTMLScript: preserves curly braces and brackets', () => {
  // Sanity: the escape pass should only touch <, >, &, and line separators —
  // not JSON structural characters.
  const encoded = safeJSONForHTMLScript({ a: [1, 2, 3], b: { c: 'x' } });
  assert.ok(encoded.includes('{'));
  assert.ok(encoded.includes('}'));
  assert.ok(encoded.includes('['));
  assert.ok(encoded.includes(']'));
});

test('compareSemver: equal versions return 0', () => {
  assert.strictEqual(compareSemver('0.5.0', '0.5.0'), 0);
  assert.strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
});

test('compareSemver: a < b returns -1', () => {
  assert.strictEqual(compareSemver('0.4.9', '0.5.0'), -1);
  assert.strictEqual(compareSemver('0.5.0', '0.20.5'), -1);
  assert.strictEqual(compareSemver('1.0.0', '2.0.0'), -1);
});

test('compareSemver: a > b returns 1', () => {
  assert.strictEqual(compareSemver('0.20.5', '0.5.0'), 1);
  assert.strictEqual(compareSemver('2.0.0', '1.9.9'), 1);
});

test('compareSemver: tolerates pre-release suffixes', () => {
  // We strip anything after the first non-digit, so 1.2.3-rc1 compares as 1.2.3.
  assert.strictEqual(compareSemver('1.2.3-rc1', '1.2.3'), 0);
  assert.strictEqual(compareSemver('0.5.0-dev', '0.5.0'), 0);
});

test('compareSemver: handles versions of unequal length', () => {
  // "1.2" compares as "1.2.0".
  assert.strictEqual(compareSemver('1.2', '1.2.0'), 0);
  assert.strictEqual(compareSemver('1.2', '1.2.1'), -1);
});

test('compareSemver: Ollama-shaped versions sort correctly', () => {
  // The specific versions our SDK has to reason about.
  assert.strictEqual(compareSemver('0.20.5', '0.5.0'), 1);
  assert.strictEqual(compareSemver('0.4.9', '0.5.0'), -1);
});
