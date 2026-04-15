// sdk/test/pickmodel.test.js — pickModel + MODEL_PREFERENCES tests
// Run: node --test sdk/test/pickmodel.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Olladroid = require('../olladroid.js');

const { pickModel, MODEL_PREFERENCES } = Olladroid;

test('pickModel: prefers qwen2.5:1.5b over gemma3:1b for structured output', () => {
  // gemma3:1b is deliberately excluded from the structured whitelist, so
  // qwen2.5:1.5b should be picked even when gemma3:1b is listed first.
  const picked = pickModel(['gemma3:1b', 'qwen2.5:1.5b'], 'structured');
  assert.strictEqual(picked, 'qwen2.5:1.5b');
});

test('pickModel: returns null when no installed model is structured-capable', () => {
  // Both excluded from the whitelist — this is the "warn the user at scaffold
  // time" path the scaffolding plan calls out.
  const picked = pickModel(['gemma3:1b', 'smollm2:360m'], 'structured');
  assert.strictEqual(picked, null);
});

test('pickModel: matches quantized tag variants like qwen2.5:1.5b-instruct-q4_K_M', () => {
  const picked = pickModel(['qwen2.5:1.5b-instruct-q4_K_M'], 'structured');
  assert.strictEqual(picked, 'qwen2.5:1.5b-instruct-q4_K_M');
});

test('pickModel: matches qwen2.5 sizes other than 1.5b (3b/7b/14b/32b/72b)', () => {
  assert.strictEqual(pickModel(['qwen2.5:3b'], 'structured'), 'qwen2.5:3b');
  assert.strictEqual(pickModel(['qwen2.5:7b'], 'structured'), 'qwen2.5:7b');
  assert.strictEqual(pickModel(['qwen2.5:72b'], 'structured'), 'qwen2.5:72b');
});

test('pickModel: matches llama3.1/3.2/3.3 size variants', () => {
  assert.strictEqual(pickModel(['llama3.1:8b'], 'structured'), 'llama3.1:8b');
  assert.strictEqual(pickModel(['llama3.2:3b'], 'structured'), 'llama3.2:3b');
  assert.strictEqual(pickModel(['llama3.3:1b'], 'structured'), 'llama3.3:1b');
});

test('pickModel: matches phi3 and phi3.5 family', () => {
  assert.strictEqual(pickModel(['phi3:3.8b'], 'structured'), 'phi3:3.8b');
  assert.strictEqual(pickModel(['phi3.5:3.8b'], 'structured'), 'phi3.5:3.8b');
});

test('pickModel: does NOT match gemma3 (only gemma2:2b is in the list)', () => {
  // gemma3:1b is deliberately excluded; gemma2:2b is in. This test nails down
  // that the version number in the regex is meaningful, not a typo.
  assert.strictEqual(pickModel(['gemma3:1b'], 'structured'), null);
  assert.strictEqual(pickModel(['gemma2:2b'], 'structured'), 'gemma2:2b');
});

test('pickModel: chat capability accepts any model', () => {
  assert.strictEqual(pickModel(['gemma3:1b'], 'chat'), 'gemma3:1b');
  assert.strictEqual(pickModel(['smollm2:360m'], 'chat'), 'smollm2:360m');
  assert.strictEqual(pickModel(['random-custom-model:7b'], 'chat'), 'random-custom-model:7b');
});

test('pickModel: empty list returns null', () => {
  assert.strictEqual(pickModel([], 'structured'), null);
  assert.strictEqual(pickModel([], 'chat'), null);
});

test('pickModel: undefined/null list returns null', () => {
  assert.strictEqual(pickModel(null, 'structured'), null);
  assert.strictEqual(pickModel(undefined, 'chat'), null);
});

test('pickModel: unknown capability falls back to chat', () => {
  // Defensive: if scaffolded code passes a typo'd capability, we shouldn't
  // crash — fall through to the chat list which accepts everything.
  const picked = pickModel(['gemma3:1b'], 'strucured-typo');
  assert.strictEqual(picked, 'gemma3:1b');
});

test('MODEL_PREFERENCES: structured list has the expected patterns', () => {
  // Lock the whitelist shape so future edits are intentional.
  assert.ok(Array.isArray(MODEL_PREFERENCES.structured));
  assert.ok(MODEL_PREFERENCES.structured.length >= 5);
  assert.ok(MODEL_PREFERENCES.structured.every((p) => p instanceof RegExp));
});
