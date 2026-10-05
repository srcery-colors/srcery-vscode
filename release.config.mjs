export default {
  branches: ["master"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release template
  tagFormat: "v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "angular" }],
    ["@semantic-release/release-notes-generator", { preset: "angular" }],
    [
      "@semantic-release/exec",
      {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release template
        prepareCmd: "pnpm version ${nextRelease.version} --no-git-tag-version",
      },
    ],
    [
      "@semantic-release/changelog",
      {
        changelogTitle:
          "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nNew release entries are generated from Angular-style commit messages by semantic-release.\n\nHistorical dates are taken from Git tags. Dates are omitted where no matching tag exists.",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "CHANGELOG.md"],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release template
        message: "chore(release): ${nextRelease.version} [skip ci]",
      },
    ],
    [
      "@semantic-release/github",
      {
        draftRelease: true,
        failComment: false,
        failTitle: false,
        labels: false,
        releasedLabels: false,
        successComment: false,
      },
    ],
  ],
};
