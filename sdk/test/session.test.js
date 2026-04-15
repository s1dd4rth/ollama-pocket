// sdk/test/session.test.js — SessionManager unit tests
// Run: node --test sdk/test/session.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Olladroid = require('../olladroid.js');

const { SessionManager } = Olladroid;

// Minimal localStorage shim so these tests can run under Node.
function makeStorage() {
  const data = {};
  return {
    _data: data,
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
    },
    setItem(k, v) {
      data[k] = String(v);
    },
    removeItem(k) {
      delete data[k];
    },
    clear() {
      for (const k of Object.keys(data)) delete data[k];
    },
  };
}

test('SessionManager: add + get round-trip preserves role and content', () => {
  const storage = makeStorage();
  const s = new SessionManager({ key: 't1', storage });
  s.add('user', 'hello');
  s.add('assistant', 'hi there');
  const history = s.get();
  assert.strictEqual(history.length, 2);
  assert.deepStrictEqual(history[0], { role: 'user', content: 'hello' });
  assert.deepStrictEqual(history[1], { role: 'assistant', content: 'hi there' });
});

test('SessionManager: maxTurns trims oldest entries first', () => {
  const storage = makeStorage();
  const s = new SessionManager({ key: 't2', storage, maxTurns: 3 });
  s.add('user', 'one');
  s.add('user', 'two');
  s.add('user', 'three');
  s.add('user', 'four');
  const history = s.get();
  assert.strictEqual(history.length, 3);
  assert.strictEqual(history[0].content, 'two');
  assert.strictEqual(history[2].content, 'four');
});

test('SessionManager: save + load round-trips arbitrary JSON-safe state', () => {
  const storage = makeStorage();
  const s = new SessionManager({ key: 't3', storage });
  const state = { score: 7, currentWord: 'elephant', attempts: [1, 2, 3] };
  s.save(state);
  assert.deepStrictEqual(s.load(), state);
});

test('SessionManager: clear wipes both history and state for this key', () => {
  const storage = makeStorage();
  const s = new SessionManager({ key: 't4', storage });
  s.add('user', 'hi');
  s.save({ score: 5 });
  s.clear();
  assert.deepStrictEqual(s.get(), []);
  assert.strictEqual(s.load(), null);
});

test('SessionManager: different keys do not see each other', () => {
  const storage = makeStorage();
  const a = new SessionManager({ key: 'game-a', storage });
  const b = new SessionManager({ key: 'game-b', storage });
  a.add('user', 'alpha');
  b.add('user', 'beta');
  assert.strictEqual(a.get().length, 1);
  assert.strictEqual(b.get().length, 1);
  assert.strictEqual(a.get()[0].content, 'alpha');
  assert.strictEqual(b.get()[0].content, 'beta');
});

test('SessionManager: no storage → in-memory fallback is still usable', () => {
  // No localStorage stub provided. The plan calls this out explicitly:
  // incognito mode / Node without a stub should still work, just without
  // persistence across process boundaries.
  const s = new SessionManager({ key: 't5' });
  s.add('user', 'still works');
  const history = s.get();
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].content, 'still works');
});

test('SessionManager: storage throwing on setItem falls through to memory', () => {
  // Simulates Safari private mode quota-exceeded errors.
  const throwingStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
    removeItem() {},
  };
  const s = new SessionManager({ key: 't6', storage: throwingStorage });
  assert.doesNotThrow(() => s.add('user', 'quota-wreck'));
  // Falls back to memory, so the value is still retrievable this session.
  assert.strictEqual(s.get().length, 1);
});

test('SessionManager: storage throwing on getItem falls through to memory', () => {
  // Pathological storage that throws on read. SessionManager should degrade
  // gracefully to the in-memory fallback rather than crash the caller.
  let setCount = 0;
  const throwOnRead = {
    getItem() {
      throw new Error('corrupt storage');
    },
    setItem() {
      setCount += 1;
    },
    removeItem() {},
  };
  const s = new SessionManager({ key: 't7', storage: throwOnRead });
  assert.doesNotThrow(() => {
    s.add('user', 'one');
    s.add('user', 'two');
  });
  // History is kept in memory even though reads from storage throw.
  assert.strictEqual(s.get().length, 2);
});

test('SessionManager: load returns null when state was never saved', () => {
  const storage = makeStorage();
  const s = new SessionManager({ key: 't8', storage });
  assert.strictEqual(s.load(), null);
});
