import {
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
  join,
} from "node:path";

const HANDLE =
  process.env.WSOCIAL_HANDLE || "mkalz.wsocial.eu";

const LIMIT =
  Number.parseInt(process.env.WSOCIAL_LIMIT || "2", 10);

const API_ENDPOINT =
  "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed";

const DATA_FILE =
  join("data", "wsocial.json");

const MEDIA_DIRECTORY =
  join("static", "media", "wsocial");

function getPostKey(uri) {
  return uri.split("/").at(-1);
}

async function downloadAvatar(url) {
  if (!url) {
    return null;
  }

  const response = await fetch(url);

  if (!response.ok) {
    console.warn(
      `Profilbild konnte nicht geladen werden: ${response.status}`
    );

    return null;
  }

  const contentType =
    response.headers.get("content-type") || "";

  const extension =
    contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
        ? ".webp"
        : contentType.includes("gif")
          ? ".gif"
          : ".jpg";

  const filename = `avatar${extension}`;
  const destination = join(MEDIA_DIRECTORY, filename);

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  await writeFile(destination, buffer);

  return `/media/wsocial/${filename}`;
}

async function main() {
  await mkdir(dirname(DATA_FILE), {
    recursive: true,
  });

  // Dieses Verzeichnis enthält ausschließlich
  // automatisch erzeugte W-Social-Dateien.
  await rm(MEDIA_DIRECTORY, {
    recursive: true,
    force: true,
  });

  await mkdir(MEDIA_DIRECTORY, {
    recursive: true,
  });

  const requestUrl = new URL(API_ENDPOINT);

  requestUrl.searchParams.set("actor", HANDLE);
  requestUrl.searchParams.set("limit", "30");
  requestUrl.searchParams.set(
    "filter",
    "posts_no_replies"
  );

  console.log(
    `Lade W-Social-Feed für ${HANDLE} …`
  );

  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "kalz.cc-wsocial-snapshot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Feed konnte nicht geladen werden: HTTP ${response.status}`
    );
  }

  const result = await response.json();

  const entries = result.feed
    // Reposts ausschließen
    .filter((entry) => !entry.reason)

    // Sicherheitshalber nur eigene Beiträge übernehmen
    .filter((entry) => {
      const authorHandle =
        entry.post?.author?.handle?.toLowerCase();

      return authorHandle === HANDLE.toLowerCase();
    })

    .slice(0, LIMIT);

  const author = entries[0]?.post?.author;

  const localAvatar = await downloadAvatar(
    author?.avatar
  );

  const posts = entries.map((entry) => {
    const post = entry.post;
    const record = post.record || {};
    const postKey = getPostKey(post.uri);

    return {
      id: postKey,

      text:
        typeof record.text === "string"
          ? record.text
          : "",

      created_at:
        record.createdAt || post.indexedAt,

      url:
        `https://bsky.app/profile/${HANDLE}/post/${postKey}`,

      like_count:
        post.likeCount || 0,

      reply_count:
        post.replyCount || 0,

      repost_count:
        post.repostCount || 0,
    };
  });

  const snapshot = {
    handle: HANDLE,

    display_name:
      author?.displayName || "Marco Kalz",

    avatar: localAvatar,

    profile_url:
      `https://bsky.app/profile/${HANDLE}`,

    updated_at:
      new Date().toISOString(),

    posts,
  };

  await writeFile(
    DATA_FILE,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8"
  );

  console.log(
    `${posts.length} W-Social-Beiträge gespeichert.`
  );
}

main().catch((error) => {
  console.error("W-Social-Snapshot fehlgeschlagen.");
  console.error(error);
  process.exit(1);
});