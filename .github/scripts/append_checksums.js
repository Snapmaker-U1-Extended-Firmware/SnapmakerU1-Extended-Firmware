#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-PackageHomePage: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware
// SPDX-FileCopyrightText: Copyright (c) 2026 @paxx12
//
// Fills the `<!-- CHECKSUMS_PLACEHOLDER -->` in a release-notes markdown
// file with a table of `md5`/`sha256`/`size` for one or more built `.bin`s,
// computed here (at build time, once) instead of hashing a ~300MB asset on
// every device request.
// `docs/functions/api/device/firmware/upgrade_desc.js` reads a row back out
// of the live release body at request time, via the matching
// `extractChecksums()` in `docs/functions/_lib/github-releases.js` — so,
// unlike the static `upgrade_desc.json` release asset this replaced,
// hand-editing release notes in the GitHub UI can never make them stale.
//
// Usage: append_checksums.js <release-notes-md> <bin-file> [<bin-file> ...]

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const [, , notesPath, ...binPaths] = process.argv;

if (!notesPath || binPaths.length === 0) {
  console.error("usage: append_checksums.js <release-notes-md> <bin-file> [<bin-file> ...]");
  process.exit(1);
}

const PLACEHOLDER = "<!-- CHECKSUMS_PLACEHOLDER -->";

function hashFile(path, algo) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algo);
    fs.createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

(async () => {
  const notes = fs.readFileSync(notesPath, "utf8");
  if (!notes.includes(PLACEHOLDER)) {
    console.error(`error: ${notesPath} has no ${PLACEHOLDER}`);
    process.exit(1);
  }

  const rows = await Promise.all(binPaths.map(async (binPath) => {
    const [md5, sha256] = await Promise.all([hashFile(binPath, "md5"), hashFile(binPath, "sha256")]);
    const size = fs.statSync(binPath).size;
    return `| ${path.basename(binPath)} | ${md5} | ${sha256} | ${size} |`;
  }));

  const table = ["| File | MD5 | SHA256 | Size |", "| --- | --- | --- | --- |", ...rows].join("\n");

  fs.writeFileSync(notesPath, notes.replace(PLACEHOLDER, table));
})();
