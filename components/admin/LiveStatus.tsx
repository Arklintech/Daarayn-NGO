"use client";

import type { RealtimeStatus } from "@/lib/realtime/client";

interface LiveStatusProps {
  status: RealtimeStatus;
  /** When the figures on screen were read from Google Sheets. */
  updatedAt: string | null;
  /** Set when the latest refresh failed; the figures shown are then older. */
  error?: string | null;
  refreshing?: boolean;
  onRetry?: () => void;
}

const DOT: Record<RealtimeStatus, string> = {
  live: "bg-emerald-400",
  connecting: "bg-amber-300 animate-pulse",
  reconnecting: "bg-amber-300 animate-pulse",
  offline: "bg-red-400",
};

const LABEL: Record<RealtimeStatus, string> = {
  live: "Live",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Live updates paused",
};

function time(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function LiveStatus({ status, updatedAt, error, refreshing, onRetry }: LiveStatusProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5 text-gray-400">
        <span className={`w-1.5 h-1.5 rounded-full ${DOT[status]}`} aria-hidden="true" />
        {LABEL[status]}
      </span>
      {error ? (
        <span className="flex items-center gap-2 text-amber-300">
          Couldn&apos;t refresh — showing data from {time(updatedAt)}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="underline underline-offset-2 hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-luxury-gold rounded"
            >
              Retry
            </button>
          )}
        </span>
      ) : (
        <span className="text-gray-500">{refreshing ? "Refreshing…" : `Updated ${time(updatedAt)}`}</span>
      )}
    </div>
  );
}
