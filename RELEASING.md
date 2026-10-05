# Releasing

Successful CI on `master` runs semantic-release. It determines the version,
updates `package.json` with native `pnpm version`, generates `CHANGELOG.md`,
and commits both files before creating a `vX.Y.Z` tag and a draft GitHub release.
The existing `v0.4.0` tag is the migration baseline; historical notes are retained.

The Angular preset determines releases from commit messages:

| Message | Release |
| --- | --- |
| `fix(theme): improve comment contrast` | Patch |
| `perf(theme): simplify syntax matching` | Patch |
| `feat(theme): support additional syntax scopes` | Minor |
| A commit with a `BREAKING CHANGE:` footer | Major |
| `chore`, `ci`, `docs`, `build`, `refactor`, `style`, or `test` | None, unless breaking |

Use a descriptive Angular-style PR title and squash merge it, preserving any
breaking-change footer in the commit body. Angular requires the footer; `feat!:`
alone does not declare a breaking change. At the current `0.x` version, a feature
bumps the minor version and a breaking change releases `1.0.0`.

Do not manually edit new changelog sections or bump the version. Release notes
come from the merged commits. Release commits use `[skip ci]` to avoid loops.

## Publication

Release preparation explicitly dispatches the GitHub release workflow at its new
tag. This works with `GITHUB_TOKEN`, whose tag pushes do not trigger workflows.
The tagged run verifies the version and master ancestry, packages and attests the
VSIX, then verifies its exact source SHA, tag, and signer before uploading it and
publishing the draft. A failed build or verification leaves the release in draft.
Marketplace uploads remain manual; use the VSIX from the published GitHub release.

The repository's branch and tag rules must allow `GITHUB_TOKEN` to push release
commits and tags. Preparation needs `contents: write` and `actions: write`;
the publishing workflow declares its artifact and attestation permissions.
No personal access token or separate bot account is required.

## Retry a failed publication

Dispatch the workflow at the existing tag, without preparing another version:

```sh
gh workflow run release.yaml --ref vX.Y.Z
```

This also recovers a failed dispatch after preparation created the draft.
Draft assets can be replaced on retry; an already published release is skipped.
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
pnpm test:release
pnpm release --dry-run
```

Dry runs analyze commits and generate notes without updating files, creating
commits/tags/releases, or dispatching publication. Authentication and a current
checkout of `master` may be required to verify remote access.
