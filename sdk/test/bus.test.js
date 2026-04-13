// sdk/test/bus.test.js — EventBus unit tests
// Run: node --test sdk/test/bus.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Pocket = require('../pocket.js');

const { EventBus } = Pocket;

test('EventBus: on + emit delivers payload to handler', () => {
  const bus = new EventBus();
  let received = null;
  bus.on('ping', (payload) => {
    received = payload;
  });
  bus.emit('ping', { msg: 'hello' });
  assert.deepStrictEqual(received, { msg: 'hello' });
});

test('EventBus: off removes the handler, subsequent emit does not call it', () => {
  const bus = new EventBus();
  let calls = 0;
  const handler = () => {
    calls += 1;
  };
  bus.on('ping', handler);
  bus.emit('ping');
  assert.strictEqual(calls, 1);
  bus.off('ping', handler);
  bus.emit('ping');
  assert.strictEqual(calls, 1); // unchanged
});

test('EventBus: once fires exactly once even across many emits', () => {
  const bus = new EventBus();
  let calls = 0;
  bus.once('boot', () => {
    calls += 1;
  });
  bus.emit('boot');
  bus.emit('boot');
  bus.emit('boot');
  assert.strictEqual(calls, 1);
});

test('EventBus: multiple handlers for the same event run in registration order', () => {
  const bus = new EventBus();
  const order = [];
  bus.on('e', () => order.push('a'));
  bus.on('e', () => order.push('b'));
  bus.on('e', () => order.push('c'));
  bus.emit('e');
  assert.deepStrictEqual(order, ['a', 'b', 'c']);
});

test('EventBus: handler unsubscribing during emit does not skip siblings', () => {
  // The snapshot-before-iterate protection. If once() calls this.off() in the
  // middle of an emit, the remaining handlers in that same emit cycle must
  // still fire.
  const bus = new EventBus();
  const fired = [];
  bus.once('e', () => fired.push('once-1'));
  bus.on('e', () => fired.push('persistent'));
  bus.once('e', () => fired.push('once-2'));
  bus.emit('e');
  assert.deepStrictEqual(fired, ['once-1', 'persistent', 'once-2']);
});

test('EventBus: emit on an unknown event is a no-op', () => {
  const bus = new EventBus();
  assert.doesNotThrow(() => bus.emit('never-registered'));
});

test('EventBus: off on an unknown event is a no-op', () => {
  const bus = new EventBus();
  assert.doesNotThrow(() => bus.off('never-registered', () => {}));
});
