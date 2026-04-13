// sdk/test/client.test.js — OllamaClient unit tests via a stubbed fetch
// Run: node --test sdk/test/client.test.js
//
// Covers the HTTP client surface without any real network calls. Each test
// constructs a ClientStub fetch that records requests and returns canned
// responses, then asserts the Pocket.OllamaClient behavior against it.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Pocket = require('../pocket.js');

const { OllamaClient, StructuredChatError } = Pocket;

// ----- fetch stub helpers -----

function jsonResponse(body, status) {
  return {
    ok: (status || 200) >= 200 && (status || 200) < 300,
    status: status || 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(body, status) {
  return {
    ok: (status || 200) >= 200 && (status || 200) < 300,
    status: status || 200,
    text: async () => body,
  };
}

// ----- ping() -----

test('ping: returns models array on success', async () => {
  const fetchStub = async () =>
    jsonResponse({
      models: [{ name: 'qwen2.5:1.5b' }, { name: 'gemma3:1b' }],
    });
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  const result = await client.ping();
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.models, ['qwen2.5:1.5b', 'gemma3:1b']);
});

test('ping: returns ok:false with error string on HTTP 500', async () => {
  const fetchStub = async () => jsonResponse({}, 500);
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  const result = await client.ping();
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.models.length, 0);
  assert.match(result.error, /500/);
});

test('ping: returns ok:false with error string on network failure', async () => {
  const fetchStub = async () => {
    throw new Error('ECONNREFUSED');
  };
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  const result = await client.ping();
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /ECONNREFUSED/);
});

test('ping: empty models list returns ok:true with []', async () => {
  const fetchStub = async () => jsonResponse({ models: [] });
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  const result = await client.ping();
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.models, []);
});

// ----- version() -----

test('version: parses /api/version and flags compatibility', async () => {
  const fetchStub = async () => jsonResponse({ version: '0.20.5' });
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  const info = await client.version();
  assert.strictEqual(info.version, '0.20.5');
  assert.strictEqual(info.compatible, true);
  assert.strictEqual(info.minimum, '0.5.0');
});

test('version: flags incompatibility for old versions', async () => {
  const fetchStub = async () => jsonResponse({ version: '0.4.9' });
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  const info = await client.version();
  assert.strictEqual(info.version, '0.4.9');
  assert.strictEqual(info.compatible, false);
});

test('version: is memoised across calls', async () => {
  let calls = 0;
  const fetchStub = async () => {
    calls += 1;
    return jsonResponse({ version: '0.20.5' });
  };
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  await client.version();
  await client.version();
  await client.version();
  assert.strictEqual(calls, 1);
});

// ----- models() -----

test('models: returns array of names on success', async () => {
  const fetchStub = async () =>
    jsonResponse({
      models: [{ name: 'qwen2.5:1.5b' }, { name: 'gemma3:1b' }],
    });
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  const names = await client.models();
  assert.deepStrictEqual(names, ['qwen2.5:1.5b', 'gemma3:1b']);
});

test('models: throws on network failure', async () => {
  const fetchStub = async () => {
    throw new Error('network down');
  };
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub });
  await assert.rejects(() => client.models(), /network down/);
});

// ----- chat() -----

test('chat: posts to /api/chat and returns message content', async () => {
  let captured;
  const fetchStub = async (url, init) => {
    captured = { url, init };
    return jsonResponse({ message: { role: 'assistant', content: 'hello there' } });
  };
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'qwen2.5:1.5b' });
  const result = await client.chat([{ role: 'user', content: 'hi' }]);
  assert.strictEqual(result, 'hello there');
  assert.strictEqual(captured.url, 'http://test/api/chat');
  const body = JSON.parse(captured.init.body);
  assert.strictEqual(body.model, 'qwen2.5:1.5b');
  assert.strictEqual(body.stream, false);
  assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});

test('chat: throws on HTTP 500', async () => {
  const fetchStub = async () => jsonResponse({}, 500);
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'm' });
  await assert.rejects(() => client.chat([]), /HTTP 500/);
});

// ----- streamChat() via the text() fallback path -----
//
// The streamChat method falls back to res.text() when res.body doesn't have
// getReader (our jsonResponse stub). That lets us test the NDJSON parser
// without mocking the Streams API. The browser path uses the real ReadableStream
// and is exercised by the scaffolded chat template at integration time.

test('streamChat: parses NDJSON and concatenates message.content', async () => {
  const ndjson =
    JSON.stringify({ message: { content: 'hello ' }, done: false }) +
    '\n' +
    JSON.stringify({ message: { content: 'world' }, done: false }) +
    '\n' +
    JSON.stringify({ message: { content: '!' }, done: true }) +
    '\n';
  const fetchStub = async () => textResponse(ndjson);
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'm' });
  const chunks = [];
  const full = await client.streamChat([{ role: 'user', content: 'hi' }], {}, (chunk) => {
    chunks.push(chunk);
  });
  assert.strictEqual(full, 'hello world!');
  assert.deepStrictEqual(chunks, ['hello ', 'world', '!']);
});

test('streamChat: onChunk returning false aborts the stream', async () => {
  const ndjson =
    JSON.stringify({ message: { content: 'one' }, done: false }) +
    '\n' +
    JSON.stringify({ message: { content: 'two' }, done: false }) +
    '\n' +
    JSON.stringify({ message: { content: 'three' }, done: false }) +
    '\n';
  const fetchStub = async () => textResponse(ndjson);
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'm' });
  const seen = [];
  const full = await client.streamChat([], {}, (chunk) => {
    seen.push(chunk);
    return chunk === 'two' ? false : undefined;
  });
  // 'one' and 'two' arrive, 'three' is aborted.
  assert.deepStrictEqual(seen, ['one', 'two']);
  assert.strictEqual(full, 'onetwo');
});

test('streamChat: malformed lines mid-stream are skipped, not fatal', async () => {
  const ndjson =
    JSON.stringify({ message: { content: 'good' }, done: false }) +
    '\n' +
    'this is not json\n' +
    JSON.stringify({ message: { content: ' still good' }, done: true }) +
    '\n';
  const fetchStub = async () => textResponse(ndjson);
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'm' });
  const full = await client.streamChat([], {}, () => {});
  assert.strictEqual(full, 'good still good');
});

// ----- structuredChat() -----

test('structuredChat: happy path returns parsed object', async () => {
  let calls = 0;
  const fetchStub = async (url) => {
    calls += 1;
    if (url.endsWith('/api/version')) return jsonResponse({ version: '0.20.5' });
    return jsonResponse({
      message: { content: '{"word":"apple","hint":"a red fruit","difficulty":"easy"}' },
    });
  };
  const schema = {
    type: 'object',
    properties: {
      word: { type: 'string' },
      hint: { type: 'string' },
      difficulty: { type: 'string' },
    },
    required: ['word', 'hint', 'difficulty'],
  };
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'qwen2.5:1.5b' });
  const result = await client.structuredChat([{ role: 'user', content: 'word please' }], schema);
  assert.deepStrictEqual(result, { word: 'apple', hint: 'a red fruit', difficulty: 'easy' });
});

test('structuredChat: first-call parse failure triggers retry with nudge', async () => {
  let chatCalls = 0;
  const capturedMessages = [];
  const fetchStub = async (url, init) => {
    if (url.endsWith('/api/version')) return jsonResponse({ version: '0.20.5' });
    chatCalls += 1;
    const body = JSON.parse(init.body);
    capturedMessages.push(body.messages);
    if (chatCalls === 1) {
      return jsonResponse({ message: { content: 'Sure! Here is the JSON: {"word":' } });
    }
    return jsonResponse({ message: { content: '{"word":"apple"}' } });
  };
  const schema = {
    type: 'object',
    properties: { word: { type: 'string' } },
    required: ['word'],
  };
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'm' });
  const result = await client.structuredChat([{ role: 'user', content: 'word' }], schema);
  assert.deepStrictEqual(result, { word: 'apple' });
  assert.strictEqual(chatCalls, 2);
  // The retry should have prepended a system message nudging the model.
  assert.strictEqual(capturedMessages[1][0].role, 'system');
  assert.match(capturedMessages[1][0].content, /valid JSON/i);
});

test('structuredChat: second-call failure throws StructuredChatError', async () => {
  const fetchStub = async (url) => {
    if (url.endsWith('/api/version')) return jsonResponse({ version: '0.20.5' });
    return jsonResponse({ message: { content: 'still not json' } });
  };
  const schema = { type: 'object', required: ['word'] };
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'm' });
  let thrown;
  try {
    await client.structuredChat([{ role: 'user', content: 'word' }], schema);
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown, 'expected structuredChat to throw');
  assert.strictEqual(thrown.name, 'StructuredChatError');
  assert.ok(thrown.details);
  assert.ok(thrown.details.raw);
});

test('structuredChat: missing required key throws StructuredChatError', async () => {
  const fetchStub = async (url) => {
    if (url.endsWith('/api/version')) return jsonResponse({ version: '0.20.5' });
    // Syntactically valid JSON but missing required "difficulty".
    return jsonResponse({ message: { content: '{"word":"apple","hint":"red"}' } });
  };
  const schema = {
    type: 'object',
    properties: {
      word: { type: 'string' },
      hint: { type: 'string' },
      difficulty: { type: 'string' },
    },
    required: ['word', 'hint', 'difficulty'],
  };
  const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'm' });
  let thrown;
  try {
    await client.structuredChat([{ role: 'user', content: 'word' }], schema);
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown, 'expected structuredChat to throw on missing required key');
  assert.strictEqual(thrown.name, 'StructuredChatError');
});

test('structuredChat: warns once when Ollama is older than minimum', async () => {
  const origWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const fetchStub = async (url) => {
      if (url.endsWith('/api/version')) return jsonResponse({ version: '0.4.9' });
      return jsonResponse({ message: { content: '{"word":"apple"}' } });
    };
    const schema = { type: 'object', required: ['word'] };
    const client = new OllamaClient({ host: 'http://test', fetch: fetchStub, model: 'm' });
    await client.structuredChat([{ role: 'user', content: 'a' }], schema);
    await client.structuredChat([{ role: 'user', content: 'b' }], schema);
    const versionWarnings = warnings.filter((w) => /older than/.test(w));
    assert.strictEqual(versionWarnings.length, 1, 'should warn exactly once');
  } finally {
    console.warn = origWarn;
  }
});
