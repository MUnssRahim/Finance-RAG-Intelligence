"use client";

import { useState, useRef, useEffect, useCallback, type ChangeEvent, type ReactNode } from "react";
import {
  Database, FileText, Send, Plus, Loader2, CheckCircle2,
  Activity, BarChart3, Clock, DollarSign, ShieldCheck,
  Cpu, RefreshCw, Lock, User, AlertCircle, Landmark,
  ScrollText, UploadCloud, TrendingUp,
} from "lucide-react";

type Message = {
  role: "user" | "ai";
  content: string;
  route?: string;
  sqlEvidence?: { code?: string; error?: string };
  docEvidence?: unknown[];
};

type Dataset = { dataset_id: string; filename: string; row_count: number; quality_score: number };
type Telemetry = { request_id: string; query: string; route: string; latency: number; total_cost: number };
type EvaluationMetrics = { precision: string; recall: string; hallucination_rate: string };

export default function FinSightDashboard() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [evalMetrics, setEvalMetrics] = useState<EvaluationMetrics>({ precision: "100%", recall: "100%", hallucination_rate: "0.00%" });

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [activeUserTab, setActiveUserTab] = useState("chat");
  const [activeAdminTab, setActiveAdminTab] = useState("telemetry");

  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1")
    .replace(/\/$/, "")
    .replace(/\/api$/, "/api/v1");

  const requestJson = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`API request failed (${response.status})`);
    }
    return response.json();
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  const fetchWorkspaceData = useCallback(async (wsId: string) => {
    try {
      const [dsRes, telRes, evalRes] = await Promise.all([
        requestJson(`${API_BASE}/workspaces/${wsId}/datasets`),
        requestJson(`${API_BASE}/workspaces/${wsId}/telemetry`),
        requestJson(`${API_BASE}/workspaces/${wsId}/evaluations`),
      ]);
      setDatasets(dsRes.datasets || []);
      setTelemetry(telRes.logs || []);
      setEvalMetrics(evalRes);
    } catch (err) { console.error("Data fetch error", err); }
  }, [API_BASE]);

  useEffect(() => { if (workspaceId) fetchWorkspaceData(workspaceId); }, [workspaceId, fetchWorkspaceData]);

  const createWorkspace = async () => {
    setIsInitializing(true);
    try {
      const data = await requestJson(`${API_BASE}/workspaces`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Financial Review", industry: "Finance", currency: "USD", reporting_period: "2026" }),
      });
      setWorkspaceId(data.workspace_id);
      setMessages([{ role: "ai", content: "Workspace initialized. Upload your CSV ledgers or text memos to begin." }]);
      fetchWorkspaceData(data.workspace_id);
    } catch (error) { console.error(error); }
    finally { setIsInitializing(false); }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !workspaceId) return;
    setIsUploading(true);
    const formData = new FormData();
    Array.from(e.target.files).forEach((file) => formData.append("files", file));

    try {
      await requestJson(`${API_BASE}/workspaces/${workspaceId}/upload`, { method: "POST", body: formData });
      setMessages((prev) => [...prev, { role: "ai", content: "Files queued for background ingestion and data profiling." }]);

      let pollCount = 0;
      const interval = setInterval(() => {
        fetchWorkspaceData(workspaceId).catch((error) => console.error("Workspace refresh error", error));
        pollCount++;
        if (pollCount >= 4) clearInterval(interval);
      }, 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !workspaceId) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsTyping(true);
    try {
      const data = await requestJson(`${API_BASE}/workspaces/${workspaceId}/query`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg }),
      });
      setMessages((prev) => [...prev, {
        role: "ai", content: data.answer, route: data.route, sqlEvidence: data.sql_evidence, docEvidence: data.document_evidence,
      }]);
      fetchWorkspaceData(workspaceId);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "ai", content: "System communication error." }]);
    } finally { setIsTyping(false); }
  };

  const avgQuality = datasets.length ? (datasets.reduce((acc, d) => acc + Number(d.quality_score), 0) / datasets.length).toFixed(1) : "100.0";
  const totalRows = datasets.reduce((acc, d) => acc + (d.row_count || 0), 0);
  const totalCost = telemetry.reduce((acc, l) => acc + Number(l.total_cost || 0), 0).toFixed(5);
  const avgLatency = telemetry.length ? (telemetry.reduce((acc, l) => acc + Number(l.latency || 0), 0) / telemetry.length).toFixed(2) : "0.00";

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "var(--void)", color: "var(--paper)", fontFamily: "var(--font-ui)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        :root {
          --void: #05070d;
          --ink: #0c1120;
          --panel: #0f1526;
          --royal: #2f4bff;
          --royal-deep: #14205c;
          --royal-glow: rgba(47, 75, 255, 0.35);
          --paper: #f7f7f4;
          --paper-dim: #d8dae4;
          --mist: #7b83a1;
          --line: rgba(247, 247, 244, 0.09);
          --font-display: 'Fraunces', serif;
          --font-ui: 'Inter', -apple-system, sans-serif;
          --font-mono: 'JetBrains Mono', monospace;
        }
        .fs-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .fs-scroll::-webkit-scrollbar-thumb { background: rgba(247,247,244,0.12); border-radius: 4px; }
        .fs-scroll::-webkit-scrollbar-track { background: transparent; }
        .fs-focus:focus-visible { outline: 2px solid var(--royal); outline-offset: 2px; }
        @keyframes fs-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .fs-rise { animation: fs-rise 0.35s ease both; }
      `}</style>

      {/* ============ SIDEBAR ============ */}
      <aside className="w-[280px] shrink-0 flex flex-col justify-between" style={{ background: "var(--ink)", borderRight: "1px solid var(--line)" }}>
        <div>
          <div className="px-6 pt-7 pb-6" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md flex items-center justify-center shrink-0" style={{ background: "var(--royal-deep)", border: "1px solid var(--royal-glow)" }}>
                <Landmark size={18} color="#8fa0ff" />
              </div>
              <div>
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 500, letterSpacing: "-0.01em", color: "var(--paper)" }}>FinSight</h1>
                <p style={{ fontSize: "11px", color: "var(--mist)", marginTop: "1px" }}>Enterprise Intelligence</p>
              </div>
            </div>
          </div>

          <div className="px-5 pt-5 space-y-4">
            {!workspaceId ? (
              <button
                onClick={createWorkspace}
                disabled={isInitializing}
                className="fs-focus w-full flex items-center justify-center gap-2 py-3 rounded-md text-[13px] font-medium transition-colors disabled:opacity-60"
                style={{ background: "var(--royal)", color: "#fff" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#3f5aff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--royal)"; }}
              >
                {isInitializing ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {isInitializing ? "Setting up" : "Initialize workspace"}
              </button>
            ) : (
              <label
                className="fs-focus w-full flex flex-col items-center justify-center gap-1.5 rounded-md py-4 cursor-pointer transition-colors"
                style={{ border: "1px dashed var(--line)", background: "rgba(255,255,255,0.02)" }}
              >
                {isUploading ? <Loader2 size={17} className="animate-spin" color="#8fa0ff" /> : <UploadCloud size={17} color="#8fa0ff" />}
                <span style={{ fontSize: "12px", color: "var(--paper-dim)" }}>{isUploading ? "Uploading data…" : "Upload financial files"}</span>
                <span style={{ fontSize: "10px", color: "var(--mist)" }}>CSV, TXT, PDF</span>
                <input type="file" multiple accept=".csv,.xlsx,.txt,.pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              </label>
            )}

            <nav className="pt-3 space-y-0.5">
              {!isAdminMode ? (
                <>
                  <SidebarButton active={activeUserTab === "chat"} onClick={() => setActiveUserTab("chat")} icon={<ScrollText size={15} />} label="Investigation terminal" />
                  <SidebarButton active={activeUserTab === "files"} onClick={() => setActiveUserTab("files")} icon={<BarChart3 size={15} />} label="Data health &amp; files" />
                </>
              ) : (
                <>
                  <SidebarButton active={activeAdminTab === "telemetry"} onClick={() => setActiveAdminTab("telemetry")} icon={<Activity size={15} />} label="Request telemetry" accent="royal" />
                  <SidebarButton active={activeAdminTab === "evaluations"} onClick={() => setActiveAdminTab("evaluations")} icon={<ShieldCheck size={15} />} label="Evaluation metrics" accent="royal" />
                </>
              )}
            </nav>
          </div>
        </div>

        <div className="px-5 pb-6 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          <button
            onClick={() => setIsAdminMode(!isAdminMode)}
            className="fs-focus w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-[12px] font-medium transition-colors"
            style={{
              background: isAdminMode ? "var(--royal-deep)" : "rgba(255,255,255,0.03)",
              color: isAdminMode ? "#a9b6ff" : "var(--paper-dim)",
              border: `1px solid ${isAdminMode ? "var(--royal-glow)" : "var(--line)"}`,
            }}
          >
            <span className="flex items-center gap-2">{isAdminMode ? <Lock size={13} /> : <User size={13} />} {isAdminMode ? "Admin mode" : "User mode"}</span>
            <RefreshCw size={11} style={{ opacity: 0.5 }} />
          </button>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <main className="flex-1 flex flex-col min-w-0" style={{ background: "var(--void)" }}>
        <div className="h-[72px] shrink-0 px-8 flex items-center" style={{ borderBottom: "1px solid var(--line)" }}>
          {!isAdminMode ? (
            <div className="flex items-center gap-10">
              <MetricInline icon={<CheckCircle2 size={15} />} tint="#5fe0a5" label="Data cleanliness" value={`${avgQuality}%`} />
              <MetricInline icon={<Database size={15} />} tint="#8fa0ff" label="Indexed ledger" value={`${totalRows.toLocaleString()} rows`} />
            </div>
          ) : (
            <div className="flex items-center gap-10">
              <MetricInline icon={<DollarSign size={15} />} tint="#c9a4ff" label="Total API cost" value={`$${totalCost}`} mono />
              <MetricInline icon={<Clock size={15} />} tint="#f2b979" label="Avg latency" value={`${avgLatency}s`} mono />
            </div>
          )}
        </div>

        {/* --- CHAT --- */}
        {!isAdminMode && activeUserTab === "chat" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto fs-scroll px-8 py-8 space-y-5">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
                  <div className="h-14 w-14 rounded-full flex items-center justify-center" style={{ background: "var(--royal-deep)", border: "1px solid var(--royal-glow)" }}>
                    <Cpu size={22} color="#8fa0ff" />
                  </div>
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: "20px", color: "var(--paper)" }}>Ask your ledger a question.</p>
                    <p style={{ fontSize: "13px", color: "var(--mist)", marginTop: "6px" }}>
                      {workspaceId ? "Try something like \u201cwhat drove the Q2 variance?\u201d" : "Initialize a workspace to begin."}
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div key={idx} className={`fs-rise flex gap-3 max-w-3xl ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
                  <div
                    className="h-7 w-7 rounded-md flex items-center justify-center text-[11px] shrink-0 mt-0.5"
                    style={msg.role === "ai" ? { background: "var(--royal-deep)", border: "1px solid var(--royal-glow)", color: "#8fa0ff" } : { background: "var(--royal)", color: "#fff" }}
                  >
                    {msg.role === "ai" ? <Database size={13} /> : "U"}
                  </div>
                  <div className="space-y-2 max-w-2xl">
                    <div
                      className="px-4 py-3 rounded-lg text-[13px] leading-relaxed"
                      style={msg.role === "ai"
                        ? { background: "var(--paper)", color: "#14172a" }
                        : { background: "var(--panel)", color: "var(--paper)", border: "1px solid var(--line)" }}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.role === "ai" && (
                      <div className="flex flex-wrap gap-2 items-center">
                        {(msg.docEvidence?.length ?? 0) > 0 && (
                          <Badge tone="royal" icon={<FileText size={10} />} label={`${msg.docEvidence?.length} documents analyzed`} />
                        )}
                        {msg.sqlEvidence?.error ? (
                          <Badge tone="rose" icon={<AlertCircle size={10} />} label="SQL agent halted" />
                        ) : msg.sqlEvidence?.code ? (
                          <Badge tone="mint" icon={<Database size={10} />} label="SQL data processed" />
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-2.5 pl-1">
                  <Loader2 size={13} className="animate-spin" color="#8fa0ff" />
                  <span style={{ fontSize: "12px", color: "var(--mist)" }}>Synthesizing intelligence…</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-8 py-6" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="max-w-3xl mx-auto relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={workspaceId ? "Ask a financial question…" : "Initialize a workspace first…"}
                  disabled={!workspaceId || isTyping}
                  className="fs-focus w-full pl-4 pr-12 py-3.5 rounded-lg text-[13px] disabled:opacity-50"
                  style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--paper)" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!workspaceId || isTyping || !input.trim()}
                  className="fs-focus absolute right-2 top-2 h-8 w-8 flex items-center justify-center rounded-md disabled:opacity-30"
                  style={{ background: "var(--royal)", color: "#fff" }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- FILES --- */}
        {!isAdminMode && activeUserTab === "files" && (
          <div className="flex-1 overflow-y-auto fs-scroll px-8 py-8">
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "19px", color: "var(--paper)", marginBottom: "20px" }}>Data health &amp; uploads</h2>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <table className="w-full text-left text-[12.5px]">
                <thead style={{ background: "rgba(255,255,255,0.02)", color: "var(--mist)" }}>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <th className="p-4 font-medium">Filename</th>
                    <th className="p-4 font-medium">Rows processed</th>
                    <th className="p-4 font-medium">Quality score</th>
                  </tr>
                </thead>
                <tbody style={{ color: "var(--paper-dim)" }}>
                  {datasets.map((ds, i) => (
                    <tr key={ds.dataset_id} style={{ borderBottom: i < datasets.length - 1 ? "1px solid var(--line)" : "none" }}>
                      <td className="p-4 flex items-center gap-2"><FileText size={13} color="#8fa0ff" />{ds.filename}</td>
                      <td className="p-4" style={{ fontFamily: "var(--font-mono)" }}>{ds.row_count}</td>
                      <td className="p-4" style={{ fontFamily: "var(--font-mono)", color: "#5fe0a5" }}>{Number(ds.quality_score).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {datasets.length === 0 && (
                    <tr><td colSpan={3} className="p-10 text-center" style={{ color: "var(--mist)" }}>No files ingested yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TELEMETRY --- */}
        {isAdminMode && activeAdminTab === "telemetry" && (
          <div className="flex-1 overflow-y-auto fs-scroll px-8 py-8">
            <h2 className="flex items-center gap-2" style={{ fontFamily: "var(--font-display)", fontSize: "19px", color: "#a9b6ff", marginBottom: "20px" }}>
              <ShieldCheck size={17} /> System telemetry logs
            </h2>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <table className="w-full text-left text-[12.5px]">
                <thead style={{ background: "rgba(255,255,255,0.02)", color: "var(--mist)" }}>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <th className="p-4 font-medium">Query</th>
                    <th className="p-4 font-medium">Route</th>
                    <th className="p-4 font-medium">Latency</th>
                    <th className="p-4 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody style={{ color: "var(--paper-dim)" }}>
                  {telemetry.map((log, i) => (
                    <tr key={log.request_id} style={{ borderBottom: i < telemetry.length - 1 ? "1px solid var(--line)" : "none" }}>
                      <td className="p-4 max-w-xs truncate" title={log.query}>{log.query}</td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)", color: "var(--paper-dim)" }}>{log.route}</span>
                      </td>
                      <td className="p-4" style={{ fontFamily: "var(--font-mono)" }}>{Number(log.latency).toFixed(2)}s</td>
                      <td className="p-4" style={{ fontFamily: "var(--font-mono)", color: "#5fe0a5" }}>${Number(log.total_cost).toFixed(5)}</td>
                    </tr>
                  ))}
                  {telemetry.length === 0 && (
                    <tr><td colSpan={4} className="p-10 text-center" style={{ color: "var(--mist)" }}>No query telemetry available.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- EVALUATIONS --- */}
        {isAdminMode && activeAdminTab === "evaluations" && (
          <div className="flex-1 overflow-y-auto fs-scroll px-8 py-8">
            <h2 className="flex items-center gap-2" style={{ fontFamily: "var(--font-display)", fontSize: "19px", color: "#a9b6ff", marginBottom: "20px" }}>
              <Activity size={17} /> Live AI evaluation metrics
            </h2>
            <div className="grid grid-cols-3 gap-5">
              <EvalCard icon={<TrendingUp size={16} />} label="Routing precision" value={evalMetrics.precision} tint="#5fe0a5" />
              <EvalCard icon={<Database size={16} />} label="RAG recall rate" value={evalMetrics.recall} tint="#8fa0ff" />
              <EvalCard icon={<AlertCircle size={16} />} label="Hallucination rate" value={evalMetrics.hallucination_rate} tint="#f2b979" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SidebarButton({ active, onClick, icon, label, accent }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; accent?: string }) {
  return (
    <button
      onClick={onClick}
      className="fs-focus w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors"
      style={{
        background: active ? (accent === "royal" ? "var(--royal-deep)" : "rgba(47,75,255,0.10)") : "transparent",
        color: active ? "#a9b6ff" : "var(--mist)",
      }}
    >
      {icon} {label}
    </button>
  );
}

function MetricInline({ icon, tint, label, value, mono }: { icon: ReactNode; tint: string; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-md flex items-center justify-center" style={{ background: `${tint}1a`, color: tint }}>{icon}</div>
      <div>
        <p style={{ fontSize: "10px", color: "var(--mist)", fontWeight: 500 }}>{label}</p>
        <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--paper)", fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)" }}>{value}</p>
      </div>
    </div>
  );
}

function Badge({ tone, icon, label }: { tone: "royal" | "rose" | "mint"; icon: ReactNode; label: string }) {
  const tones = {
    royal: { bg: "rgba(47,75,255,0.10)", border: "rgba(47,75,255,0.30)", color: "#8fa0ff" },
    rose: { bg: "rgba(255,90,110,0.10)", border: "rgba(255,90,110,0.30)", color: "#ff8a97" },
    mint: { bg: "rgba(95,224,165,0.10)", border: "rgba(95,224,165,0.30)", color: "#5fe0a5" },
  }[tone];
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1" style={{ background: tones.bg, border: `1px solid ${tones.border}`, color: tones.color }}>
      {icon} {label}
    </span>
  );
}

function EvalCard({ icon, label, value, tint }: { icon: ReactNode; label: string; value: string; tint: string }) {
  return (
    <div className="p-6 rounded-lg" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div className="flex items-center gap-2 mb-3" style={{ color: tint }}>{icon}<p style={{ fontSize: "11.5px", color: "var(--mist)", fontWeight: 500 }}>{label}</p></div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: "30px", color: tint }}>{value}</p>
    </div>
  );
}
