"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Donor submission status (queued intake). One reference in, one plain answer out; no personal data is shown or fetched. It looks up ONCE when asked and never
 * polls on its own (each lookup is a Google Sheets read); "check again" is held for 15 s. The final confirmation appears only at COMPLETE.
 */
interface Answer {
  reference: string;
  state: string;
  donationId?: string;
  final: boolean;
  message: string;
}
const STEPS = [
  { key: "RECEIVED", label: "Received" },
  { key: "ID_ASSIGNED", label: "Number assigned" },
  { key: "COMPLETE", label: "Recorded" },
];
const REF = /^SUB-[0-9A-Z]{12}$/;
const COOLDOWN_S = 15;

export default function IntakeStatus() {
  const [ref, setRef] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const look = useCallback(async (value: string) => {
    const r = value.trim().toUpperCase();
    if (!REF.test(r)) {
      setError("A reference looks like SUB-ABCD1234WXYZ. Please check it and try again.");
      setAnswer(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/intake/status?ref=${encodeURIComponent(r)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "We could not check the status right now.");
      setAnswer(json);
      setCooldown(COOLDOWN_S);
    } catch (e: any) {
      setAnswer(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ref") || "";
    if (fromUrl) {
      setRef(fromUrl.toUpperCase());
      void look(fromUrl);
    }
  }, [look]);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewing = answer && (answer.state === "REJECTED" || answer.state === "FAILED_REQUIRES_REVIEW");
  const at = answer ? STEPS.findIndex((s) => s.key === answer.state) : -1;

  return (
    <section style={{ maxWidth: 640, margin: "0 auto", padding: "0 1.25rem 4rem" }} aria-labelledby="status-title">
      <h1 id="status-title" className="section-title" style={{ textAlign: "left" }}>Check your submission</h1>
      <p style={{ margin: "0 0 1.4rem", lineHeight: 1.7, color: "rgba(252,251,251,0.82)" }}>
        Enter the reference you were given when you submitted. You do not need to submit again while you wait.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void look(ref);
        }}
        style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}
      >
        <label htmlFor="ref" style={{ position: "absolute", left: -9999 }}>Submission reference</label>
        <input
          id="ref"
          value={ref}
          onChange={(e) => setRef(e.target.value.toUpperCase())}
          placeholder="SUB-XXXXXXXXXXXX"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          style={{ flex: "1 1 14rem", minWidth: 0, minHeight: 48, padding: "0 1rem", fontSize: "max(16px, 1rem)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".04em", borderRadius: 10, border: "1px solid rgba(255,249,221,.25)", background: "rgba(0,0,0,.25)", color: "var(--ivory-light, #FFF9DD)" }}
        />
        <button
          type="submit"
          disabled={busy || (cooldown > 0 && !!answer && !answer.final && ref.trim().toUpperCase() === answer.reference)}
          style={{ minHeight: 48, padding: "0 1.4rem", borderRadius: 10, border: "none", fontWeight: 600, fontSize: "1rem", cursor: "pointer", background: "var(--ivory-light, #FFF9DD)", color: "#1a1a1a", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Checking…" : cooldown > 0 && answer && !answer.final ? `Check again in ${cooldown}s` : "Check status"}
        </button>
      </form>

      {error && (
        <p role="alert" style={{ marginTop: "1.2rem", padding: ".9rem 1rem", borderRadius: 10, background: "rgba(220,80,80,.12)", border: "1px solid rgba(220,80,80,.35)", color: "#ffd9d9" }}>
          {error}
        </p>
      )}

      {answer && (
        <div role="status" style={{ marginTop: "1.6rem" }}>
          <p style={{ margin: 0, fontSize: "clamp(1.2rem, 4.5vw, 1.55rem)", lineHeight: 1.4, fontWeight: 600, color: "var(--ivory-light, #FFF9DD)", textWrap: "balance" as any }}>
            {answer.message}
          </p>

          {!reviewing && (
            <ol style={{ listStyle: "none", padding: 0, margin: "1.6rem 0 0", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".5rem" }}>
              {STEPS.map((s, i) => {
                const done = i <= at;
                const current = i === at;
                return (
                  <li key={s.key} aria-current={current ? "step" : undefined} style={{ padding: ".7rem .6rem", borderRadius: 10, textAlign: "center", fontSize: ".85rem", lineHeight: 1.3, border: `1px solid ${current ? "var(--ivory-light, #FFF9DD)" : "rgba(255,249,221,.18)"}`, background: done ? "rgba(255,249,221,.1)" : "transparent", color: done ? "var(--ivory-light, #FFF9DD)" : "rgba(252,251,251,.5)", fontWeight: current ? 600 : 400 }}>
                    <span style={{ display: "block", fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>{i + 1}</span>
                    {s.label}
                  </li>
                );
              })}
            </ol>
          )}

          <dl style={{ margin: "1.6rem 0 0", display: "grid", gap: ".7rem" }}>
            <div>
              <dt style={{ fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(252,251,251,.55)" }}>Your reference</dt>
              <dd style={{ margin: ".2rem 0 0", display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ fontSize: "1.05rem", letterSpacing: ".04em" }}>{answer.reference}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(answer.reference).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  style={{ minHeight: 44, minWidth: 44, padding: "0 .8rem", borderRadius: 8, border: "1px solid rgba(255,249,221,.25)", background: "transparent", color: "inherit", cursor: "pointer" }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </dd>
            </div>
            {answer.donationId && (
              <div>
                <dt style={{ fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(252,251,251,.55)" }}>{answer.final ? "Donation number" : "Donation number (not yet your final receipt)"}</dt>
                <dd style={{ margin: ".2rem 0 0", fontSize: "1.3rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{answer.donationId}</dd>
              </div>
            )}
          </dl>
          {!answer.final && !reviewing && <p style={{ marginTop: "1.2rem", fontSize: ".9rem", lineHeight: 1.6, color: "rgba(252,251,251,.65)" }}>This page does not refresh by itself. Come back later and check again; there is no need to submit the form a second time.</p>}
        </div>
      )}
    </section>
  );
}
