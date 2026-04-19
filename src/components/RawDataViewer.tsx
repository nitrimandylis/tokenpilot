"use client";

import { useState } from "react";
import type { RawAPIData } from "@/types";

interface RAWLabelsType {
  label: string;
  desc: string;
}

const RAW_LABELS: Record<string, RAWLabelsType> = {
  organization: { label: "Organization", desc: "/v1/organizations/me" },
  workspaces: { label: "Workspaces", desc: "/v1/organizations/workspaces" },
  usage_by_model: {
    label: "Usage by Model",
    desc: "/v1/organizations/usage_report/messages (group_by: model)",
  },
  usage_by_key: {
    label: "Usage by API Key",
    desc: "/v1/organizations/usage_report/messages (group_by: model, api_key_id)",
  },
  usage_by_workspace: {
    label: "Usage by Workspace",
    desc: "/v1/organizations/usage_report/messages (group_by: workspace_id, model)",
  },
};

interface RawDataViewerProps {
  data: RawAPIData | null;
  openKey: string | null;
  onToggle: (key: string | null) => void;
}

function RawDataViewer({ data, openKey, onToggle }: RawDataViewerProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!data)
    return (
      <p className="text-sm text-bone-subtle text-center py-12">
        No raw data captured. Run an analysis first.
      </p>
    );

  const copyToClipboard = async (key: string, jsonStr: string) => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const downloadAll = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tokenpilot-raw-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadOne = (key: string) => {
    const blob = new Blob(
      [JSON.stringify(data[key as keyof RawAPIData], null, 2)],
      {
        type: "application/json",
      }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tokenpilot-${key}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entries = Object.entries(data);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-bone-subtle">
          {entries.length} API responses captured
        </p>
        <button
          onClick={downloadAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-border bg-ink-elevated text-xs font-medium text-bone-muted hover:border-bone-subtle hover:text-bone transition-colors cursor-pointer"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3"
            />
          </svg>
          Download All JSON
        </button>
      </div>
      {entries.map(([key, val]) => {
        const meta = RAW_LABELS[key] || {
          label: key,
          desc: val.endpoint || key,
        };
        const isOpen = openKey === key;
        const hasError = !!val.error;
        const recordCount = val.response?.data?.length;
        const jsonStr = JSON.stringify(
          val.response || val.error || val,
          null,
          2
        );
        const lineCount = jsonStr.split("\n").length;

        return (
          <div
            key={key}
            className={`rounded-xl border ${hasError ? "border-critical/20 bg-ink-elevated/40" : "border-ink-border bg-ink-elevated/30"}`}
          >
            <button
              onClick={() => onToggle(isOpen ? null : key)}
              className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-ink-hover rounded-xl cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-bone">
                    {meta.label}
                  </span>
                  {hasError && (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset bg-critical/10 text-critical ring-critical/20">
                      Error
                    </span>
                  )}
                  {!hasError && recordCount != null && (
                    <span className="text-[10px] font-mono text-bone-subtle">
                      {recordCount} records
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-bone-subtle font-mono mt-0.5">
                  {meta.desc}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-bone-subtle">
                  {lineCount} lines
                </span>
                {val.fetched_at && (
                  <span className="text-[10px] text-bone-subtle/50 hidden sm:block">
                    {new Date(val.fetched_at).toLocaleTimeString()}
                  </span>
                )}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadOne(key);
                  }}
                  className="p-1 rounded hover:bg-ink-hover text-bone-subtle hover:text-bone transition-colors cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      downloadOne(key);
                    }
                  }}
                  title="Download"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3"
                    />
                  </svg>
                </div>
                <svg
                  className={`w-4 h-4 text-bone-subtle shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </button>
            {isOpen && (
              <div className="px-5 pb-4 border-t border-ink-border">
                <div className="relative mt-3">
                  <button
                    onClick={() => copyToClipboard(key, jsonStr)}
                    className="absolute top-6 right-5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-ink-border bg-ink-elevated text-xs font-medium text-bone-muted hover:border-bone-subtle hover:text-bone transition-colors cursor-pointer z-10"
                    title="Copy to clipboard"
                  >
                    {copiedKey === key ? (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                  <pre className="p-4 rounded-lg bg-ink border border-ink-border text-[11px] font-mono text-bone-muted overflow-x-auto overflow-y-auto max-h-[500px] leading-relaxed whitespace-pre">
                    {jsonStr}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default RawDataViewer;
