"use client";

/**
 * Canonical operations figures from /api/admin/dashboard (`canonical`): contribution by cause from explicit
 * designations, the unresolved-distribution bucket, allocations, communication outcomes and data-integrity exceptions.
 * Nothing is computed in the browser; every number comes from the server's single snapshot.
 */
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function OperationsSummary({ canonical }: { canonical?: any }) {
  if (!canonical) return null;
  const { causes = [], unresolvedDistribution, unrestricted, allocations, communications, integrity } = canonical;
  return (
    <section className="space-y-4" aria-label="Operations summary">
      {integrity?.errors + integrity?.warnings > 0 && (
        <div className="p-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 text-xs text-amber-100" role="status">
          <p className="font-semibold">
            {integrity.errors} integrity error(s), {integrity.warnings} warning(s) need attention.
          </p>
          <ul className="mt-2 space-y-1">
            {(integrity.exceptions || []).filter((e: any) => e.severity !== "info").slice(0, 5).map((e: any, i: number) => (
              <li key={i}>
                <span className="font-mono">{e.entityId}</span> — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl p-5 admin-glass border border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white mb-3">Contribution by cause (verified, explicitly designated)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-gray-400">
              <tr>
                <th className="py-2 pr-3">Cause</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Designated</th>
                <th className="py-2 pr-3 text-right">Pending</th>
                <th className="py-2 pr-3 text-right">Allocated</th>
                <th className="py-2 pr-3 text-right">Awaiting split</th>
              </tr>
            </thead>
            <tbody className="text-gray-200">
              {causes.map((c: any) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="py-2 pr-3">{c.title}</td>
                  <td className="py-2 pr-3">{c.status}</td>
                  <td className="py-2 pr-3 text-right">{inr(c.designatedReceived)}</td>
                  <td className="py-2 pr-3 text-right">{inr(c.designatedPending)}</td>
                  <td className="py-2 pr-3 text-right">{inr(c.allocatedAmount)}</td>
                  <td className="py-2 pr-3 text-right">{c.unresolvedDonationCount}</td>
                </tr>
              ))}
              <tr className="border-t border-white/10 text-gray-300">
                <td className="py-2 pr-3" colSpan={2}>Unresolved distribution (counted once)</td>
                <td className="py-2 pr-3 text-right">{inr(unresolvedDistribution?.receivedAmount ?? 0)}</td>
                <td className="py-2 pr-3 text-right">{inr(unresolvedDistribution?.pendingAmount ?? 0)}</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-right">{unresolvedDistribution?.receivedCount ?? 0}</td>
              </tr>
              <tr className="text-gray-300">
                <td className="py-2 pr-3" colSpan={2}>Unrestricted (general)</td>
                <td className="py-2 pr-3 text-right">{inr(unrestricted?.receivedAmount ?? 0)}</td>
                <td className="py-2 pr-3 text-right">{inr(unrestricted?.pendingAmount ?? 0)}</td>
                <td className="py-2 pr-3" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          A donation related to several causes without a recorded split is shown once under "Unresolved distribution", never against each cause. Allocated is not spent.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="rounded-2xl p-5 admin-glass border border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white mb-2">Allocations</h3>
          <p className="text-gray-300">{allocations?.activeCount ?? 0} active · {inr(allocations?.activeAmount ?? 0)} · {allocations?.withEvidenceCount ?? 0} with evidence · {allocations?.reversedCount ?? 0} reversed</p>
        </div>
        <div className="rounded-2xl p-5 admin-glass border border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white mb-2">Communications (recipient outcomes)</h3>
          <p className="text-gray-300">
            {communications?.smtpAccepted ?? 0} SMTP-accepted · {communications?.failed ?? 0} failed · {communications?.unresolved ?? 0} unresolved · {communications?.stalePending ?? 0} stale pending
          </p>
          <p className="text-[11px] text-gray-500 mt-2">SMTP-accepted means the mail server accepted the message, not that it reached an inbox.</p>
        </div>
      </div>
    </section>
  );
}
