import { NextResponse } from "next/server";
import { HiggsfieldError, MissingCredentialsError, uploadFile } from "@/lib/higgsfield";

export const runtime = "nodejs";

/**
 * Exactly what Higgsfield's storage will issue an upload URL for — verified by
 * asking it. It rejects video/quicktime, video/webm and audio/mpeg, so there is
 * no point accepting those here only to fail a step later.
 */
const ALLOWED = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4",
  "audio/wav", "audio/x-wav",
];
const MAX_BYTES = 200 * 1024 * 1024;

/** Uploads a reference image to Higgsfield storage and returns its public URL. */
export async function POST(req: Request) {
  try {
    // formData() throws outright on a body that isn't multipart, which would
    // otherwise surface as a 500 for what is really a bad request.
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
    }

    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file supplied." }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported type ${file.type || "unknown"}. Use JPEG, PNG, WebP or GIF for images, MP4 for video, or WAV for audio.`,
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is larger than 200 MB." }, { status: 400 });
    }

    // Higgsfield only issues WAV upload URLs, so normalise the browser's
    // occasional audio/x-wav before asking for one.
    const contentType = file.type === "audio/x-wav" ? "audio/wav" : file.type;
    const url = await uploadFile(await file.arrayBuffer(), contentType);
    const kind = contentType.startsWith("video/")
      ? "video"
      : contentType.startsWith("audio/")
        ? "audio"
        : "image";
    return NextResponse.json({ url, kind });
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof HiggsfieldError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
