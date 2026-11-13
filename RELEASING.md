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

Use a descriptive Conventional Commits PR title and squash merge it. Preserve
breaking-change markers in the squashed commit. Both `feat!:` and a
`BREAKING CHANGE:` footer declare a breaking change. At the current `0.x`
version, a feature bumps the minor version and a breaking change releases
`1.0.0`.

Do not manually edit new changelog sections or bump the version. Release notes
come from the merged commits. Release commits use `[skip ci]` to avoid loops.

## Publication

The semantic-release CLI uses the exec plugin's `successCmd` to dispatch the
GitHub release workflow at its new tag after creating the draft release.
This works with `GITHUB_TOKEN`, whose tag pushes do not trigger workflows.
The tagged run uses a dependency-free `verify` job to check the version, master
ancestry, and draft status. Only a pending draft proceeds to `build`, which
packages and attests the VSIX. After a successful build, `publish` verifies its
exact source SHA, tag, and signer before uploading it and publishing the draft.
A failed build or verification leaves the release in draft.
Marketplace uploads remain manual; use the VSIX from the published GitHub release.

The repository's branch and tag rules must allow `GITHUB_TOKEN` to push release
commits and tags. `prepare` needs `contents: write` for commits, tags, and drafts,
and `actions: write` to dispatch publication. `verify` needs `contents: write`
to read draft releases but installs no dependencies. `build` has `contents: read`,
with `id-token: write` and `attestations: write` for provenance. `publish` needs
`actions: read` to download the VSIX, `attestations: read` to verify it, and
`contents: write` to upload the asset and publish the draft.
No personal access token or separate bot account is required.

Both `prepare` and `build` set `cache: false` to disable pnpm/setup's store and
executable caches. That input alone does not disable its lockfile verification
cache: the [pinned action's documentation](https://github.com/pnpm/setup/blob/731dfb6463bbd11c11fd0ee11fe00ed0e36d48a1/README.md#lockfile-verification-cache)
states that verification results are restored and saved independently of the
`cache` input, including results for `minimumReleaseAge` and `trustPolicy`.

The release workflow therefore also sets
[`cache-mode: none`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#cache-mode).
GitHub enforces this restriction through scoped cache tokens, preventing cache
restores and saves across all release jobs. Disallowed cache operations are
skipped without failing the job. This covers the verification cache as well as
the caches controlled by the action's input.

GitHub's [cache security guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#best-practices-for-using-caches-securely)
warns that cached contents are not signed or verified and can change files that
a workflow later executes. Release jobs produce public artifacts, and `prepare`
has repository write access, so we avoid importing cache contents at this boundary.
We accept extra registry requests and slower installs so that
verification runs against registry metadata instead of trusting a verdict
restored from another run. Integrity, minimum-age, and trust-policy checks still
run; their results are not restored from another workflow run. Ordinary CI retains
its cache for speed. VSIX artifact transfer and attestation remain separate from
the dependency cache.

The preparation job only runs for `master` pushes after successful CI. Use
`--dry-run` locally; the CLI has no additional custom publishing guard.

## Retry a failed publication

Dispatch the workflow at the existing tag, without preparing another version:

```sh
gh workflow run release.yaml --ref vX.Y.Z
```

This also recovers a failed dispatch after preparation created the draft.
Draft assets can be replaced on retry; an already published release runs only
`verify`, with `build` and `publish` skipped.
If preparation failed after pushing the release commit but before creating the
tag or draft, complete those missing steps from that exact commit. Use its
package version and generated changelog notes; avoid rerunning preparation and
duplicating the changelog entry. To recreate a missing draft for an existing tag:

```sh
gh release create vX.Y.Z --draft --verify-tag --title vX.Y.Z --notes-file release-notes.md
gh workflow run release.yaml --ref vX.Y.Z
```

Populate `release-notes.md` with that version's generated changelog section.
Do not delete published release tags.

## Validate locally

Use the declared Node runtime and the pnpm version recorded in the lockfile:

```sh
pnpm install --frozen-lockfile
pnpm release --dry-run
```

Dry runs analyze commits and generate notes without updating files, creating
commits/tags/releases, or dispatching publication. Authentication and a current
checkout of `master` may be required to verify remote access.
