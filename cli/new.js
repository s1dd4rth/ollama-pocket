#!/usr/bin/env node
// =============================================================================
// cli/new.js — scaffold a new olladroid app
//
// Two modes:
//
//   Interactive:
//     $ node cli/new.js
//     walks the user through slug / category / template / age-group /
//     default model / host / output dir, then calls cli/scaffold.js.
//
//   Non-interactive (used by CI and scripts):
//     $ node cli/new.js --non-interactive \
//         --slug spell-bee \
//         --template kids-game/spell-bee \
//         --age-group 6-8 \
//         --model qwen2.5:1.5b \
//         --host http://localhost:11434 \
//         --output examples/spell-bee \
//         --skip-detection
//
//     Zero prompts, deterministic output (modulo the scaffoldedAt
//     timestamp, which CI fixes via SOURCE_DATE_EPOCH — see
//     scaffold-drift job when it lands).
//
// Flags:
//   --non-interactive     disable all prompts (requires other flags)
//   --slug <slug>         app slug, /^[a-z0-9][a-z0-9-]*$/
//   --app-name <name>     human-facing name (default: title-cased slug)
//   --template <cat/name> e.g. kids-game/spell-bee
//   --age-group <grp>     4-6 | 6-8 | 8-12
//   --model <name>        default model for the runtime
//   --host <url>          Ollama host URL
//   --output <dir>        output directory (default: apps/<slug>)
//   --skip-detection      skip the /api/tags pre-flight
//   --force               overwrite output dir without prompting
//   --help, -h            print usage and exit
// =============================================================================

'use strict';

const path = require('path');

const prompts = require('./prompts.js');
const scaffold = require('./scaffold.js');
const models = require('./models.js');
const update = require('./update.js');

const REPO_ROOT = update.findRepoRoot(__dirname);

const DEFAULT_HOST = 'http://localhost:11434';
const CATEGORIES = [
  { value: 'kids-game', label: 'kids-game' },
  { value: 'productivity', label: 'productivity' },
];
const TEMPLATES_BY_CATEGORY = {
  'kids-game': [{ value: 'kids-game/spell-bee', label: 'spell-bee — local spelling game, ages 4-12' }],
  productivity: [{ value: 'productivity/summariser', label: 'summariser — paste text, get TL;DR + bullets + key points' }],
};
const AGE_GROUPS = [
  { value: '4-6', label: '4-6 (pre-readers, very easy words)' },
  { value: '6-8', label: '6-8 (early readers)' },
  { value: '8-12', label: '8-12 (confident readers)' },
];

// Categories that require an age-group prompt / flag / config entry. Every
// other category scaffolds without an age group and APP_CONFIG omits the
// field entirely (see cli/scaffold.js buildAppConfig). Kept as a set so new
// kid-targeted categories can opt in with a one-line change.
const CATEGORIES_REQUIRING_AGE_GROUP = new Set(['kids-game']);

function categoryRequiresAgeGroup(category) {
  return CATEGORIES_REQUIRING_AGE_GROUP.has(category);
}

function categoryFromTemplate(template) {
  if (typeof template !== 'string') return null;
  const slash = template.indexOf('/');
  return slash > 0 ? template.slice(0, slash) : null;
}

function printUsage() {
  const usage = [
    'usage: node cli/new.js [options]',
    '',
    'interactive mode (no flags): walks through every prompt',
    '',
    'non-interactive flags:',
    '  --non-interactive      disable all prompts',
    '  --slug <slug>          app slug [a-z0-9-]',
    '  --app-name <name>      human-facing name (default: derived from slug)',
    '  --template <cat/name>  e.g. kids-game/spell-bee or productivity/summariser',
    '  --age-group <grp>      4-6 | 6-8 | 8-12  (required for kids-game only)',
    '  --model <name>         default model for the scaffolded runtime',
    '  --host <url>           Ollama host URL (default: ' + DEFAULT_HOST + ')',
    '  --output <dir>         output directory (default: apps/<slug>)',
    '  --skip-detection       skip the /api/tags pre-flight',
    '  --force                overwrite output directory without prompting',
    '  --scaffolded-at <iso>  pin APP_CONFIG.scaffoldedAt (CI drift check)',
    '  --help, -h             print this message',
    '',
  ].join('\n');
  process.stdout.write(usage);
}

function parseFlags(argv) {
  // Tiny flag parser — avoids pulling in a dep. Accepts:
  //   --flag value
  //   --flag=value
  //   --boolean (no value)
  // Stops at the first non-flag token and treats it as an error so we
  // surface typos loudly instead of ignoring extras.
  const booleanFlags = new Set(['non-interactive', 'skip-detection', 'force', 'help']);
  const out = {};
  const args = argv.slice(2);
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (token === '-h') {
      out.help = true;
      i += 1;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error('unexpected argument: ' + token);
    }
    let name;
    let value;
    const eq = token.indexOf('=');
    if (eq >= 0) {
      name = token.slice(2, eq);
      value = token.slice(eq + 1);
    } else {
      name = token.slice(2);
      if (booleanFlags.has(name)) {
        value = true;
        i += 1;
        out[name] = value;
        continue;
      }
      value = args[i + 1];
      if (value == null || value.startsWith('--')) {
        throw new Error('flag --' + name + ' expects a value');
      }
      i += 2;
      out[name] = value;
      continue;
    }
    i += 1;
    out[name] = value;
  }
  return out;
}

function titleCase(slug) {
  return slug
    .split('-')
    .map(function (w) {
      return w ? w[0].toUpperCase() + w.slice(1) : '';
    })
    .join(' ');
}

function defaultOutputDir(slug) {
  return path.join('apps', slug);
}

// -----------------------------------------------------------------------------
// Non-interactive mode: validate flags, call scaffold, report
// -----------------------------------------------------------------------------

function validateFlags(flags) {
  // Base required set — every template needs these.
  const required = ['slug', 'template', 'model'];
  // --age-group is required only for categories that use one (currently
  // just kids-game). Template validation runs before the missing-flag
  // check so we can refuse malformed --template values up front without
  // a useless "missing --age-group" error trailing behind them.
  const templateErr = prompts.validateTemplate(flags.template || '');
  if (flags.template && !templateErr) {
    const category = categoryFromTemplate(flags.template);
    if (categoryRequiresAgeGroup(category)) {
      required.push('age-group');
    }
  }
  const missing = required.filter(function (k) {
    return !flags[k];
  });
  if (missing.length) {
    throw new Error('missing required flag(s) for --non-interactive: --' + missing.join(', --'));
  }
  const v =
    prompts.validateSlug(flags.slug) ||
    prompts.validateTemplate(flags.template) ||
    (flags['age-group'] ? prompts.validateAgeGroup(flags['age-group']) : null) ||
    prompts.validateHost(flags.host || DEFAULT_HOST);
  if (v) throw new Error(v);
  if (flags['app-name']) {
    const nameErr = prompts.validateAppName(flags['app-name']);
    if (nameErr) throw new Error(nameErr);
  }
  if (flags['scaffolded-at']) {
    const atErr = validateScaffoldedAt(flags['scaffolded-at']);
    if (atErr) throw new Error(atErr);
  }
  return null;
}

function validateScaffoldedAt(value) {
  // Accept any ISO 8601 date/datetime that Date() can parse. We check via
  // Date.parse because that's the same parser buildAppConfig's `new Date()
  // .toISOString()` runs on the default path — same input space.
  if (typeof value !== 'string' || !value) {
    return '--scaffolded-at must be a non-empty ISO 8601 timestamp';
  }
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) {
    return '--scaffolded-at could not be parsed as an ISO 8601 timestamp: ' + value;
  }
  return null;
}

function optsFromFlags(flags) {
  const slug = flags.slug;
  const appName = flags['app-name'] || titleCase(slug);
  const [category] = flags.template.split('/');
  const opts = {
    appName: appName,
    slug: slug,
    category: category,
    templateName: flags.template,
    model: flags.model,
    host: flags.host || DEFAULT_HOST,
  };
  // Age group is only carried through for categories that need it (e.g.
  // kids-game). For productivity/creative templates the field is dropped
  // entirely so APP_CONFIG doesn't end up with a dangling null.
  if (flags['age-group'] && categoryRequiresAgeGroup(category)) {
    opts.ageGroup = flags['age-group'];
  }
  // Pin the timestamp if caller provided one. Used by the scaffold-drift
  // CI job so regenerated output is byte-identical to the committed
  // examples/spell-bee/ copy. Normalised through `new Date(...)
  // .toISOString()` so "2026-01-01" and "2026-01-01T00:00:00Z" produce
  // the same canonical form on disk.
  if (flags['scaffolded-at']) {
    opts.scaffoldedAt = new Date(flags['scaffolded-at']).toISOString();
  }
  return opts;
}

async function runNonInteractive(flags) {
  validateFlags(flags);
  const opts = optsFromFlags(flags);
  const outputDir = path.resolve(flags.output || defaultOutputDir(opts.slug));

  process.stdout.write('scaffolding ' + opts.slug + ' → ' + outputDir + '\n');

  const result = await scaffold.scaffold({
    repoRoot: REPO_ROOT,
    outputDir: outputDir,
    opts: opts,
    force: flags.force === true,
    onProgress: function (msg) {
      process.stdout.write('  ' + msg + '\n');
    },
  });

  process.stdout.write('done. wrote ' + result.files.length + ' files, index.html ' + result.sizeBytes + ' bytes\n');
  return 0;
}

// -----------------------------------------------------------------------------
// Interactive mode
// -----------------------------------------------------------------------------

async function runInteractive(flags) {
  const rl = prompts.createInterface();
  try {
    process.stdout.write('\nolladroid — new app scaffolder\n');
    process.stdout.write('-----------------------------------\n\n');

    const slug = await prompts.askText(rl, {
      label: 'App slug',
      defaultValue: flags.slug,
      validate: prompts.validateSlug,
      hint: 'lowercase letters, digits, dashes',
    });

    const appName = await prompts.askText(rl, {
      label: 'App name',
      defaultValue: flags['app-name'] || titleCase(slug),
      validate: prompts.validateAppName,
      hint: 'letters, digits, spaces, dashes',
    });

    const category = await prompts.askChoice(rl, {
      label: 'Category',
      options: CATEGORIES,
      defaultIndex: 0,
    });

    const templateOptions = TEMPLATES_BY_CATEGORY[category] || [];
    if (templateOptions.length === 0) {
      throw new Error('no templates available for category ' + category + ' in this release');
    }
    const templateName = await prompts.askChoice(rl, {
      label: 'Template',
      options: templateOptions,
      defaultIndex: 0,
    });

    // Age group is kids-game-only. Productivity/creative templates skip
    // this prompt entirely and APP_CONFIG omits the field.
    let ageGroup = null;
    if (categoryRequiresAgeGroup(category)) {
      ageGroup = await prompts.askChoice(rl, {
        label: 'Age group',
        options: AGE_GROUPS,
        defaultIndex: 1,
      });
    }

    const host = await prompts.askText(rl, {
      label: 'Ollama host',
      defaultValue: flags.host || DEFAULT_HOST,
      validate: prompts.validateHost,
    });

    // Model detection — skip if the user asked, otherwise try to pick a
    // good default. We still let them override.
    let detectedDefault = flags.model || null;
    let detectionNote = '';
    if (!flags['skip-detection']) {
      process.stdout.write('\ndetecting installed models at ' + host + '...\n');
      const detection = await models.detectInstalledModels(host);
      if (detection.ok) {
        const picked = models.pickModel(detection.models, 'structured');
        if (picked) {
          detectedDefault = detectedDefault || picked;
          detectionNote = '  ✓ picked ' + picked + ' from ' + detection.models.length + ' installed';
        } else if (detection.models.length) {
          detectionNote =
            '  ! installed models (' +
            detection.models.join(', ') +
            ') are not in the structured-output preference list.\n' +
            '    Scaffolded apps that use structured JSON may fail. Install qwen2.5:1.5b for best results:\n' +
            '      ollama pull qwen2.5:1.5b';
        } else {
          detectionNote = '  ! no models installed — run `ollama pull qwen2.5:1.5b`';
        }
      } else {
        detectionNote = '  (ollama not reachable at ' + host + ': ' + detection.error + ' — falling back to user default)';
      }
      if (detectionNote) process.stdout.write(detectionNote + '\n');
    }

    const model = await prompts.askText(rl, {
      label: 'Default model',
      defaultValue: detectedDefault || 'qwen2.5:1.5b',
    });

    const outputDir = await prompts.askText(rl, {
      label: 'Output directory',
      defaultValue: flags.output || defaultOutputDir(slug),
    });

    const opts = {
      appName: appName,
      slug: slug,
      category: category,
      templateName: templateName,
      model: model,
      host: host,
    };
    if (ageGroup) {
      opts.ageGroup = ageGroup;
    }

    const resolved = path.resolve(outputDir);
    let force = flags.force === true;
    if (!force && (await scaffold.pathExists(resolved))) {
      const ok = await prompts.askYesNo(rl, {
        label: resolved + ' exists. Overwrite?',
        defaultYes: false,
      });
      if (!ok) {
        process.stdout.write('aborted.\n');
        return 1;
      }
      force = true;
    }

    process.stdout.write('\nscaffolding...\n');
    const result = await scaffold.scaffold({
      repoRoot: REPO_ROOT,
      outputDir: resolved,
      opts: opts,
      force: force,
      onProgress: function (msg) {
        process.stdout.write('  ' + msg + '\n');
      },
    });

    process.stdout.write('\ndone.\n');
    process.stdout.write('  wrote ' + result.files.length + ' files, index.html ' + result.sizeBytes + ' bytes\n');
    process.stdout.write('  serve locally:\n');
    process.stdout.write('    python3 -m http.server 8000 --directory ' + resolved + '\n');
    process.stdout.write('  open: http://localhost:8000/\n');
    return 0;
  } finally {
    rl.close();
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(argv) {
  let flags;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    process.stderr.write('new: ' + err.message + '\n\n');
    printUsage();
    return 2;
  }
  if (flags.help) {
    printUsage();
    return 0;
  }
  if (flags['non-interactive']) {
    return runNonInteractive(flags);
  }
  return runInteractive(flags);
}

if (require.main === module) {
  main(process.argv).then(
    function (code) {
      process.exit(code || 0);
    },
    function (err) {
      process.stderr.write('new: ' + ((err && err.message) || String(err)) + '\n');
      if (err && err.code === 'EEXIST') {
        process.stderr.write('  (rerun with --force to overwrite)\n');
      }
      process.exit(1);
    }
  );
}

module.exports = {
  main: main,
  parseFlags: parseFlags,
  validateFlags: validateFlags,
  validateScaffoldedAt: validateScaffoldedAt,
  optsFromFlags: optsFromFlags,
  titleCase: titleCase,
  defaultOutputDir: defaultOutputDir,
  categoryFromTemplate: categoryFromTemplate,
  categoryRequiresAgeGroup: categoryRequiresAgeGroup,
};
