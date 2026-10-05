import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import semanticRelease from "semantic-release";
import config from "../release.config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const changelogTitle = config.plugins.find(
  (plugin) => plugin[0] === "@semantic-release/changelog",
)[1].changelogTitle;
const historicalNotes = `${changelogTitle}\n\n## [0.4.0] - 2026-09-24\n\nHistorical notes.\n`;
const plugins = config.plugins.filter(
  (plugin) => plugin[0] !== "@semantic-release/github",
);

async function fixture(t, message) {
  const directory = await mkdtemp(path.join(tmpdir(), "srcery-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cwd = path.join(directory, "work");
  const remote = path.join(directory, "remote.git");
  execFileSync("git", ["init", "--bare", "--quiet", remote]);
  execFileSync("git", ["init", "--quiet", "--initial-branch=master", cwd]);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 20_000,
    }).trim();
  git("config", "user.name", "Release test");
  git("config", "user.email", "release-test@example.invalid");
  for (const file of [
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
  ]) {
    await writeFile(
      path.join(cwd, file),
      await readFile(path.join(root, file)),
    );
  }
  const manifest = JSON.parse(await readFile(path.join(cwd, "package.json")));
  manifest.version = "0.4.0";
  await writeFile(
    path.join(cwd, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(path.join(cwd, ".gitignore"), "node_modules\n");
  await writeFile(path.join(cwd, "CHANGELOG.md"), historicalNotes);
  await symlink(
    path.join(root, "node_modules"),
    path.join(cwd, "node_modules"),
  );
  git("add", ".");
  git("commit", "--quiet", "-m", "chore: initial release");
  git("tag", "v0.4.0");
  git("remote", "add", "origin", remote);
  git("commit", "--quiet", "--allow-empty", "-m", message);
  git("push", "--quiet", "--tags", "origin", "master");
  const head = git("rev-parse", "HEAD");
  const lockfile = await readFile(path.join(cwd, "pnpm-lock.yaml"), "utf8");
  // Keep fixture releases independent of the enclosing GitHub Actions run.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("GITHUB_") && name !== "GH_TOKEN",
    ),
  );
  const run = (options = {}) =>
    semanticRelease(
      {
        ...config,
        plugins,
        repositoryUrl: pathToFileURL(remote).href,
        ci: false,
        ...options,
      },
      {
        cwd,
        env,
        stdout: new Writable({ write: (_chunk, _encoding, done) => done() }),
        stderr: new Writable({ write: (_chunk, _encoding, done) => done() }),
      },
    );
  return { cwd, git, head, lockfile, run, env, remote };
}

for (const [message, version, note] of [
  ["fix(theme): improve comment contrast", "0.4.1", "improve comment contrast"],
  [
    "perf(theme): simplify syntax matching",
    "0.4.1",
    "simplify syntax matching",
  ],
  ["feat(theme): add syntax scopes", "0.5.0", "add syntax scopes"],
  [
    "feat(theme): replace scopes\n\nBREAKING CHANGE: old scopes are removed",
    "1.0.0",
    "old scopes are removed",
  ],
]) {
  test(`Angular release: ${message.split("\n")[0]}`, async (t) => {
    const repo = await fixture(t, message);
    const release = await repo.run();
    assert.equal(release.nextRelease.version, version);
    assert.ok(release.nextRelease.notes.includes(note));
    const manifest = JSON.parse(repo.git("show", `v${version}:package.json`));
    assert.equal(manifest.version, version);
    const changelog = repo.git("show", `v${version}:CHANGELOG.md`);
    assert.ok(changelog.includes(note));
    assert.ok(changelog.startsWith(changelogTitle));
    assert.ok(
      changelog.includes("## [0.4.0] - 2026-09-24\n\nHistorical notes."),
    );
    assert.equal(changelog.split("# Changelog").length, 2);
    assert.equal(
      repo.git("log", "-1", "--format=%s"),
      `chore(release): ${version} [skip ci]`,
    );
    assert.equal(
      repo.git("rev-parse", `v${version}`),
      repo.git("rev-parse", "HEAD"),
    );
    assert.equal(
      repo.git("ls-remote", "origin", `refs/tags/v${version}`).split("\t")[0],
      repo.git("rev-parse", "HEAD"),
    );
    assert.equal(
      await readFile(path.join(repo.cwd, "pnpm-lock.yaml"), "utf8"),
      repo.lockfile,
    );
    assert.equal(repo.git("status", "--porcelain"), "");
    assert.equal(
      await repo.run(),
      false,
      "retry must not create another release",
    );
  });
}

test("maintenance-only changes do not release", async (t) => {
  const repo = await fixture(t, "chore(deps): update tooling");
  for (const type of ["ci", "docs", "build", "refactor", "style", "test"]) {
    repo.git(
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      `${type}: maintenance`,
    );
  }
  repo.git("push", "--quiet", "origin", "master");
  const head = repo.git("rev-parse", "HEAD");
  assert.equal(await repo.run(), false);
  assert.equal(repo.git("rev-parse", "HEAD"), head);
  assert.equal(repo.git("tag"), "v0.4.0");
  assert.equal(
    await readFile(path.join(repo.cwd, "CHANGELOG.md"), "utf8"),
    historicalNotes,
  );
});

test("dry run leaves files, commits, and tags unchanged", async (t) => {
  const repo = await fixture(t, "feat(theme): add syntax scopes");
  const release = await repo.run({ dryRun: true });
  assert.equal(release.nextRelease.version, "0.5.0");
  assert.equal(repo.git("rev-parse", "HEAD"), repo.head);
  assert.equal(repo.git("tag"), "v0.4.0");
  assert.equal(repo.git("status", "--porcelain"), "");
});

test("failed preparation does not push a commit or tag", async (t) => {
  const repo = await fixture(t, "fix(theme): improve contrast");
  await assert.rejects(
    repo.run({
      plugins: plugins.map((plugin) =>
        plugin[0] === "@semantic-release/exec"
          ? ["@semantic-release/exec", { prepareCmd: "exit 1" }]
          : plugin,
      ),
    }),
  );
  assert.equal(repo.git("rev-parse", "HEAD"), repo.head);
  assert.equal(repo.git("tag"), "v0.4.0");
  assert.equal(repo.git("status", "--porcelain"), "");
});

test("runner keeps dry runs local and restricts publishing to master pushes", async (t) => {
  const repo = await fixture(t, "feat(theme): add syntax scopes");
  await writeFile(
    path.join(repo.cwd, "release.config.mjs"),
    `export default ${JSON.stringify({ ...config, plugins, repositoryUrl: pathToFileURL(repo.remote).href })};\n`,
  );
  const runner = (...args) =>
    spawnSync(
      process.execPath,
      [path.join(root, "scripts/release.mjs"), ...args],
      {
        cwd: repo.cwd,
        env: repo.env,
        encoding: "utf8",
        timeout: 20_000,
      },
    );
  assert.equal(runner("--dry-run").status, 0);
  assert.equal(repo.git("rev-parse", "HEAD"), repo.head);
  assert.equal(repo.git("tag"), "v0.4.0");
  assert.match(runner().stderr, /Publishing requires a master push/);
  assert.match(runner("--dryrun").stderr, /Unknown option/);
});
