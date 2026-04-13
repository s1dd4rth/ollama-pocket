// =============================================================================
// cli/prompts.js — readline/promises prompt helpers
//
// Zero-dep interactive prompts for cli/new.js. Each helper re-prompts on
// invalid input rather than exiting, so a typo doesn't force the user to
// start over. Numbered menus for selection (no arrow-key / tty raw mode —
// that's a deliberate v2 escape hatch, documented in CONTRIBUTING).
//
// All prompts accept an optional `{ rl }` parameter carrying a readline
// interface. Callers are responsible for creating and closing the rl so
// they can share one session across many prompts.
// =============================================================================

'use strict';

const readline = require('readline/promises');

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const APP_NAME_RE = /^[a-zA-Z0-9 \-]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/;

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function askRaw(rl, question) {
  // Node 18's readline/promises returns a promise from rl.question. Keep
  // this thin so tests can stub the rl object with any thenable-returning
  // stand-in.
  const answer = await rl.question(question);
  return (answer || '').trim();
}

async function askText(rl, { label, defaultValue, validate, hint }) {
  const suffix = defaultValue ? ' [' + defaultValue + ']' : '';
  while (true) {
    const raw = await askRaw(rl, label + suffix + ': ');
    const value = raw === '' && defaultValue != null ? defaultValue : raw;
    if (!value) {
      process.stdout.write('  (required)\n');
      continue;
    }
    if (validate) {
      const err = validate(value);
      if (err) {
        process.stdout.write('  ' + err + (hint ? ' — ' + hint : '') + '\n');
        continue;
      }
    }
    return value;
  }
}

async function askChoice(rl, { label, options, defaultIndex }) {
  // options: [{ value, label }, ...]
  process.stdout.write(label + '\n');
  for (let i = 0; i < options.length; i++) {
    process.stdout.write('  (' + (i + 1) + ') ' + options[i].label + '\n');
  }
  const suffix = defaultIndex != null ? ' [' + (defaultIndex + 1) + ']' : '';
  while (true) {
    const raw = await askRaw(rl, '  pick' + suffix + ': ');
    if (raw === '' && defaultIndex != null) return options[defaultIndex].value;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > options.length) {
      process.stdout.write('  enter a number 1-' + options.length + '\n');
      continue;
    }
    return options[n - 1].value;
  }
}

async function askYesNo(rl, { label, defaultYes }) {
  const suffix = defaultYes ? ' [Y/n]' : ' [y/N]';
  while (true) {
    const raw = (await askRaw(rl, label + suffix + ': ')).toLowerCase();
    if (raw === '') return !!defaultYes;
    if (raw === 'y' || raw === 'yes') return true;
    if (raw === 'n' || raw === 'no') return false;
    process.stdout.write('  enter y or n\n');
  }
}

// -----------------------------------------------------------------------------
// Validators (pure, reusable by new.js flag-mode validation too)
// -----------------------------------------------------------------------------

function validateSlug(value) {
  if (!SLUG_RE.test(value)) {
    return 'slug must be lowercase letters, digits, and dashes, starting with a letter or digit';
  }
  return null;
}

function validateAppName(value) {
  if (!APP_NAME_RE.test(value)) {
    return 'app name must be letters, digits, spaces, or dashes';
  }
  return null;
}

function validateHost(value) {
  if (!URL_RE.test(value)) {
    return 'host must be a http(s) URL';
  }
  return null;
}

function validateAgeGroup(value) {
  if (value !== '4-6' && value !== '6-8' && value !== '8-12') {
    return 'age group must be 4-6, 6-8, or 8-12';
  }
  return null;
}

function validateTemplate(value) {
  // category/name, both slug-shaped
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(value)) {
    return 'template must be <category>/<name>, e.g. kids-game/spell-bee';
  }
  return null;
}

module.exports = {
  createInterface: createInterface,
  askText: askText,
  askChoice: askChoice,
  askYesNo: askYesNo,
  validateSlug: validateSlug,
  validateAppName: validateAppName,
  validateHost: validateHost,
  validateAgeGroup: validateAgeGroup,
  validateTemplate: validateTemplate,
};
