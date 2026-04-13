// =============================================================================
// cli/test/prompts.test.js — unit tests for cli/prompts.js
//
// We don't exercise readline against stdin (too fragile in CI). Instead we
// stub the rl interface with a scripted answer list and test the validator
// pure functions directly.
// =============================================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const prompts = require('../prompts.js');

// -----------------------------------------------------------------------------
// Validators
// -----------------------------------------------------------------------------

test('validateSlug accepts well-formed slugs', () => {
  assert.equal(prompts.validateSlug('a'), null);
  assert.equal(prompts.validateSlug('spell-bee'), null);
  assert.equal(prompts.validateSlug('1app'), null);
  assert.equal(prompts.validateSlug('spell-bee-alpha-9'), null);
});

test('validateSlug rejects invalid slugs', () => {
  assert.match(prompts.validateSlug(''), /slug must/);
  assert.match(prompts.validateSlug('-leading'), /slug must/);
  assert.match(prompts.validateSlug('Spell-Bee'), /slug must/);
  assert.match(prompts.validateSlug('has space'), /slug must/);
  assert.match(prompts.validateSlug('has!bang'), /slug must/);
});

test('validateAppName accepts letters, digits, spaces, dashes', () => {
  assert.equal(prompts.validateAppName('Spell Bee'), null);
  assert.equal(prompts.validateAppName('SpellBot 9000'), null);
  assert.equal(prompts.validateAppName('A-B'), null);
});

test('validateAppName rejects HTML-unsafe characters', () => {
  assert.match(prompts.validateAppName('<script>'), /app name must/);
  assert.match(prompts.validateAppName('A&B'), /app name must/);
  assert.match(prompts.validateAppName('quote"it'), /app name must/);
});

test('validateHost accepts http and https URLs', () => {
  assert.equal(prompts.validateHost('http://localhost:11434'), null);
  assert.equal(prompts.validateHost('https://ollama.example.com'), null);
});

test('validateHost rejects non-URLs', () => {
  assert.match(prompts.validateHost('localhost'), /host must/);
  assert.match(prompts.validateHost('ftp://x'), /host must/);
  assert.match(prompts.validateHost(''), /host must/);
});

test('validateAgeGroup accepts the three canonical bands', () => {
  assert.equal(prompts.validateAgeGroup('4-6'), null);
  assert.equal(prompts.validateAgeGroup('6-8'), null);
  assert.equal(prompts.validateAgeGroup('8-12'), null);
});

test('validateAgeGroup rejects anything else', () => {
  assert.match(prompts.validateAgeGroup('5-7'), /age group must/);
  assert.match(prompts.validateAgeGroup(''), /age group must/);
});

test('validateTemplate requires category/name shape', () => {
  assert.equal(prompts.validateTemplate('kids-game/spell-bee'), null);
  assert.match(prompts.validateTemplate('spell-bee'), /template must/);
  assert.match(prompts.validateTemplate('kids-game/'), /template must/);
  assert.match(prompts.validateTemplate('/spell-bee'), /template must/);
});

// -----------------------------------------------------------------------------
// askText / askChoice / askYesNo with a scripted rl stub
// -----------------------------------------------------------------------------

function scriptedRL(answers) {
  const queue = answers.slice();
  return {
    async question() {
      if (queue.length === 0) throw new Error('rl stub out of answers');
      return queue.shift();
    },
  };
}

function muteStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = original;
  });
}

test('askText returns the user input when valid', async () => {
  const rl = scriptedRL(['spell-bee']);
  await muteStdout(async () => {
    const value = await prompts.askText(rl, {
      label: 'slug',
      validate: prompts.validateSlug,
    });
    assert.equal(value, 'spell-bee');
  });
});

test('askText uses defaultValue on blank input', async () => {
  const rl = scriptedRL(['']);
  await muteStdout(async () => {
    const value = await prompts.askText(rl, {
      label: 'slug',
      defaultValue: 'default-slug',
      validate: prompts.validateSlug,
    });
    assert.equal(value, 'default-slug');
  });
});

test('askText re-prompts on invalid input', async () => {
  const rl = scriptedRL(['Bad Slug!', 'good-slug']);
  await muteStdout(async () => {
    const value = await prompts.askText(rl, {
      label: 'slug',
      validate: prompts.validateSlug,
    });
    assert.equal(value, 'good-slug');
  });
});

test('askChoice returns the chosen option', async () => {
  const rl = scriptedRL(['2']);
  await muteStdout(async () => {
    const value = await prompts.askChoice(rl, {
      label: 'pick one',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    assert.equal(value, 'b');
  });
});

test('askChoice returns default on empty input', async () => {
  const rl = scriptedRL(['']);
  await muteStdout(async () => {
    const value = await prompts.askChoice(rl, {
      label: 'pick one',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      defaultIndex: 0,
    });
    assert.equal(value, 'a');
  });
});

test('askChoice re-prompts on out-of-range', async () => {
  const rl = scriptedRL(['9', '1']);
  await muteStdout(async () => {
    const value = await prompts.askChoice(rl, {
      label: 'pick one',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    assert.equal(value, 'a');
  });
});

test('askYesNo returns true on y', async () => {
  const rl = scriptedRL(['y']);
  await muteStdout(async () => {
    const value = await prompts.askYesNo(rl, { label: 'ok?', defaultYes: false });
    assert.equal(value, true);
  });
});

test('askYesNo returns false on n', async () => {
  const rl = scriptedRL(['n']);
  await muteStdout(async () => {
    const value = await prompts.askYesNo(rl, { label: 'ok?', defaultYes: true });
    assert.equal(value, false);
  });
});

test('askYesNo returns default on empty', async () => {
  const rl = scriptedRL(['']);
  await muteStdout(async () => {
    const value = await prompts.askYesNo(rl, { label: 'ok?', defaultYes: true });
    assert.equal(value, true);
  });
});
