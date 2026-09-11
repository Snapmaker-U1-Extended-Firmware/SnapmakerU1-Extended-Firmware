#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-PackageHomePage: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware
// SPDX-FileCopyrightText: Copyright (c) 2026 @paxx12
//
// Appends a `## Checksums` bullet for a built `.bin` to a release-notes
// markdown file, computing its real `md5`/`sha256`/`size` here (at build
// time, once) instead of hashing a ~300MB asset on every device request.
// `docs/functions/api/device/firmware/upgrade_desc.js` reads these back out
// of the live release body at request time, via the matching
// `extractChecksums()` in `docs/functions/_lib/github-releases.js` — so,
// unlike the static `upgrade_desc.json` release asset this replaced,
// hand-editing release notes in the GitHub UI can never make them stale.
//
// Usage: append_checksums.js <bin-file> <asset-name> <release-notes-md>

const fs = require("fs");
const crypto = require("crypto");

const [, , binPath, assetName, notesPath] = process.argv;

if (!binPath || !assetName || !notesPath) {
  console.error("usage: append_checksums.js <bin-file> <asset-name> <release-notes-md>");
  process.exit(1);
}

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
  const [md5, sha256] = await Promise.all([hashFile(binPath, "md5"), hashFile(binPath, "sha256")]);
  const size = fs.statSync(binPath).size;

  let notes = fs.readFileSync(notesPath, "utf8").replace(/\n+$/, "\n");
  if (!/^## Checksums\s*$/m.test(notes)) {
    notes += "\n## Checksums\n";
  }
  notes += `- ${assetName}: md5=${md5} sha256=${sha256} size=${size}\n`;

  fs.writeFileSync(notesPath, notes);
})();
