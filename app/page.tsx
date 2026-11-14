import Link from "next/link";
import { ArrowUpRight, Inbox, QrCode, Upload, FolderDown } from "lucide-react";

export default function Home() {
  return (
    <main className="landing">
      <nav className="topbar wrap">
        <Link href="/" className="brand"><span className="brand-mark"><Inbox size={21}/></span>ClassInbox</Link>
        <Link href="/teacher" className="button button-dark button-small">Dashboard <ArrowUpRight size={15}/></Link>
      </nav>
      <section className="hero wrap">
        <div className="eyebrow"><span className="eyebrow-dot"/> CLASSROOM FILE SUBMISSION, SIMPLIFIED</div>
        <h1>Your classroom&apos;s<br/><span>digital inbox.</span></h1>
        <p className="hero-copy">Collect assignments and classroom files without the usual back-and-forth. One QR code gets everyone to the right upload page.</p>
        <div className="hero-actions"><Link href="/teacher" className="button button-primary">Open Dashboard <ArrowUpRight size={17}/></Link><span className="micro-copy">No accounts. No app installation.</span></div>
        <div className="preview-card">
          <div className="preview-head"><div className="window-dots"><i/><i/><i/></div><span>CLASSINBOX / SESSION PREVIEW</span><span className="live-pill"><b/> READY TO RECEIVE</span></div>
          <div className="preview-body">
            <div className="preview-session"><span className="label">CURRENT SESSION</span><h3>Assignment 01 — CSE221</h3><p>Share the QR code with your class to start collecting files.</p><div className="fake-stats"><div><strong>24</strong><small>Students expected</small></div><div><strong>0</strong><small>Submissions</small></div><div><strong>Open</strong><small>Session status</small></div></div></div>
            <div className="qr-art"><QrCode size={108} strokeWidth={1.2}/><span>SCAN TO SUBMIT</span></div>
          </div>
          <div className="preview-foot"><span><i/> Secure session link</span><span>Files go straight to your inbox</span></div>
        </div>
      </section>
      <section className="feature-strip wrap">
        <div><span className="feature-icon"><QrCode/></span><div><strong>Scan to join</strong><small>One QR code per session.</small></div></div>
        <div><span className="feature-icon"><Upload/></span><div><strong>Upload together</strong><small>Choose multiple files at once.</small></div></div>
        <div><span className="feature-icon"><FolderDown/></span><div><strong>Download your way</strong><small>Files individually or as one ZIP.</small></div></div>
      </section>
      <footer className="footer wrap"><span>© {new Date().getFullYear()} ClassInbox</span><span>Scan. Upload. Done.</span></footer>
    </main>
  );
}
