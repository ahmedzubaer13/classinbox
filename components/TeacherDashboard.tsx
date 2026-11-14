"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowDownToLine, ArrowUpRight, Check, Copy, FileArchive, FileDown, Inbox, LockKeyhole, LogOut, Plus, QrCode, RefreshCw, X } from "lucide-react";
import type { ClassSession, Submission } from "@/lib/types";
import { formatBytes } from "@/lib/types";

type Session = ClassSession;
export default function TeacherDashboard() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<Session | null>(null);
  const [qr, setQr] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/sessions", { cache: "no-store" });
    const data = await res.json();
    setLoading(false);
    if (res.status === 401) { setAuthed(false); return; }
    if (!res.ok) { setNotice(data.error || "Could not load sessions."); return; }
    setSessions(data.sessions || []);
    setSubmissions(data.submissions || []);
    setAuthed(true);
  }
  useEffect(() => { void load(); }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setLoginError(""); setLoading(true);
    const res = await fetch("/api/teacher/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await res.json(); setLoading(false);
    if (!res.ok) { setLoginError(data.error || "Login failed."); return; }
    setAuthed(true); setPassword(""); await load();
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault(); if (title.trim().length < 2) return;
    setCreating(true); setNotice("");
    const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    const data = await res.json(); setCreating(false);
    if (!res.ok) { setNotice(data.error || "Could not create session."); return; }
    setTitle(""); await load(); await showSession(data.session);
  }

  async function showSession(session: Session) {
    setActive(session);
    const url = `${window.location.origin}/s/${session.public_token}`;
    setQr(await QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: "#19372b", light: "#ffffff" } }));
  }

  async function toggleSession(session: Session) {
    const res = await fetch(`/api/sessions/${session.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !session.is_active }) });
    if (!res.ok) { const data = await res.json(); setNotice(data.error || "Could not update session."); return; }
    if (active?.id === session.id) setActive({ ...session, is_active: !session.is_active });
    await load();
  }

  async function logout() {
    await fetch("/api/teacher/logout", { method: "POST" });
    setAuthed(false); setSessions([]); setSubmissions([]); setActive(null);
  }

  const totalFiles = submissions.length;
  const activeSubmissions = useMemo(() => submissions.filter((s) => s.session_id === active?.id), [submissions, active]);
  const shareUrl = active ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${active.public_token}` : "";

  if (!authed) return (
    <main className="student-page">
      <div className="brand" style={{ justifyContent: "center" }}><span className="brand-mark"><Inbox size={21}/></span>ClassInbox</div>
      <form className="student-card" onSubmit={login}>
        <span className="feature-icon"><LockKeyhole/></span>
        <h1>Teacher sign in</h1>
        <p>Enter your teacher password to manage classroom sessions and submissions.</p>
        <div className="field"><label htmlFor="password">TEACHER PASSWORD</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder="Enter your password"/></div>
        {loginError && <p className="error">{loginError}</p>}
        <button className="button button-dark" style={{ width: "100%" }} disabled={loading}>{loading ? "Signing in…" : "Open dashboard"} <ArrowUpRight size={16}/></button>
        <p className="small muted" style={{ textAlign: "center", marginTop: 18 }}>ClassInbox · Teacher workspace</p>
      </form>
    </main>
  );

  return (
    <main className="app-shell">
      <header className="app-top">
        <a className="brand" href="/"><span className="brand-mark"><Inbox size={21}/></span>ClassInbox</a>
        <div className="actions"><button className="button button-secondary button-small" onClick={() => void load()}><RefreshCw size={14}/> Refresh</button><button className="button button-secondary button-small" onClick={() => void logout()}><LogOut size={14}/> Sign out</button></div>
      </header>
      <div className="app-main">
        <div className="page-heading"><div><span className="eyebrow">TEACHER WORKSPACE</span><h1>Your classroom inbox.</h1><p>Create a session, share its QR code, and collect files.</p></div><div className="pill pill-open"><span style={{ width: 6, height: 6, borderRadius: 9, background: "#76b34a", marginRight: 6 }}/> READY</div></div>
        {notice && <p className="error">{notice}</p>}
        <div className="session-grid">
          <form className="panel" onSubmit={createSession}>
            <h2 className="panel-title">Create a submission session</h2>
            <div className="field"><label htmlFor="session-title">SESSION TITLE</label><input id="session-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CSE221 — Assignment 01" maxLength={100} required/></div>
            <button className="button button-primary" disabled={creating || title.trim().length < 2}>{creating ? "Creating…" : "Create session"} <Plus size={16}/></button>
            <p className="small muted">A unique QR code and student upload link will be generated.</p>
          </form>
          <div className="panel">
            <h2 className="panel-title">Your collection overview</h2>
            <div className="fake-stats" style={{ marginTop: 5 }}><div><strong>{sessions.length}</strong><small>Sessions</small></div><div><strong>{totalFiles}</strong><small>Files received</small></div><div><strong>{sessions.filter(s => s.is_active).length}</strong><small>Open sessions</small></div></div>
            <p className="small muted" style={{ marginTop: 24 }}>Files are stored privately. Only the teacher dashboard can generate download links.</p>
          </div>
        </div>

        {active && <section className="session-detail">
          <div className="panel qr-panel">
            <span className="eyebrow">SESSION QR CODE</span><h2 className="panel-title" style={{ marginTop: 9, marginBottom: 3 }}>{active.title}</h2>
            {qr && <img src={qr} alt="Session QR code"/>}
            <p className="small muted">Students scan this code using their phone camera.</p>
            <div className="actions" style={{ justifyContent: "center" }}>
              <button className="button button-secondary button-small" onClick={() => void navigator.clipboard.writeText(shareUrl)}><Copy size={13}/> Copy link</button>
              <button className="button button-secondary button-small" onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}><ArrowUpRight size={13}/> Preview</button>
            </div>
          </div>
          <div className="panel">
            <div className="table-head"><div><h2 className="panel-title" style={{ marginBottom: 4 }}>Submissions</h2><span className="small muted">{activeSubmissions.length} file(s) received</span></div><a className="button button-dark button-small" href={`/api/sessions/${active.id}/zip`}><FileArchive size={14}/> Download ZIP</a></div>
            {activeSubmissions.length ? <div className="submission-list">{activeSubmissions.map((s) => <div className="submission-row" key={s.id}><div><strong>{s.original_filename}</strong><small>{s.student_name} · {s.student_id} · {formatBytes(Number(s.file_size))}</small></div><a className="button button-secondary button-small" href={`/api/download/${s.id}`}><FileDown size={14}/> Download</a></div>)}</div> : <div className="empty"><Inbox size={25}/><p>No files yet. Share the QR code to receive submissions.</p></div>}
          </div>
        </section>}

        <section style={{ marginTop: 26 }}>
          <div className="table-head"><div><h2 className="panel-title" style={{ marginBottom: 4 }}>Recent sessions</h2><span className="small muted">Select a session to view its QR code and files.</span></div><span className="small muted">{sessions.length} total</span></div>
          {sessions.length ? <div className="session-grid">{sessions.map((s) => {
            const count = submissions.filter((item) => item.session_id === s.id).length;
            return <article className="session-card" key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><span className={`pill ${s.is_active ? "pill-open" : "pill-closed"}`}>{s.is_active ? "OPEN" : "CLOSED"}</span><span className="small muted">{new Date(s.created_at).toLocaleDateString()}</span></div>
              <h3 style={{ marginTop: 13 }}>{s.title}</h3><div className="session-meta">{count} file(s) received</div>
              <div className="session-actions"><button className="button button-secondary button-small" onClick={() => void showSession(s)}><QrCode size={14}/> View QR & files</button><button className="button button-secondary button-small" onClick={() => void toggleSession(s)}>{s.is_active ? <X size={14}/> : <Check size={14}/>} {s.is_active ? "Close" : "Reopen"}</button></div>
            </article>;
          })}</div> : <div className="empty">No sessions yet. Create your first submission session above.</div>}
        </section>
      </div>
    </main>
  );
}
