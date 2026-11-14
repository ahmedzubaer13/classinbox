"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { CheckCircle2, File, Inbox, UploadCloud, AlertCircle } from "lucide-react";
import { formatBytes } from "@/lib/types";

type UploadItem = { id: string; file: File; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string; uploadPath?: string; storageUploaded?: boolean };

const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

function getStorageOrigin(projectUrl: string) {
  const url = new URL(projectUrl);
  if (url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".storage.supabase.co")) {
    const projectRef = url.hostname.slice(0, -".supabase.co".length);
    url.hostname = `${projectRef}.storage.supabase.co`;
  }
  return url.origin;
}

async function uploadWithProgress(
  url: string,
  apiKey: string,
  file: File,
  token: string,
  path: string,
  onProgress: (n: number) => void,
) {
  const firstHeartbeat = await fetch("/api/upload/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, path }),
  });
  if (!firstHeartbeat.ok) throw new Error("This session has expired. Please ask your teacher for a new QR code.");

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let heartbeatPending = false;
    let heartbeatFailed = false;
    const heartbeatTimer = window.setInterval(async () => {
      if (heartbeatPending || xhr.readyState === XMLHttpRequest.DONE) return;
      heartbeatPending = true;
      try {
        const response = await fetch("/api/upload/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, path }),
        });
        if (!response.ok) {
          heartbeatFailed = true;
          xhr.abort();
        }
      } catch {
        heartbeatFailed = true;
        xhr.abort();
      } finally {
        heartbeatPending = false;
      }
    }, 45_000);

    const finish = () => window.clearInterval(heartbeatTimer);
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      finish();
      if (heartbeatFailed) return reject(new Error("The session expired during upload. Please ask your teacher for a new QR code."));
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.responseText || `Storage upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => { finish(); reject(new Error("Network error. Check your connection and retry this file.")); };
    xhr.onabort = () => {
      finish();
      reject(new Error(heartbeatFailed
        ? "The session expired during upload. Please ask your teacher for a new QR code."
        : "Upload cancelled."));
    };
    xhr.send(file);
  });
}


async function uploadResumableWithProgress(
  storageOrigin: string,
  apiKey: string,
  file: File,
  token: string,
  path: string,
  bucket: string,
  signedToken: string,
  onProgress: (n: number) => void,
) {
  const firstHeartbeat = await fetch("/api/upload/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, path }),
  });
  if (!firstHeartbeat.ok) throw new Error("This session has expired. Please ask your teacher for a new QR code.");

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let heartbeatPending = false;
    let heartbeatFailed = false;
    let heartbeatTimer: number | undefined;

    const finish = () => {
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
    };

    const upload = new tus.Upload(file, {
      endpoint: `${storageOrigin}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        apikey: apiKey,
        "x-signature": signedToken,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      uploadDataDuringCreation: true,
      chunkSize: TUS_CHUNK_SIZE,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: false,
      onError: (error) => {
        if (settled) return;
        settled = true;
        finish();
        reject(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesTotal > 0) onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => {
        if (settled) return;
        settled = true;
        finish();
        resolve();
      },
    });

    heartbeatTimer = window.setInterval(async () => {
      if (heartbeatPending || settled) return;
      heartbeatPending = true;
      try {
        const response = await fetch("/api/upload/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, path }),
        });
        if (!response.ok) heartbeatFailed = true;
      } catch {
        heartbeatFailed = true;
      } finally {
        heartbeatPending = false;
      }
      if (heartbeatFailed && !settled) {
        settled = true;
        finish();
        void upload.abort().catch(() => undefined);
        reject(new Error("The session expired during upload. Please ask your teacher for a new QR code."));
      }
    }, 45_000);

    upload.start();
  });
}

export default function StudentUpload({ token }: { token: string }) {
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionTitle, setSessionTitle] = useState("ClassInbox submission");
  const [closed, setClosed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const [maxFilesAllowed, setMaxFilesAllowed] = useState(10);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/session/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setClosed(true); setMessage(data.error || "This session is unavailable."); return; }
        setSessionTitle(data.title);
        setMaxFilesAllowed(data.maxFiles || 10);
        setClosed(!data.isActive);
      })
      .catch(() => { if (!cancelled) { setClosed(true); setMessage("Could not verify this session. Check your connection."); } });
    return () => { cancelled = true; };
  }, [token]);
  const totalProgress = useMemo(() => items.length ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length) : 0, [items]);

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  function addFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    setItems((prev) => {
      const remaining = Math.max(0, maxFilesAllowed - prev.length);
      if (incoming.length > remaining) setMessage(`You can submit up to ${maxFilesAllowed} files in one submission.`);
      return [...prev, ...incoming.slice(0, remaining).map((file) => ({ id: crypto.randomUUID(), file, progress: 0, status: "queued" as const }))];
    });
    setMessage("");
  }
  function removeFile(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function submit() {
    if (!studentName.trim() || !studentId.trim()) { setMessage("Enter your name and student ID first."); return; }
    if (!items.length) { setMessage("Choose at least one file to upload."); return; }
    if (!supabaseUrl || !anonKey) { setMessage("The upload service is not configured. Contact your teacher."); return; }
    setBusy(true); setMessage("");
    const pending = items.filter((item) => item.status !== "done");
    let nextIndex = 0;

    async function processItem(item: UploadItem) {
      updateItem(item.id, { status: "uploading", progress: item.storageUploaded ? 100 : 0, error: undefined });
      let uploadPath = item.uploadPath ?? "";
      let storageUploaded = item.storageUploaded ?? false;
      try {
        if (!storageUploaded || !uploadPath) {
          const initRes = await fetch("/api/upload/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              filename: item.file.name,
              size: item.file.size,
              mimeType: item.file.type,
              batchSize: pending.length,
            }),
          });
          const init = await initRes.json();
          if (!initRes.ok) throw new Error(init.error || "Could not prepare upload.");
          setMaxFilesAllowed(init.maxFiles || 10);
          uploadPath = init.path;
          updateItem(item.id, { uploadPath, storageUploaded: false });

          const storageOrigin = getStorageOrigin(supabaseUrl);
          if (item.file.size > RESUMABLE_THRESHOLD) {
            await uploadResumableWithProgress(
              storageOrigin,
              anonKey,
              item.file,
              token,
              init.path,
              init.bucket,
              init.signedToken,
              (progress) => updateItem(item.id, { progress }),
            );
          } else {
            const objectUrl = `${storageOrigin}/storage/v1/object/upload/sign/${encodeURIComponent(init.bucket)}/${init.path.split("/").map(encodeURIComponent).join("/")}?token=${encodeURIComponent(init.signedToken)}`;
            await uploadWithProgress(objectUrl, anonKey, item.file, token, init.path, (progress) => updateItem(item.id, { progress }));
          }
          storageUploaded = true;
          updateItem(item.id, { progress: 100, storageUploaded: true });
        }

        // Completion is retryable without uploading the file a second time.
        const completeRes = await fetch("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            path: uploadPath,
            filename: item.file.name,
            size: item.file.size,
            mimeType: item.file.type,
            studentName,
            studentId,
          }),
        });
        const complete = await completeRes.json();
        if (!completeRes.ok) throw new Error(complete.error || "Could not confirm submission.");
        updateItem(item.id, { status: "done", progress: 100, uploadPath, storageUploaded: true });
      } catch (err) {
        // Do not mark a completed Storage object as failed when only the
        // metadata-confirmation request failed. The next attempt can finalize it.
        if (uploadPath && !storageUploaded) {
          await fetch("/api/upload/fail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, path: uploadPath }),
          }).catch(() => undefined);
        }
        updateItem(item.id, {
          status: "error",
          uploadPath: storageUploaded ? uploadPath : undefined,
          storageUploaded,
          error: err instanceof Error ? err.message : "Upload failed.",
        });
      }
    }

    // Two simultaneous transfers reduce waiting for a batch without saturating
    // a typical mobile connection or causing too many concurrent Storage writes.
    const workerCount = Math.min(2, pending.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < pending.length) {
        const item = pending[nextIndex++];
        await processItem(item);
      }
    }));
    setBusy(false);
    setMessage("Upload process finished. Check each file's status below.");
  }

  return (
    <main className="student-page">
      <div className="brand" style={{ justifyContent: "center" }}><span className="brand-mark"><Inbox size={21}/></span>ClassInbox</div>
      <section className="student-card">
        <span className="eyebrow">CLASSROOM SUBMISSION</span>
        <h1>{sessionTitle}</h1>
        <p>Enter your details, choose your files, and submit them to your teacher. Keep this page open until uploads finish.</p>
        {closed ? <div className="empty"><AlertCircle size={26}/><p>This session is closed and is no longer accepting submissions.</p></div> : <>
          <div className="field"><label htmlFor="student-name">YOUR NAME</label><input id="student-name" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Enter your full name" disabled={busy}/></div>
          <div className="field"><label htmlFor="student-id">STUDENT ID</label><input id="student-id" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Enter your student ID" disabled={busy}/></div>
          <div className="dropzone">
            <UploadCloud size={30} color="#71934f"/>
            <p style={{ fontWeight: 700, fontSize: 13, margin: "9px 0 5px" }}>Choose files to submit</p>
            <p className="small muted">Select up to {maxFilesAllowed} files. Maximum 50 MB per file.</p>
            <input ref={inputRef} type="file" multiple onChange={(e) => addFiles(e.target.files)} disabled={busy}/>
          </div>
          {items.length > 0 && <div style={{ margin: "18px 0" }}>
            <div className="table-head"><strong style={{ fontSize: 12 }}>{items.length} selected file(s)</strong><span className="small muted">{totalProgress}% overall</span></div>
            {items.map((item) => <div className="progress-item" key={item.id}>
              <div className="progress-top"><span style={{ display: "flex", alignItems: "center", gap: 6 }}><File size={13}/>{item.file.name} <span className="muted">({formatBytes(item.file.size)})</span></span><span>{item.status === "done" ? <CheckCircle2 size={15} color="#4d9348"/> : item.status === "error" ? <AlertCircle size={15} color="#b4473e"/> : `${item.progress}%`}</span></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${item.progress}%`, background: item.status === "error" ? "#c45a50" : undefined }}/></div>
              {item.error && <p className="error">{item.error}</p>}
              {!busy && item.status !== "done" && <button className="small muted" style={{ border: 0, background: "none", padding: "5px 0" }} onClick={() => removeFile(item.id)}>Remove</button>}
            </div>)}
          </div>}
          {message && <div className="toast">{message}</div>}
          <button className="button button-dark" style={{ width: "100%", marginTop: 8 }} onClick={() => void submit()} disabled={busy || items.length === 0}><UploadCloud size={16}/>{busy ? "Uploading files…" : "Submit files"}</button>
          <p className="small muted" style={{ textAlign: "center", marginTop: 13 }}>Your files are sent securely to your teacher&apos;s submission inbox.</p>
        </>}
      </section>
      <p className="small muted" style={{ textAlign: "center" }}>Powered by ClassInbox · Scan. Upload. Done.</p>
    </main>
  );
}
