import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { MEDIA_DIR } from "@/lib/db";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

/** Serves downloaded output from storage/media so the UI never depends on
 *  Higgsfield's URLs, which expire after about a week.
 *
 *  Honours Range requests: Safari refuses to play a <video> unless the server
 *  answers its probing `Range: bytes=0-1` with a 206, so a plain 200 of the
 *  whole file leaves it showing a crossed-out play button. */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params;

  const target = path.resolve(MEDIA_DIR, ...segments);
  // Refuse anything that escapes the media directory.
  if (!target.startsWith(path.resolve(MEDIA_DIR) + path.sep)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ext = target.split(".").pop()?.toLowerCase() ?? "";
  const size = fs.statSync(target).size;
  const headers: Record<string, string> = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    // "bytes=a-b", "bytes=a-" (to the end) or "bytes=-n" (the last n bytes).
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new NextResponse(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      });
    }
    return new NextResponse(stream(target, start, end), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new NextResponse(stream(target, 0, size - 1), {
    headers: { ...headers, "Content-Length": String(size) },
  });
}

/** Stream a byte range rather than reading whole videos into memory. */
function stream(file: string, start: number, end: number): ReadableStream {
  return Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
}
