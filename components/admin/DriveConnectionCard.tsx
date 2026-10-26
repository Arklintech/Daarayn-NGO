"use client";

import { useEffect, useState } from "react";

type Status = { configured: boolean; connected: boolean; account?: string; problem?: string; reauthorizeBy?: string; publishingStatus?: string; reauthorizeSoon?: boolean };

const RESULTS: Record<string, string> = {
  connected: "Google Drive connected.",
  denied: "Authorisation was cancelled.",
  invalid_state: "The connection request could not be verified. Please try again.",
  not_configured: "Google Drive OAuth is not configured on the server.",
  no_refresh_token: "Google did not return offline access. Remove Daarayn from your Google account's third-party access and try again.",
  missing_scope: "Drive access was not granted. Please approve all requested access.",
  exchange_failed: "Google rejected the authorisation. Please try again.",
};

/** Lets an administrator connect the Google account used for Drive uploads. Shows status only, never tokens. */
export default function DriveConnectionCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("drive");
    if (result) setNotice(RESULTS[result] || "");
    fetch("/api/admin/google-drive/status")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`))))
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <h2 className="text-sm font-semibold text-white mb-1">Google Drive (evidence storage)</h2>
      {notice && <p className="text-xs text-amber-300 mb-2">{notice}</p>}
      {error && <p className="text-xs text-red-400">Could not load status: {error}</p>}
      {status && (
        <p className="text-xs text-gray-300 mb-3">
          {status.connected ? `Connected as ${status.account || "authorised account"}.` : status.configured ? "Not connected. Uploads of donation proofs are refused until you connect." : status.problem}
          {status.problem && status.configured ? ` ${status.problem}` : ""}
        </p>
      )}
      {status?.connected && status.reauthorizeBy && (
        <p className={`text-xs mb-3 ${status.reauthorizeSoon ? "text-amber-300" : "text-gray-400"}`}>
          Google issues Testing-mode authorisations that expire after 7 days. Reconnect by {new Date(status.reauthorizeBy).toLocaleString()} to keep uploads working, or publish the OAuth app.
        </p>
      )}
      {status?.configured && (
        <a href="/api/admin/google-drive/connect" className="inline-block text-xs font-semibold px-4 py-2 rounded-lg text-black" style={{ background: "#fff" }}>
          {status.connected ? "Reconnect Google Drive" : "Connect Google Drive"}
        </a>
      )}
    </div>
  );
}
