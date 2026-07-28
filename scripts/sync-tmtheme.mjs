#!/usr/bin/env node
// Upstream: srcery-colors/srcery-textmate
//
// Fetches themes/srcery.tmTheme from a git ref of srcery-colors/srcery-textmate.
// Defaults to `master`; pass a branch, tag, or commit SHA to pin the source:
//   node scripts/sync-tmtheme.mjs [ref]
import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStringPromise } from "xml2js";

const UPSTREAM_REF = process.argv[2] ?? "master";
const TMTHEME_URL = `https://raw.githubusercontent.com/srcery-colors/srcery-textmate/${UPSTREAM_REF}/srcery.tmTheme`;
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "themes",
  "srcery.tmTheme",
);
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const PLIST_VALUE_NAMES = new Set([
  "array",
  "data",
  "date",
  "dict",
  "false",
  "integer",
  "real",
  "string",
  "true",
]);

async function readBoundedResponse(response) {
  if (!response.body) {
    throw new Error("Upstream response did not include a body");
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      throw new Error(`Upstream theme exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

async function validateTmTheme(xml) {
  const document = await parseStringPromise(xml, {
    explicitChildren: true,
    preserveChildrenOrder: true,
  });
  const plist = document.plist;
  const [dictionary] = plist?.$$ ?? [];
  const entries = dictionary?.$$;

  if (
    plist?.$?.version !== "1.0" ||
    !Array.isArray(plist?.$$) ||
    plist.$$.length !== 1 ||
    dictionary?.["#name"] !== "dict" ||
    !Array.isArray(entries) ||
    entries.length % 2 !== 0 ||
    !entries.every((entry, index) =>
      index % 2 === 0
        ? entry["#name"] === "key" && typeof entry._ === "string"
        : PLIST_VALUE_NAMES.has(entry["#name"]),
    )
  ) {
    throw new Error("Upstream response is not a valid Srcery tmTheme plist");
  }

  const settingsEntries = entries.filter(
    (entry, index) =>
      index % 2 === 0 &&
      entry["#name"] === "key" &&
      entry._ === "settings",
  );
  const settingsIndex = entries.indexOf(settingsEntries[0]);
  if (
    settingsEntries.length !== 1 ||
    entries[settingsIndex + 1]?.["#name"] !== "array"
  ) {
    throw new Error("Upstream response is not a valid Srcery tmTheme plist");
  }
}

async function writeAtomically(contents) {
  const temporaryPath = `${OUTPUT_PATH}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, OUTPUT_PATH);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function main() {
  const response = await fetch(TMTHEME_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${TMTHEME_URL}: ${response.status} ${response.statusText}`,
    );
  }

  const xml = await readBoundedResponse(response);
  await validateTmTheme(xml);
  await writeAtomically(xml);
  console.log(`Vendored ${OUTPUT_PATH} from ${TMTHEME_URL}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
