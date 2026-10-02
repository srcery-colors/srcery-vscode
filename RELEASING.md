# Releasing

Maintain user-facing changes under `## [Unreleased]` in `CHANGELOG.md`.
Release preparation uses release-it and its Keep a Changelog plugin to update
`package.json`, date the release section, preserve a new Unreleased section,
and update comparison links. An empty Unreleased section is rejected.
The bumper plugin writes the package version directly because `npm version`
conflicts with this repository's pnpm-only `devEngines` configuration.

## Prepare a release

1. Run **Prepare release** from the Actions tab on `master`, choosing patch,
   minor, or major. The workflow creates or updates the `release/next` draft PR.
2. Review the version, changelog, and date. Mark the PR ready for review to run CI.
   Rerunning preparation updates the same branch and returns the PR to draft;
   keep changelog edits on `master` so they survive regeneration.
3. Merge after review and successful checks.
4. Push the matching `vX.Y.Z` tag on the reviewed merge commit. The existing
   GitHub release workflow builds, attests, verifies, and publishes the VSIX
   with the matching changelog section. Upload that VSIX to marketplaces manually.

The repository must allow GitHub Actions to create pull requests under
**Settings → Actions → General → Workflow permissions**. Preparation uses
`GITHUB_TOKEN`; no personal access token is required. The `ready_for_review`
CI event lets a maintainer trigger checks on the generated draft PR.

## Prepare locally

From a clean release branch with current tags and dependencies installed:

```sh
git fetch origin --tags
pnpm release:prepare patch
```

Review and commit the resulting changes, then open a PR. This command does not
commit, create tags, push, or publish packages or GitHub releases.
Complete the current version's release before preparing the next one so that
the plugin can use its tag as the comparison base.
