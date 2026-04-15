// =============================================================================
// cli/apps-manifest.js — read/write the launcher's apps.json manifest
//
// apps.json is the runtime manifest the launcher (pwa/index.html) reads on
// page load to decide which tiles to show. It lives at pwa/apps.json inside
// the repo and ships committed with a default entry for the v0.1.0 chat UI.
// cli/new.js writes/updates an entry on scaffold, cli/update.js refreshes
// it, and the launcher fetches the file at runtime.
//
// Schema (version 1):
//
//   {
//     "version": 1,
//     "updatedAt": "2026-04-15T12:00:00.000Z",
//     "apps": [
//       {
//         "slug": "chat",
//         "name": "Chat",
//         "description": "v0.1.0 local chat UI",
//         "href": "./chat.html",
//         "icon": "./icon.svg",
//         "category": "chat",
//         "builtin": true
//       },
//       {
//         "slug": "spell-bee",
//         "name": "Spell Bee",
//         "description": "Local spelling game for kids 4-12",
//         "href": "./apps/spell-bee/",
//         "icon": "./apps/spell-bee/icon.svg",
//         "category": "kids-game",
//         "builtin": false
//       }
//     ]
//   }
//
// Stability contract:
//   - The file is sorted deterministically: the `chat` builtin is always
//     first, then other builtins alphabetised by slug, then user apps
//     alphabetised by slug. That lets the scaffold-drift CI remain byte-
//     stable across scaffold orderings.
//   - `updatedAt` is the one non-deterministic field. CI runs pin it by
//     passing `updatedAt` explicitly to `writeManifest`.
//   - `readManifest` tolerates a missing file and returns the default set.
//     This is how a fresh clone without `pwa/apps.json` still boots the
//     launcher with just the chat tile.
//
// Zero deps (Node 18+ built-ins only). Unit-tested under cli/test/.
// =============================================================================

'use strict';

const fs = require('fs/promises');
const path = require('path');

const MANIFEST_VERSION = 1;

// The default set: only the v0.1.0 chat UI. Anything else has to be
// registered by `cli/new.js` at scaffold time (or hand-edited).
const DEFAULT_APPS = [
  {
    slug: 'chat',
    name: 'Chat',
    description: 'Local chat against your Ollama server. The v0.1.0 use case.',
    href: './chat.html',
    icon: './icon.svg',
    category: 'chat',
    builtin: true,
  },
];

function defaultManifest(updatedAt) {
  return {
    version: MANIFEST_VERSION,
    updatedAt: updatedAt || new Date().toISOString(),
    apps: DEFAULT_APPS.map(function (a) {
      return Object.assign({}, a);
    }),
  };
}

// Ordering rule: builtins first (chat before anything else), then user apps
// by slug. Callers should treat the returned array as immutable — `sortApps`
// always returns a new array.
function sortApps(apps) {
  const builtins = [];
  const user = [];
  for (const app of apps) {
    if (app && app.builtin) builtins.push(app);
    else if (app) user.push(app);
  }
  // Stable: `chat` is always the first builtin (by id), rest of builtins
  // alpha by slug, then user apps alpha by slug.
  builtins.sort(function (a, b) {
    if (a.slug === 'chat') return -1;
    if (b.slug === 'chat') return 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  user.sort(function (a, b) {
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  return builtins.concat(user);
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return 'entry must be an object';
  }
  if (typeof entry.slug !== 'string' || !entry.slug) {
    return 'entry.slug must be a non-empty string';
  }
  if (typeof entry.name !== 'string' || !entry.name) {
    return 'entry.name must be a non-empty string';
  }
  if (typeof entry.href !== 'string' || !entry.href) {
    return 'entry.href must be a non-empty string';
  }
  return null;
}

function canonicaliseEntry(entry) {
  // Enforce a stable key order so the serialised JSON is drift-stable
  // across scaffolds and across platforms. The order matches the shape
  // of the chat builtin in pwa/apps.json.
  return {
    slug: entry.slug,
    name: entry.name,
    description: entry.description || '',
    href: entry.href,
    icon: entry.icon || null,
    category: entry.category || 'other',
    builtin: entry.builtin === true,
  };
}

function upsertEntry(manifest, entry) {
  // Replace any existing app with the same slug, otherwise append.
  // Returns a new manifest object (does not mutate the input).
  const err = validateEntry(entry);
  if (err) throw new Error('apps-manifest: ' + err);
  const canonical = canonicaliseEntry(entry);
  const apps = (manifest.apps || []).filter(function (a) {
    return a && a.slug !== canonical.slug;
  });
  apps.push(canonical);
  return {
    version: manifest.version || MANIFEST_VERSION,
    updatedAt: manifest.updatedAt,
    apps: sortApps(apps),
  };
}

function removeEntry(manifest, slug) {
  const apps = (manifest.apps || []).filter(function (a) {
    return a && a.slug !== slug;
  });
  return {
    version: manifest.version || MANIFEST_VERSION,
    updatedAt: manifest.updatedAt,
    apps: sortApps(apps),
  };
}

// Build a launcher-ready entry from the scaffold opts. The scaffold opts
// shape comes from cli/new.js optsFromFlags() — slug, appName, category,
// templateName, ... plus the relative href we want the launcher to use.
function entryFromOpts(opts, href) {
  return {
    slug: opts.slug,
    name: opts.appName || opts.slug,
    description: opts.description || inferDescription(opts),
    href: href,
    icon: joinHref(href, 'icon.svg'),
    category: opts.category || 'other',
    builtin: false,
  };
}

function inferDescription(opts) {
  // Best-effort description. The scaffolder does not currently collect a
  // free-form description from the user, so we derive one from the template
  // name. Hand-editing apps.json to improve the copy is explicitly allowed.
  const t = (opts.templateName || '').toLowerCase();
  if (t.endsWith('/spell-bee')) return 'Local spelling game for kids 4-12';
  if (t.endsWith('/summariser')) return 'Paste text, get TL;DR + bullets + key points';
  return opts.appName ? opts.appName + ' — scaffolded by olladroid' : 'Scaffolded by olladroid';
}

function joinHref(base, segment) {
  // Deterministic relative-path join: ensures a single `/` between segments
  // without depending on Node's path module, so the written href string stays
  // stable across platforms and does not introduce backslashes on Windows.
  if (!base) return segment;
  if (!segment) return base;
  const trimmed = base.endsWith('/') ? base : base + '/';
  return trimmed + segment.replace(/^\//, '');
}

// -----------------------------------------------------------------------------
// Filesystem side
// -----------------------------------------------------------------------------

function manifestPath(repoRoot) {
  return path.join(repoRoot, 'pwa', 'apps.json');
}

async function readManifest(repoRoot) {
  const p = manifestPath(repoRoot);
  try {
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('manifest is not an object');
    }
    return {
      version: parsed.version || MANIFEST_VERSION,
      updatedAt: parsed.updatedAt || null,
      apps: Array.isArray(parsed.apps) ? parsed.apps : [],
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return defaultManifest();
    }
    throw err;
  }
}

async function writeManifest(repoRoot, manifest, opts) {
  const explicitTimestamp = opts && opts.updatedAt ? opts.updatedAt : null;
  const out = {
    version: manifest.version || MANIFEST_VERSION,
    // CI pins this via `updatedAt`; at runtime we stamp it fresh so the
    // launcher can surface "last updated X ago" without extra plumbing.
    updatedAt: explicitTimestamp || new Date().toISOString(),
    apps: sortApps(manifest.apps || []),
  };
  const p = manifestPath(repoRoot);
  const dir = path.dirname(p);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(p, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return out;
}

// Called by cli/new.js after a successful scaffold. Returns null if the
// output dir is not under `<repoRoot>/pwa/apps/` (examples/, /tmp, etc —
// those should not pollute the runtime manifest).
async function registerScaffoldedApp(repoRoot, outputDir, opts, writeOpts) {
  const rel = path.relative(path.join(repoRoot, 'pwa', 'apps'), outputDir);
  // Not under pwa/apps/ — skip registration (drift-check scaffolds, test
  // outputs, explicit --output paths all land here).
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  // Apps registered under pwa/apps/<slug>/ — launcher reaches them via
  // the directory URL `./apps/<slug>/`, which python's http.server resolves
  // to the app's index.html automatically. Using the directory form (not an
  // explicit index.html) also makes icon derivation trivial.
  const slugFromPath = rel.split(path.sep)[0];
  if (!slugFromPath) return null;
  const href = './apps/' + slugFromPath + '/';
  const entry = entryFromOpts(opts, href);
  const manifest = await readManifest(repoRoot);
  const next = upsertEntry(manifest, entry);
  return writeManifest(repoRoot, next, writeOpts);
}

module.exports = {
  MANIFEST_VERSION: MANIFEST_VERSION,
  DEFAULT_APPS: DEFAULT_APPS,
  defaultManifest: defaultManifest,
  sortApps: sortApps,
  validateEntry: validateEntry,
  upsertEntry: upsertEntry,
  removeEntry: removeEntry,
  entryFromOpts: entryFromOpts,
  inferDescription: inferDescription,
  joinHref: joinHref,
  manifestPath: manifestPath,
  readManifest: readManifest,
  writeManifest: writeManifest,
  registerScaffoldedApp: registerScaffoldedApp,
};
