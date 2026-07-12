import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const channel = process.argv[2];
if (channel !== 'latest' && channel !== 'next') {
  console.error('usage: node bump-version.mjs latest|next');
  process.exit(1);
}

function npmView(spec) {
  try {
    return execSync(`npm view ${spec} version`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readPkg() {
  return JSON.parse(readFileSync('package.json', 'utf8'));
}

function writePkg(pkg) {
  writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
}

function parseCore(version) {
  const [core] = version.split('-');
  const [major, minor, patch] = core.split('.').map(Number);
  return { major, minor, patch };
}

function compareCore(left, right) {
  const a = parseCore(left);
  const b = parseCore(right);
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function bumpPatch(version) {
  const { major, minor, patch } = parseCore(version);
  return `${major}.${minor}.${patch + 1}`;
}

function bumpPrerelease(version) {
  const match = version.match(/^(\d+\.\d+\.\d+)-next\.(\d+)$/);
  if (match) {
    const [, core, pre] = match;
    return `${core}-next.${Number(pre) + 1}`;
  }
  const next = bumpPatch(version.split('-')[0]);
  return `${next}-next.0`;
}

const pkg = readPkg();
const remoteLatest = npmView('@riseonly/sdk version') ?? '0.0.0';
const remoteNext = npmView('@riseonly/sdk@next version');
const localCore = pkg.version.split('-')[0];

let nextVersion;
if (channel === 'latest') {
  const base = compareCore(localCore, remoteLatest) > 0 ? localCore : remoteLatest;
  nextVersion = bumpPatch(base);
} else {
  const base = remoteNext ?? (compareCore(localCore, remoteLatest) > 0 ? localCore : remoteLatest);
  nextVersion = bumpPrerelease(base.includes('-next.') ? base : base.split('-')[0]);
}

pkg.version = nextVersion;
writePkg(pkg);
execSync('npm install --package-lock-only', { stdio: 'inherit' });

if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\n`, { flag: 'a' });
}

console.log(`bumped to ${nextVersion}`);
