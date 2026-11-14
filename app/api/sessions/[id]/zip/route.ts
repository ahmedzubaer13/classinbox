import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { readCreatorSecret, ownerHashForSession } from "@/lib/auth";
import { supabaseAdmin, bucketName } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const creatorSecret = readCreatorSecret(request);
  if (!creatorSecret) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const { id } = await context.params;
  const db = supabaseAdmin();
  const { data: session } = await db.from("sessions")
    .select("id,title,owner_key_hash,cleanup_started_at")
    .eq("id", id).maybeSingle();

  if (!session || session.cleanup_started_at ||
      session.owner_key_hash !== ownerHashForSession(creatorSecret, id)) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const { data: submissions, error } = await db.from("submissions")
    .select("*").eq("session_id", id).order("student_id", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load files." }, { status: 500 });
  if (!submissions?.length) return NextResponse.json({ error: "There are no files to download yet." }, { status: 404 });

  const safeTitle = session.title.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "classinbox";
  const archive = archiver("zip", { zlib: { level: 5 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", (err: Error) => console.warn("ZIP warning", err));
      archive.on("error", (err: Error) => controller.error(err));
    },
    cancel() { archive.abort(); },
  });

  void (async () => {
    try {
      for (const item of submissions) {
        const { data: signed, error: signedError } = await db.storage.from(bucketName()).createSignedUrl(item.storage_path, 120);
        if (signedError || !signed) throw new Error(signedError?.message || "Could not sign file.");
        const response = await fetch(signed.signedUrl);
        if (!response.ok) throw new Error(`Could not fetch ${item.original_filename}`);
        const folder = `${item.student_id}_${item.student_name}`.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 100);
        archive.append(Buffer.from(await response.arrayBuffer()), { name: `${folder}/${item.original_filename}` });
      }
      await archive.finalize();
    } catch (err) {
      archive.destroy(err as Error);
    }
  })();

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle}_submissions.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
