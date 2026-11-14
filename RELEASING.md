# Releasing

Successful CI on `master` runs semantic-release. It determines the version,
updates `package.json` with native `pnpm version`, generates `CHANGELOG.md`,
and commits both files before creating a `vX.Y.Z` tag and a draft GitHub release.
The existing `v0.4.0` tag is the migration baseline; historical notes are retained.

The Conventional Commits preset determines releases from commit messages:

| Message | Release |
| --- | --- |
| `fix(theme): improve comment contrast` | Patch |
| `perf(theme): simplify syntax matching` | Patch |
| `feat(theme): support additional syntax scopes` | Minor |
| A commit with a `BREAKING CHANGE:` footer | Major |
| `chore`, `ci`, `docs`, `build`, `refactor`, `style`, or `test` | None, unless breaking |

Use a descriptive Conventional Commits PR title and squash merge it. The
repository uses the PR title as the squash commit title, so the PR title is
what semantic-release reads. Preserve
breaking-change markers in the squashed commit. Both `feat!:` and a
`BREAKING CHANGE:` footer declare a breaking change. At the current `0.x`
version, a feature bumps the minor version and a breaking change releases
`1.0.0`.

Do not manually edit new changelog sections or bump the version. Release notes
come from the merged commits. Release commits use `[skip ci]` to avoid loops.

## Publication

The `release` job in `ci.yaml` runs semantic-release with a token for the
srcery-bot GitHub App (Contents and Actions write). It pushes the release commit
and tag, creates the draft release, and uses the exec plugin's `successCmd` to
dispatch the release workflow at the new tag. `release.yaml` is the tag run
only.
The tagged run uses a dependency-free `verify` job to check the version, master
ancestry, and draft status. Only a pending draft proceeds to `build`, which
packages and attests the VSIX. After a successful build, `publish` verifies its
exact source SHA, tag, and signer before uploading it and publishing the draft.
A failed build or verification leaves the release in draft.
Once the release is published, the `registry` matrix job publishes that same
VSIX to the VS Code Marketplace (`marketplace`) and Open VSX (`openvsx`). The
entries run in parallel with `fail-fast: false`, so one failing does not block
the other. Each waits for approval of its GitHub environment, then re-verifies
the release is published and the VSIX attestation before publishing with OIDC
trusted publishing (no tokens).
The `openvsx` entry finishes with `ovsx verify` against the registry's signature.
Both use `--skip-duplicate`. The registries' trusted publishing policies match
the workflow file `release.yaml`, so only the tag dispatch can publish.

`verify` needs `contents: write` to read draft releases but installs no
dependencies. `build` has `contents: read`, with
`id-token: write` and `attestations: write` for provenance. `publish` needs
`actions: read` to download the VSIX, `attestations: read` to verify it, and
`contents: write` to upload the asset and publish the draft.
`registry` has `contents: read` to download the asset,
`id-token: write` for trusted publishing, and `attestations: read`.

Both the CI `release` job and `build` set `cache: false` to disable
pnpm/setup's store and executable caches. That input alone does not disable
its lockfile verification cache: the
[pinned action's documentation](https://github.com/pnpm/setup/blob/731dfb6463bbd11c11fd0ee11fe00ed0e36d48a1/README.md#lockfile-verification-cache)
states that verification results are restored and saved independently of the
`cache` input, including results for `minimumReleaseAge` and `trustPolicy`.

The CI `release` job and the release workflow therefore also set
[`cache-mode: none`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#cache-mode).
GitHub enforces this restriction through scoped cache tokens, preventing cache
restores and saves across all release jobs. Disallowed cache operations are
skipped without failing the job. This covers the verification cache as well as
the caches controlled by the action's input.

GitHub's [cache security guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#best-practices-for-using-caches-securely)
warns that cached contents are not signed or verified and can change files that
a workflow later executes. Release jobs produce public artifacts, and the CI
`release` job holds the App's write access, so we avoid importing cache
contents at this boundary. We accept extra registry requests and slower
installs so that verification runs against registry metadata instead of
trusting a verdict restored from another run. Integrity, minimum-age, and
trust-policy checks still run; their results are not restored from another
workflow run. Ordinary CI retains its cache for speed. VSIX artifact transfer
and attestation remain separate from the dependency cache.

`minimumReleaseAge` blocks packages published less than a day ago. For an urgent
security fix, add the package to `minimumReleaseAgeExclude` in
`pnpm-workspace.yaml`.

The CI `release` job only runs for `master` pushes after the `check` job
passes. Use `--dry-run` locally; the CLI has no additional custom publishing
guard.

## Retry a failed publication

Dispatch the workflow at the existing tag, without running another release:

```sh
gh workflow run release.yaml --ref vX.Y.Z
```

This also recovers a failed dispatch after the CI `release` job created the
draft.
Draft assets can be replaced on retry; an already published release runs
`verify`, then both `registry` entries, with `build` and `publish` skipped.
This is how to retry a failed or rejected registry publication. `--skip-duplicate`
matches on version only: a skipped Marketplace publish does not prove the listed
package is the release VSIX, so check any version uploaded outside this workflow.
The `openvsx` entry's `ovsx verify` step does compare the published bytes.
If the CI `release` job failed after pushing the release commit but before
creating the tag or draft, complete those missing steps from that exact
commit. Use its package version and generated changelog notes; avoid
rerunning the `release` job and duplicating the changelog entry. To recreate
a missing draft for an existing tag:

```sh
gh release create vX.Y.Z --draft --verify-tag --title vX.Y.Z --notes-file release-notes.md
gh workflow run release.yaml --ref vX.Y.Z
```

Populate `release-notes.md` with that version's generated changelog section.
Do not delete published release tags.

## Registry setup

One-off setup, already done; recreate it if the repository or registry
entries are replaced:

- GitHub environments `marketplace` and `openvsx`, each limited to `v*` tags
  with a required reviewer. The tag rule is the gate, since the registries do
  not match the ref.
- A trusted publishing policy on each registry for owner `srcery-colors`,
  repository `srcery-vscode`, workflow `release.yaml`, and the matching
  environment name.
- GitHub environment `release`, limited to `master`, with the variable
  `RELEASE_APP_CLIENT_ID` and the secret `RELEASE_APP_PRIVATE_KEY` of the
  srcery-bot App. Only the CI `release` job uses them.
- The srcery-bot App, installed on this repository only, with Contents and
  Actions write. It is the only bypass actor on the `master` ruleset, which
  requires a pull request and the `lockfile`, `zizmor`, and `check` status
  checks. The `release tags` ruleset blocks deleting, moving, and force-pushing
  `v*` tags but allows creating them (tested), so it needs no bypass.

To rotate the key, generate a new private key in the App's settings, replace
the `RELEASE_APP_PRIVATE_KEY` secret, then delete the old key.

## Validate locally

Use the declared Node runtime and the pnpm version recorded in the lockfile:

```sh
pnpm install --frozen-lockfile
pnpm release --dry-run
```

Dry runs analyze commits and generate notes without updating files, creating
commits/tags/releases, or dispatching publication. Authentication and a current
checkout of `master` may be required to verify remote access.
