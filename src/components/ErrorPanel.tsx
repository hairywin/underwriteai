import { useState } from "react";
import type { HttpErrorReport } from "../lib/http";

function troubleshootingTips(report: HttpErrorReport) {
  const tips: string[] = [];
  if (report.label === "Likely CORS blocked or network failure") {
    tips.push("Likely browser CORS enforcement. Move this request server-side through a proxy/API route.");
    tips.push("Check DevTools Network for failed preflight OPTIONS and Access-Control-Allow-Origin headers.");
  }
  if (report.status === 401 || report.status === 403) {
    tips.push("Verify API key validity and that your account/plan has permission for this endpoint.");
  }
  if (report.status === 429) {
    tips.push("You are being rate limited. Add retry backoff and reduce request frequency.");
  }
  if (report.status && report.status >= 500) {
    tips.push("Provider may be degraded. Retry later and monitor provider status pages.");
  }
  if (!tips.length) {
    tips.push("Review the request URL and method, then inspect DevTools Network for low-level failures.");
  }
  return tips;
}

export function ErrorPanel({ title, report }: { title: string; report: HttpErrorReport }) {
  const [copied, setCopied] = useState(false);

  async function copyDebugInfo() {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="text-sm bg-red-50 text-red-900 p-3 rounded border border-red-200 space-y-2">
      <div className="font-semibold">{title}</div>
      <div><b>What happened:</b> {report.label}</div>
      <div className="bg-white border border-red-100 rounded p-2 space-y-1">
        <div className="font-medium">Details</div>
        <div>URL: {report.url}</div>
        <div>Method: {report.method}</div>
        {report.status != null && <div>Status: {report.status} {report.statusText || ""}</div>}
        {report.bodyExcerpt && <div className="whitespace-pre-wrap break-all">Response: {report.bodyExcerpt}</div>}
        <div>Timestamp: {report.timestamp}</div>
        {report.hint && <div>Hint: {report.hint}</div>}
      </div>
      <div>
        <div className="font-medium">Troubleshooting tips</div>
        <ul className="list-disc ml-5">
          {troubleshootingTips(report).map((tip) => <li key={tip}>{tip}</li>)}
        </ul>
      </div>
      <button className="px-2 py-1 border rounded bg-white" onClick={copyDebugInfo}>{copied ? "Copied" : "Copy debug info"}</button>
    </div>
  );
}
