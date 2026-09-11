// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-PackageHomePage: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware
// SPDX-FileCopyrightText: Copyright (c) 2026 @paxx12
// 
import {
  cached,
  findAsset,
  findRelease,
  jsonResponse,
} from "../../../_lib/github-releases.js";

const CHANNELS = ["stable", "testing", "develop"];
const BIN_ASSET_PREFIX = "U1_";
const BIN_ASSET_SUFFIX = "_upgrade.bin";

// Trims the fractional-seconds/`Z` suffix GitHub timestamps carry, to match
// the plain `YYYY-MM-DDTHH:MM:SS` shape of Snapmaker's own API responses.
function toApiTimestamp(iso) {
  return iso.replace(/\.\d+Z$/, "").replace(/Z$/, "");
}

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const channel = (url.searchParams.get("channel") || "stable").toLowerCase();
  const fullversion = url.searchParams.get("fullversion") || "";
  const buildProfile = url.searchParams.get("build_profile") || "extended";
  const buildVersion = url.searchParams.get("build_version") || "";

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  if (!CHANNELS.includes(channel)) {
    return cached(cache, waitUntil, request, jsonResponse(
      { code: 400, msg: `invalid channel '${channel}', expected one of: ${CHANNELS.join(", ")}`, data: null },
      400,
    ));
  }

  let release;
  try {
    release = await findRelease(channel, env);
  } catch (err) {
    const status = err.status || 502;
    return cached(cache, waitUntil, request, jsonResponse({ code: status, msg: String(err.message || err), data: null }, status));
  }

  const binAsset = findAsset(release, `${BIN_ASSET_PREFIX}${buildProfile}_`, BIN_ASSET_SUFFIX);

  if (!binAsset) {
    return cached(cache, waitUntil, request, jsonResponse(
      { code: 404, msg: `release '${release.tag_name}' has no '${buildProfile}' asset`, data: null },
      404,
    ));
  }

  let newVersion = (release.name || release.tag_name).replace(/^(?:Rolling:\s*)?v/, "");

  // `upgrade_desc.js` builds this descriptor dynamically from the same
  // release, rather than us pointing at a static `_upgrade_desc.json`
  // release asset — see that endpoint for why. Pinned to the exact
  // `release`/`binAsset` we just resolved (by id, not `channel`/
  // `build_profile` again) so it can't drift onto a different release if
  // a new one gets published between this request and the device following
  // `note` — a plain re-run of channel resolution could otherwise pick
  // something newer for `testing`/`stable`.
  const noteUrl = new URL("/api/device/firmware/upgrade_desc", url.origin);
  noteUrl.searchParams.set("id", release.id);
  noteUrl.searchParams.set("asset_id", binAsset.id);

  const body = {
    code: 200,
    msg: "success",
    data: {
      id: release.id,
      name: release.name || release.tag_name,
      note: noteUrl.toString(),
      url: binAsset.browser_download_url,
      status: 200,
      version: newVersion,
      createDate: toApiTimestamp(release.created_at),
      modifiedDate: toApiTimestamp(release.published_at || release.created_at),
    },
  };

  return cached(cache, waitUntil, request, jsonResponse(body));
}
