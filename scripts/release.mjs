import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import semanticRelease from "semantic-release";

const { values } = parseArgs({
  options: { "dry-run": { type: "boolean", default: false } },
});
const dryRun = values["dry-run"];
if (
  !dryRun &&
  (process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "push" ||
    process.env.GITHUB_REF !== "refs/heads/master")
) {
  throw new Error(
    "Publishing requires a master push in GitHub Actions; use --dry-run locally.",
  );
}
const release = await semanticRelease({ dryRun });

if (release && !dryRun) {
  execFileSync(
    "gh",
    ["workflow", "run", "release.yaml", "--ref", release.nextRelease.gitTag],
    { stdio: "inherit" },
  );
}
