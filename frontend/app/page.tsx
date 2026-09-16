"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type ReactNode,
} from "react";

import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  DollarSign,
  File,
  FileText,
  HardDrive,
  Landmark,
  Loader2,
  Lock,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  UploadCloud,
  User,
} from "lucide-react";

/* =========================================================
   TYPES
========================================================= */

type DocumentEvidenceItem = {
  [key: string]: unknown;
};

type Message = {
  role: "user" | "ai";
  content: string;
  route?: string;
  docEvidence?: DocumentEvidenceItem[];
  documentSession?: string;
};

type Dataset = {
  dataset_id: string;
  filename: string;
  row_count: number;
  quality_score: number;
};

type Telemetry = {
  request_id: string;
  query: string;
  route: string;
  latency: number;
  total_cost: number;
};

type EvaluationMetrics = {
  precision: string;
  recall: string;
  hallucination_rate: string;
};

/* =========================================================
   MAIN
========================================================= */

export default function FinSightDashboard() {
  const [workspaceId, setWorkspaceId] =
    useState<string | null>(null);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [input, setInput] = useState("");

  const [datasets, setDatasets] =
    useState<Dataset[]>([]);

  const [telemetry, setTelemetry] =
    useState<Telemetry[]>([]);

  const [evalMetrics, setEvalMetrics] =
    useState<EvaluationMetrics>({
      precision: "100%",
      recall: "100%",
      hallucination_rate: "0.00%",
    });

  const [isAdminMode, setIsAdminMode] =
    useState(false);

  const [activeUserTab, setActiveUserTab] =
    useState<"chat" | "files">("chat");

  const [activeAdminTab, setActiveAdminTab] =
    useState<"telemetry" | "evaluations">(
      "telemetry"
    );

  const [isUploading, setIsUploading] =
    useState(false);

  const [isIngesting, setIsIngesting] =
    useState(false);

  const [isTyping, setIsTyping] =
    useState(false);

  const [isInitializing, setIsInitializing] =
    useState(false);

  const [expandedMessage, setExpandedMessage] =
    useState<number | null>(null);

  const [documentSession, setDocumentSession] =
    useState<string | null>(null);

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const API_BASE = (
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000/api/v1"
  )
    .replace(/\/$/, "")
    .replace(/\/api$/, "/api/v1");

  /* =========================================================
     API HELPER
  ========================================================= */

  const requestJson = async (
    url: string,
    options: RequestInit = {}
  ) => {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(
        `API request failed (${response.status})`
      );
    }

    return response.json();
  };

  /* =========================================================
     WORKSPACE DATA
  ========================================================= */

  const fetchWorkspaceData = useCallback(
    async (wsId: string) => {
      try {
        const [
          datasetsResponse,
          telemetryResponse,
          evaluationResponse,
        ] = await Promise.all([
          requestJson(
            `${API_BASE}/workspaces/${wsId}/datasets`
          ),
          requestJson(
            `${API_BASE}/workspaces/${wsId}/telemetry`
          ),
          requestJson(
            `${API_BASE}/workspaces/${wsId}/evaluations`
          ),
        ]);

        setDatasets(
          datasetsResponse.datasets || []
        );

        setTelemetry(
          telemetryResponse.logs || []
        );

        setEvalMetrics(
          evaluationResponse || {
            precision: "0%",
            recall: "0%",
            hallucination_rate: "0%",
          }
        );
      } catch (error) {
        console.error(
          "Workspace data error:",
          error
        );
      }
    },
    [API_BASE]
  );

  /* =========================================================
     EFFECTS
  ========================================================= */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    fetchWorkspaceData(workspaceId);
  }, [
    workspaceId,
    fetchWorkspaceData,
  ]);

  /* =========================================================
     CREATE WORKSPACE
  ========================================================= */

  const createWorkspace = async () => {
    setIsInitializing(true);

    try {
      const data = await requestJson(
        `${API_BASE}/workspaces`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: "Financial Review",
            industry: "Finance",
            currency: "USD",
            reporting_period: "2026",
          }),
        }
      );

      const newWorkspaceId =
        data.workspace_id;

      setWorkspaceId(
        newWorkspaceId
      );

      setDocumentSession(
        "Workspace session"
      );

      setMessages([
        {
          role: "ai",
          content:
            "Workspace initialized. Upload financial datasets or documents to begin your investigation.",
          documentSession:
            "Workspace session",
        },
      ]);

      await fetchWorkspaceData(
        newWorkspaceId
      );
    } catch (error) {
      console.error(
        "Workspace initialization error:",
        error
      );

      setMessages([
        {
          role: "ai",
          content:
            "Workspace initialization failed. Please check the backend connection.",
        },
      ]);
    } finally {
      setIsInitializing(false);
    }
  };

  /* =========================================================
     FILE UPLOAD
  ========================================================= */

  const handleFileUpload = async (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    if (
      !e.target.files ||
      !workspaceId
    ) {
      return;
    }

    const files = Array.from(
      e.target.files
    );

    if (files.length === 0) {
      return;
    }

    const sessionName =
      `Document Session ${
        datasets.length + 1
      }`;

    setDocumentSession(
      sessionName
    );

    setIsUploading(true);

    const uploadedFilenames =
      files.map(
        (file) => file.name
      );

    const formData =
      new FormData();

    files.forEach((file) => {
      formData.append(
        "files",
        file
      );
    });

    try {
      await requestJson(
        `${API_BASE}/workspaces/${workspaceId}/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      setIsIngesting(true);

      setMessages((previous) => [
        ...previous,
        {
          role: "ai",
          content:
            "Files uploaded successfully. The financial data is now being indexed and prepared for analysis.",
          documentSession:
            sessionName,
        },
      ]);

      let pollCount = 0;

      const intervalId =
        window.setInterval(
          async () => {
            try {
              const [
                datasetResponse,
                documentResponse,
              ] = await Promise.all([
                requestJson(
                  `${API_BASE}/workspaces/${workspaceId}/datasets`
                ),
                requestJson(
                  `${API_BASE}/workspaces/${workspaceId}/documents`
                ),
              ]);

              const indexedFilenames = [
                ...(datasetResponse.datasets || []).map(
                  (file: Dataset) =>
                    file.filename
                ),

                ...(documentResponse.documents || []).map(
                  (file: {
                    filename: string;
                  }) =>
                    file.filename
                ),
              ];

              const finished =
                uploadedFilenames.every(
                  (filename) =>
                    indexedFilenames.includes(
                      filename
                    )
                );

              if (finished) {
                window.clearInterval(
                  intervalId
                );

                setIsIngesting(false);

                setMessages(
                  (previous) => [
                    ...previous,
                    {
                      role: "ai",
                      content:
                        "Indexing complete. Your files are ready for financial investigation.",
                      documentSession:
                        sessionName,
                    },
                  ]
                );

                await fetchWorkspaceData(
                  workspaceId
                );
              }
            } catch (error) {
              console.error(
                "Workspace refresh error:",
                error
              );
            }

            pollCount += 1;

            if (pollCount >= 30) {
              window.clearInterval(
                intervalId
              );

              setIsIngesting(false);

              setMessages(
                (previous) => [
                  ...previous,
                  {
                    role: "ai",
                    content:
                      "Indexing timed out. Please inspect the backend ingestion logs before continuing.",
                    documentSession:
                      sessionName,
                  },
                ]
              );
            }
          },
          3000
        );
    } catch (error) {
      console.error(
        "Upload error:",
        error
      );

      setMessages((previous) => [
        ...previous,
        {
          role: "ai",
          content:
            "The file upload failed. Please verify the backend connection and try again.",
        },
      ]);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  /* =========================================================
     SEND QUERY
  ========================================================= */

  const handleSend = async () => {
    if (
      !input.trim() ||
      !workspaceId ||
      isTyping ||
      isIngesting
    ) {
      return;
    }

    const query =
      input.trim();

    const currentSession =
      documentSession ||
      "Current investigation";

    setInput("");

    setMessages((previous) => [
      ...previous,
      {
        role: "user",
        content: query,
        documentSession:
          currentSession,
      },
    ]);

    setIsTyping(true);

    try {
      const data =
        await requestJson(
          `${API_BASE}/workspaces/${workspaceId}/query`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              query,
            }),
          }
        );

      let answer =
        "No answer was returned by the backend.";

      if (
        typeof data.answer ===
        "string"
      ) {
        answer =
          data.answer;
      } else if (
        data.answer !==
        undefined &&
        data.answer !==
        null
      ) {
        answer =
          JSON.stringify(
            data.answer
          );
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "ai",
          content: answer,
          route:
            data.route,
          docEvidence:
            Array.isArray(
              data.document_evidence
            )
              ? data.document_evidence
              : undefined,
          documentSession:
            currentSession,
        },
      ]);

      await fetchWorkspaceData(
        workspaceId
      );
    } catch (error) {
      console.error(
        "Query error:",
        error
      );

      setMessages((previous) => [
        ...previous,
        {
          role: "ai",
          content:
            "System communication error. The backend did not return a valid response.",
          documentSession:
            currentSession,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  /* =========================================================
     DERIVED METRICS
  ========================================================= */

  const avgQuality =
    datasets.length > 0
      ? (
          datasets.reduce(
            (
              total,
              dataset
            ) =>
              total +
              Number(
                dataset.quality_score ||
                  0
              ),
            0
          ) /
          datasets.length
        ).toFixed(1)
      : "100.0";

  const totalRows =
    datasets.reduce(
      (
        total,
        dataset
      ) =>
        total +
        Number(
          dataset.row_count ||
            0
        ),
      0
    );

  const totalCost =
    telemetry
      .reduce(
        (
          total,
          log
        ) =>
          total +
          Number(
            log.total_cost ||
              0
          ),
        0
      )
      .toFixed(5);

  const avgLatency =
    telemetry.length > 0
      ? (
          telemetry.reduce(
            (
              total,
              log
            ) =>
              total +
              Number(
                log.latency ||
                  0
              ),
            0
          ) /
          telemetry.length
        ).toFixed(2)
      : "0.00";

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="fs-shell">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

        :root {
          /* MAIN COFFEE-WHITE CANVAS */
          --fs-paper-bg: #eee4d8;
          --fs-paper-bg-2: #e6d8c9;
          --fs-surface: #faf7f1;
          --fs-surface-2: #f4ede5;
          --fs-surface-3: #efe4d8;

          /* DARK SIDEBAR */
          --fs-dark: #170d0b;
          --fs-dark-2: #201311;
          --fs-dark-3: #2a1916;

          /* BLOOD RED */
          --fs-red: #8f2027;
          --fs-red-bright: #b52e35;
          --fs-red-soft: #d86568;
          --fs-red-dark: #461316;

          /* COFFEE */
          --fs-coffee: #6c4936;
          --fs-caramel: #b88a61;

          /* TEXT */
          --fs-text: #35231d;
          --fs-text-2: #5d483e;
          --fs-muted: #816e64;

          --fs-dark-text: #f6eee7;
          --fs-dark-muted: #a9958c;

          --fs-line: rgba(75,48,36,.12);

          --fs-success: #709572;
          --fs-danger: #b9565a;

          --fs-display:
            "Playfair Display",
            Georgia,
            serif;

          --fs-ui:
            "DM Sans",
            -apple-system,
            BlinkMacSystemFont,
            sans-serif;

          --fs-mono:
            "JetBrains Mono",
            monospace;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
        }

        body {
          font-family:
            var(--fs-ui);

          background:
            var(--fs-paper-bg);

          color:
            var(--fs-text);
        }

        button,
        input,
        textarea {
          font-family:
            inherit;
        }

        .fs-shell {
          width: 100%;
          height: 100vh;
          overflow: hidden;

          display: flex;

          background:
            radial-gradient(
              circle at 70% -10%,
              rgba(255,255,255,.72),
              transparent 32%
            ),
            linear-gradient(
              135deg,
              #eee5da 0%,
              #e5d7c8 100%
            );
        }

        /*
          Important:
          The main application area is coffee-white.
          The dark color is restricted primarily to the
          navigation/system surfaces.
        */

        .fs-main-canvas {
          background:
            var(--fs-paper-bg);
        }

        .fs-focus:focus-visible {
          outline:
            2px solid
            var(--fs-red-bright);

          outline-offset:
            2px;
        }

        .fs-scroll::-webkit-scrollbar {
          width: 7px;
          height: 7px;
        }

        .fs-scroll::-webkit-scrollbar-thumb {
          background:
            rgba(75,48,36,.20);

          border-radius:
            999px;
        }

        .fs-scroll::-webkit-scrollbar-track {
          background:
            transparent;
        }

        .fs-message {
          animation:
            fs-rise .35s ease both;
        }

        .fs-doc-rail {
          position:
            absolute;

          left:
            14px;

          top:
            0;

          bottom:
            0;

          width:
            1px;

          background:
            linear-gradient(
              to bottom,
              rgba(143,32,39,0),
              rgba(143,32,39,.21) 5%,
              rgba(143,32,39,.21) 95%,
              rgba(143,32,39,0)
            );
        }

        .fs-doc-dot {
          position:
            absolute;

          left:
            9px;

          top:
            20px;

          width:
            11px;

          height:
            11px;

          border-radius:
            999px;

          background:
            var(--fs-red);

          border:
            3px solid
            var(--fs-paper-bg);

          box-shadow:
            0 0 0 1px
            rgba(143,32,39,.22);
        }

        .fs-doc-label {
          position:
            absolute;

          left:
            0;

          top:
            -7px;

          transform:
            translateY(-100%);

          white-space:
            nowrap;

          padding:
            4px 8px;

          border-radius:
            999px;

          background:
            rgba(238,228,216,.96);

          border:
            1px solid
            rgba(143,32,39,.16);

          color:
            var(--fs-red);

          font-size:
            8.5px;

          font-weight:
            700;

          letter-spacing:
            .12em;

          text-transform:
            uppercase;
        }

        .fs-typing {
          animation:
            fs-pulse 1.4s
            ease-in-out
            infinite;
        }

        @keyframes fs-rise {
          from {
            opacity: 0;
            transform:
              translateY(7px);
          }

          to {
            opacity: 1;
            transform:
              translateY(0);
          }
        }

        @keyframes fs-pulse {
          0%, 100% {
            opacity:
              .35;
          }

          50% {
            opacity:
              1;
          }
        }

        @media (max-width: 1050px) {
          .fs-sidebar {
            width:
              235px !important;
          }

          .fs-main-pad {
            padding-left:
              24px !important;

            padding-right:
              24px !important;
          }
        }

        @media (max-width: 820px) {
          .fs-sidebar {
            display:
              none;
          }

          .fs-topbar-name {
            display:
              none;
          }

          .fs-grid-3 {
            grid-template-columns:
              1fr !important;
          }
        }
      `}</style>

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className="fs-sidebar"
        style={{
          width:
            285,

          flexShrink:
            0,

          display:
            "flex",

          flexDirection:
            "column",

          justifyContent:
            "space-between",

          background:
            "linear-gradient(180deg,#1a0d0c 0%,#120908 100%)",

          borderRight:
            "1px solid rgba(255,255,255,.06)",
        }}
      >

        <div>

          {/* BRAND */}

          <div
            style={{
              padding:
                "26px 22px 23px",

              borderBottom:
                "1px solid rgba(255,255,255,.07)",
            }}
          >

            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                gap:
                  13,
              }}
            >

              <div
                style={{
                  width:
                    43,

                  height:
                    43,

                  borderRadius:
                    11,

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  background:
                    "linear-gradient(145deg,#4b1115,#22090a)",

                  border:
                    "1px solid rgba(208,82,87,.35)",

                  boxShadow:
                    "0 12px 30px rgba(0,0,0,.25)",
                }}
              >

                <Landmark
                  size={19}
                  color={
                    "var(--fs-red-soft)"
                  }
                />

              </div>

              <div>

                <div
                  style={{
                    fontFamily:
                      "var(--fs-display)",

                    fontSize:
                      20,

                    color:
                      "var(--fs-dark-text)",

                    letterSpacing:
                      "-.02em",
                  }}
                >
                  FinSight
                </div>

                <div
                  style={{
                    marginTop:
                      1,

                    color:
                      "var(--fs-dark-muted)",

                    fontSize:
                      9.5,

                    textTransform:
                      "uppercase",

                    letterSpacing:
                      ".12em",
                  }}
                >
                  Enterprise Intelligence
                </div>

              </div>

            </div>

          </div>

          {/* WORKSPACE */}

          <div
            style={{
              padding:
                "20px 17px",
            }}
          >

            {!workspaceId ? (

              <button
                onClick={
                  createWorkspace
                }
                disabled={
                  isInitializing
                }
                className="fs-focus"
                style={{
                  width:
                    "100%",

                  border:
                    "none",

                  borderRadius:
                    10,

                  padding:
                    "13px 14px",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  gap:
                    8,

                  color:
                    "#fff",

                  fontSize:
                    12,

                  fontWeight:
                    600,

                  cursor:
                    isInitializing
                      ? "default"
                      : "pointer",

                  background:
                    "linear-gradient(135deg,#a1282f,#77181e)",

                  boxShadow:
                    "0 10px 30px rgba(142,31,37,.22)",

                  opacity:
                    isInitializing
                      ? .65
                      : 1,
                }}
              >

                {isInitializing ? (
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <Plus
                    size={15}
                  />
                )}

                {isInitializing
                  ? "Initializing..."
                  : "Initialize workspace"}

              </button>

            ) : (

              <>

                <div
                  style={{
                    marginBottom:
                      18,

                    padding:
                      12,

                    borderRadius:
                      10,

                    background:
                      "rgba(255,255,255,.025)",

                    border:
                      "1px solid rgba(255,255,255,.07)",
                  }}
                >

                  <div
                    style={{
                      display:
                        "flex",

                      alignItems:
                        "center",

                      justifyContent:
                        "space-between",

                      marginBottom:
                        8,
                    }}
                  >

                    <span
                      style={{
                        color:
                          "var(--fs-dark-muted)",

                        fontSize:
                          9.5,

                        textTransform:
                          "uppercase",

                        letterSpacing:
                          ".10em",
                      }}
                    >
                      Active workspace
                    </span>

                    <span
                      style={{
                        width:
                          7,

                        height:
                          7,

                        borderRadius:
                          "50%",

                        background:
                          "var(--fs-success)",

                        boxShadow:
                          "0 0 8px rgba(112,149,114,.7)",
                      }}
                    />

                  </div>

                  <div
                    style={{
                      color:
                        "var(--fs-dark-text)",

                      fontSize:
                        13,

                      fontWeight:
                        600,
                    }}
                  >
                    Financial Review
                  </div>

                  <div
                    style={{
                      marginTop:
                        4,

                      color:
                        "var(--fs-dark-muted)",

                      fontFamily:
                        "var(--fs-mono)",

                      fontSize:
                        9,

                      overflow:
                        "hidden",

                      textOverflow:
                        "ellipsis",

                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    {workspaceId}
                  </div>

                </div>

                {/* UPLOAD */}

                <label
                  className="fs-focus"
                  style={{
                    minHeight:
                      105,

                    width:
                      "100%",

                    display:
                      "flex",

                    flexDirection:
                      "column",

                    alignItems:
                      "center",

                    justifyContent:
                      "center",

                    gap:
                      6,

                    cursor:
                      isUploading ||
                      isIngesting
                        ? "default"
                        : "pointer",

                    border:
                      "1px dashed rgba(181,46,53,.38)",

                    borderRadius:
                      10,

                    background:
                      "rgba(181,46,53,.045)",
                  }}
                >

                  {isUploading ||
                  isIngesting ? (
                    <Loader2
                      size={18}
                      color={
                        "var(--fs-red-soft)"
                      }
                      className="animate-spin"
                    />
                  ) : (
                    <UploadCloud
                      size={18}
                      color={
                        "var(--fs-red-soft)"
                      }
                    />
                  )}

                  <span
                    style={{
                      color:
                        "var(--fs-dark-text)",

                      fontSize:
                        11.5,

                      fontWeight:
                        500,
                    }}
                  >
                    {isUploading
                      ? "Uploading data..."
                      : isIngesting
                      ? "Indexing files..."
                      : "Upload financial files"}
                  </span>

                  <span
                    style={{
                      color:
                        "var(--fs-dark-muted)",

                      fontSize:
                        9.5,
                    }}
                  >
                    CSV · XLSX · TXT · PDF
                  </span>

                  <input
                    type="file"
                    multiple
                    accept=".csv,.xlsx,.txt,.pdf"
                    className="hidden"
                    onChange={
                      handleFileUpload
                    }
                    disabled={
                      isUploading ||
                      isIngesting
                    }
                  />

                </label>

              </>
            )}

            {/* NAVIGATION */}

            <div
              style={{
                marginTop:
                  26,
              }}
            >

              <div
                style={{
                  padding:
                    "0 11px 9px",

                  color:
                    "var(--fs-dark-muted)",

                  fontSize:
                    9.5,

                  fontWeight:
                    600,

                  textTransform:
                    "uppercase",

                  letterSpacing:
                    ".12em",
                }}
              >
                {isAdminMode
                  ? "Administration"
                  : "Workspace"}
              </div>

              {!isAdminMode ? (
                <>
                  <SidebarButton
                    active={
                      activeUserTab ===
                      "chat"
                    }
                    onClick={() =>
                      setActiveUserTab(
                        "chat"
                      )
                    }
                    icon={
                      <MessageSquareText
                        size={15}
                      />
                    }
                    label="Investigation"
                  />

                  <SidebarButton
                    active={
                      activeUserTab ===
                      "files"
                    }
                    onClick={() =>
                      setActiveUserTab(
                        "files"
                      )
                    }
                    icon={
                      <BarChart3
                        size={15}
                      />
                    }
                    label="Data health"
                  />
                </>
              ) : (
                <>
                  <SidebarButton
                    active={
                      activeAdminTab ===
                      "telemetry"
                    }
                    onClick={() =>
                      setActiveAdminTab(
                        "telemetry"
                      )
                    }
                    icon={
                      <Activity
                        size={15}
                      />
                    }
                    label="Request telemetry"
                    accent="brand"
                  />

                  <SidebarButton
                    active={
                      activeAdminTab ===
                      "evaluations"
                    }
                    onClick={() =>
                      setActiveAdminTab(
                        "evaluations"
                      )
                    }
                    icon={
                      <ShieldCheck
                        size={15}
                      />
                    }
                    label="AI evaluations"
                    accent="brand"
                  />
                </>
              )}

            </div>

          </div>

        </div>

        {/* FOOTER */}

        <div
          style={{
            padding:
              "17px 17px 18px",

            borderTop:
              "1px solid rgba(255,255,255,.07)",
          }}
        >

          {workspaceId && (

            <div
              style={{
                marginBottom:
                  18,
              }}
            >

              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "space-between",

                  marginBottom:
                    7,
                }}
              >

                <div
                  style={{
                    display:
                      "flex",

                    alignItems:
                      "center",

                    gap:
                      6,

                    color:
                      "var(--fs-dark-muted)",

                    fontSize:
                      10.5,
                  }}
                >
                  <HardDrive
                    size={11}
                  />

                  Workspace capacity
                </div>

                <span
                  style={{
                    color:
                      "var(--fs-dark-text)",

                    fontFamily:
                      "var(--fs-mono)",

                    fontSize:
                      9.5,
                  }}
                >
                  {datasets.length}/10
                </span>

              </div>

              <div
                style={{
                  height:
                    5,

                  borderRadius:
                    999,

                  overflow:
                    "hidden",

                  background:
                    "rgba(255,255,255,.06)",
                }}
              >

                <div
                  style={{
                    width:
                      `${Math.min(
                        datasets.length * 10,
                        100
                      )}%`,

                    height:
                      "100%",

                    background:
                      "linear-gradient(90deg,#78181e,#c85b60)",

                    transition:
                      "width .5s ease",
                  }}
                />

              </div>

            </div>

          )}

          <button
            onClick={() =>
              setIsAdminMode(
                !isAdminMode
              )
            }
            className="fs-focus"
            style={{
              width:
                "100%",

              borderRadius:
                9,

              border:
                `1px solid ${
                  isAdminMode
                    ? "rgba(181,46,53,.35)"
                    : "rgba(255,255,255,.07)"
                }`,

              background:
                isAdminMode
                  ? "rgba(142,31,37,.13)"
                  : "rgba(255,255,255,.025)",

              color:
                isAdminMode
                  ? "var(--fs-red-soft)"
                  : "var(--fs-dark-text)",

              padding:
                "10px 11px",

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "space-between",

              cursor:
                "pointer",

              fontSize:
                11.5,

              fontWeight:
                600,
            }}
          >

            <span
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                gap:
                  8,
              }}
            >

              {isAdminMode ? (
                <Lock size={13} />
              ) : (
                <User size={13} />
              )}

              {isAdminMode
                ? "Admin mode"
                : "User mode"}

            </span>

            <RefreshCw
              size={11}
              style={{
                opacity:
                  .45,
              }}
            />

          </button>

        </div>

      </aside>

      {/* =====================================================
          MAIN COFFEE-WHITE CANVAS
      ===================================================== */}

      <main
        className="fs-main-canvas"
        style={{
          flex:
            1,

          minWidth:
            0,

          display:
            "flex",

          flexDirection:
            "column",

          background:
            "var(--fs-paper-bg)",
        }}
      >

        {/* ===================================================
            TOPBAR
        =================================================== */}

        <header
          style={{
            minHeight:
              78,

            flexShrink:
              0,

            padding:
              "0 34px",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            borderBottom:
              "1px solid var(--fs-line)",

            background:
              "rgba(250,247,241,.55)",

            backdropFilter:
              "blur(12px)",
          }}
        >

          <div
            className="fs-topbar-name"
            style={{
              display:
                "flex",

              alignItems:
                "center",

              gap:
                12,
            }}
          >

            <div
              style={{
                width:
                  32,

                height:
                  32,

                borderRadius:
                  9,

                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "center",

                color:
                  "var(--fs-red)",

                background:
                  "rgba(143,32,39,.07)",

                border:
                  "1px solid rgba(143,32,39,.12)",
              }}
            >

              {isAdminMode ? (
                <ShieldCheck
                  size={15}
                />
              ) : (
                <Search
                  size={15}
                />
              )}

            </div>

            <div>

              <div
                style={{
                  fontFamily:
                    "var(--fs-display)",

                  fontSize:
                    19,

                  color:
                    "var(--fs-text)",

                  letterSpacing:
                    "-.02em",
                }}
              >
                {isAdminMode
                  ? activeAdminTab ===
                    "telemetry"
                    ? "System telemetry"
                    : "AI evaluation"
                  : activeUserTab ===
                    "chat"
                  ? "Investigation terminal"
                  : "Data health & files"}
              </div>

              <div
                style={{
                  marginTop:
                    2,

                  color:
                    "var(--fs-muted)",

                  fontSize:
                    9.5,
                }}
              >
                {workspaceId
                  ? "Live workspace"
                  : "No active workspace"}
              </div>

            </div>

          </div>

          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              gap:
                30,
            }}
          >

            {!isAdminMode ? (
              <>
                <MetricLight
                  icon={
                    <CheckCircle2
                      size={15}
                    />
                  }
                  label="Data cleanliness"
                  value={`${avgQuality}%`}
                  tint={
                    "var(--fs-success)"
                  }
                />

                <MetricLight
                  icon={
                    <Database
                      size={15}
                    />
                  }
                  label="Indexed rows"
                  value={totalRows.toLocaleString()}
                  tint={
                    "var(--fs-red)"
                  }
                  mono
                />
              </>
            ) : (
              <>
                <MetricLight
                  icon={
                    <DollarSign
                      size={15}
                    />
                  }
                  label="API spend"
                  value={`$${totalCost}`}
                  tint={
                    "var(--fs-red)"
                  }
                  mono
                />

                <MetricLight
                  icon={
                    <Clock3
                      size={15}
                    />
                  }
                  label="Avg latency"
                  value={`${avgLatency}s`}
                  tint={
                    "var(--fs-caramel)"
                  }
                  mono
                />
              </>
            )}

          </div>

        </header>

        {/* ===================================================
            CHAT
        =================================================== */}

        {!isAdminMode &&
          activeUserTab ===
            "chat" && (

            <div
              style={{
                flex:
                  1,

                minHeight:
                  0,

                display:
                  "flex",

                flexDirection:
                  "column",

                background:
                  "var(--fs-paper-bg)",
              }}
            >

              <div
                className="fs-scroll fs-main-pad"
                style={{
                  flex:
                    1,

                  overflowY:
                    "auto",

                  padding:
                    "34px 8%",

                  background:
                    "var(--fs-paper-bg)",
                }}
              >

                {messages.length ===
                0 ? (

                  <EmptyInvestigation
                    workspaceId={
                      workspaceId
                    }
                  />

                ) : (

                  <div
                    style={{
                      maxWidth:
                        920,

                      margin:
                        "0 auto",

                      position:
                        "relative",

                      display:
                        "flex",

                      flexDirection:
                        "column",

                      gap:
                        25,

                      paddingLeft:
                        30,
                    }}
                  >

                    <div className="fs-doc-rail" />

                    {messages.map(
                      (
                        message,
                        index
                      ) => {

                        const newSession =
                          index ===
                            0 ||
                          message.documentSession !==
                            messages[
                              index - 1
                            ]
                              ?.documentSession;

                        return (
                          <div
                            key={
                              index
                            }
                            style={{
                              position:
                                "relative",
                            }}
                          >

                            {newSession &&
                              message.documentSession && (
                                <>
                                  <div className="fs-doc-dot" />

                                  <div className="fs-doc-label">
                                    {
                                      message.documentSession
                                    }
                                  </div>
                                </>
                              )}

                            <InvestigationMessage
                              message={
                                message
                              }
                              expanded={
                                expandedMessage ===
                                index
                              }
                              onToggle={() =>
                                setExpandedMessage(
                                  expandedMessage ===
                                    index
                                    ? null
                                    : index
                                )
                              }
                            />

                          </div>
                        );
                      }
                    )}

                    {isTyping && (

                      <div
                        style={{
                          display:
                            "flex",

                          alignItems:
                            "center",

                          gap:
                            10,

                          padding:
                            "2px 8px",

                          color:
                            "var(--fs-muted)",
                        }}
                      >

                        <div
                          style={{
                            width:
                              31,

                            height:
                              31,

                            borderRadius:
                              9,

                            display:
                              "flex",

                            alignItems:
                              "center",

                            justifyContent:
                              "center",

                            background:
                              "rgba(143,32,39,.07)",

                            border:
                              "1px solid rgba(143,32,39,.12)",
                          }}
                        >

                          <Sparkles
                            size={
                              14
                            }
                            color={
                              "var(--fs-red)"
                            }
                            className="fs-typing"
                          />

                        </div>

                        <span
                          style={{
                            fontSize:
                              11.5,
                          }}
                        >
                          Analyzing financial data...
                        </span>

                      </div>
                    )}

                    <div
                      ref={
                        messagesEndRef
                      }
                    />

                  </div>
                )}

              </div>

              {/* COMPOSER */}

              <div
                style={{
                  padding:
                    "18px 8% 23px",

                  borderTop:
                    "1px solid var(--fs-line)",

                  background:
                    "var(--fs-paper-bg-2)",
                }}
              >

                <div
                  style={{
                    maxWidth:
                      920,

                    margin:
                      "0 auto",
                  }}
                >

                  <div
                    style={{
                      position:
                        "relative",
                    }}
                  >

                    <textarea
                      rows={1}
                      value={
                        input
                      }
                      onChange={(
                        e
                      ) =>
                        setInput(
                          e.target.value
                        )
                      }
                      onKeyDown={(
                        e
                      ) => {
                        if (
                          e.key ===
                            "Enter" &&
                          !e.shiftKey
                        ) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      disabled={
                        !workspaceId ||
                        isTyping ||
                        isIngesting
                      }
                      className="fs-focus"
                      placeholder={
                        !workspaceId
                          ? "Initialize a workspace to begin..."
                          : isIngesting
                          ? "Waiting for file indexing..."
                          : "Ask about revenue, expenses, variance, trends..."
                      }
                      style={{
                        width:
                          "100%",

                        minHeight:
                          57,

                        maxHeight:
                          130,

                        resize:
                          "none",

                        borderRadius:
                          14,

                        border:
                          "1px solid rgba(86,61,49,.18)",

                        background:
                          "var(--fs-surface)",

                        color:
                          "var(--fs-text)",

                        padding:
                          "17px 62px 16px 17px",

                        fontSize:
                          12.5,

                        lineHeight:
                          1.5,

                        boxShadow:
                          "0 14px 35px rgba(75,47,35,.10)",
                      }}
                    />

                    <button
                      onClick={
                        handleSend
                      }
                      disabled={
                        !workspaceId ||
                        isTyping ||
                        isIngesting ||
                        !input.trim()
                      }
                      className="fs-focus"
                      style={{
                        position:
                          "absolute",

                        right:
                          9,

                        bottom:
                          9,

                        width:
                          38,

                        height:
                          38,

                        borderRadius:
                          10,

                        border:
                          "none",

                        display:
                          "flex",

                        alignItems:
                          "center",

                        justifyContent:
                          "center",

                        color:
                          "#fff",

                        background:
                          "linear-gradient(135deg,#a3282e,#78181d)",

                        cursor:
                          "pointer",

                        opacity:
                          !workspaceId ||
                          isTyping ||
                          isIngesting ||
                          !input.trim()
                            ? .28
                            : 1,
                      }}
                    >

                      <Send
                        size={
                          15
                        }
                      />

                    </button>

                  </div>

                  <div
                    style={{
                      marginTop:
                        8,

                      padding:
                        "0 3px",

                      display:
                        "flex",

                      justifyContent:
                        "space-between",

                      color:
                        "var(--fs-muted)",

                      fontSize:
                        9.5,
                    }}
                  >

                    <span>
                      Enter to investigate · Shift + Enter for a new line
                    </span>

                    <span
                      style={{
                        fontFamily:
                          "var(--fs-mono)",
                      }}
                    >
                      FIN.SIGHT
                    </span>

                  </div>

                </div>

              </div>

            </div>
          )}

        {/* ===================================================
            FILES
        =================================================== */}

        {!isAdminMode &&
          activeUserTab ===
            "files" && (

            <FilesView
              datasets={
                datasets
              }
              avgQuality={
                avgQuality
              }
              totalRows={
                totalRows
              }
            />
          )}

        {/* ===================================================
            TELEMETRY
        =================================================== */}

        {isAdminMode &&
          activeAdminTab ===
            "telemetry" && (

            <TelemetryView
              telemetry={
                telemetry
              }
              totalCost={
                totalCost
              }
              avgLatency={
                avgLatency
              }
            />
          )}

        {/* ===================================================
            EVALUATIONS
        =================================================== */}

        {isAdminMode &&
          activeAdminTab ===
            "evaluations" && (

            <EvaluationsView
              metrics={
                evalMetrics
              }
            />
          )}

      </main>
    </div>
  );
}

/* =========================================================
   INVESTIGATION MESSAGE
========================================================= */

function InvestigationMessage({
  message,
  expanded,
  onToggle,
}: {
  message: Message;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isUser =
    message.role ===
    "user";

  const hasDocuments =
    (message.docEvidence
      ?.length ?? 0) > 0;

  return (
    <div
      className="fs-message"
      style={{
        display:
          "flex",

        justifyContent:
          isUser
            ? "flex-end"
            : "flex-start",
      }}
    >

      <div
        style={{
          width:
            isUser
              ? "auto"
              : "100%",

          maxWidth:
            isUser
              ? 690
              : 900,
        }}
      >

        {/* MESSAGE LABEL */}

        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              isUser
                ? "flex-end"
                : "flex-start",

            gap:
              8,

            marginBottom:
              7,
          }}
        >

          <div
            style={{
              width:
                27,

              height:
                27,

              borderRadius:
                8,

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              background:
                isUser
                  ? "var(--fs-red)"
                  : "rgba(143,32,39,.08)",

              border:
                isUser
                  ? "none"
                  : "1px solid rgba(143,32,39,.13)",

              color:
                isUser
                  ? "#fff"
                  : "var(--fs-red)",
            }}
          >

            {isUser ? (
              <User
                size={13}
              />
            ) : (
              <Landmark
                size={13}
              />
            )}

          </div>

          <span
            style={{
              color:
                isUser
                  ? "var(--fs-muted)"
                  : "var(--fs-red)",

              fontSize:
                9.5,

              fontWeight:
                700,

              textTransform:
                "uppercase",

              letterSpacing:
                ".10em",
            }}
          >
            {isUser
              ? "You"
              : "FinSight"}
          </span>

        </div>

        {/* MESSAGE */}

        <div
          style={{
            borderRadius:
              isUser
                ? "14px 4px 14px 14px"
                : 14,

            padding:
              isUser
                ? "13px 16px"
                : "18px 20px",

            background:
              isUser
                ? "linear-gradient(135deg,#561419,#3c1012)"
                : "rgba(250,247,241,.96)",

            border:
              isUser
                ? "1px solid rgba(216,100,103,.16)"
                : "1px solid rgba(91,62,49,.11)",

            color:
              isUser
                ? "var(--fs-dark-text)"
                : "var(--fs-text)",

            boxShadow:
              "0 9px 30px rgba(79,49,37,.07)",
          }}
        >

          {isUser ? (

            <div
              style={{
                whiteSpace:
                  "pre-wrap",

                fontSize:
                  12.5,

                lineHeight:
                  1.7,
              }}
            >
              {
                message.content
              }
            </div>

          ) : (

            <RichFinancialResponse
              content={
                message.content
              }
            />

          )}

        </div>

        {/* AI METADATA */}

        {!isUser && (

          <>
            <div
              style={{
                display:
                  "flex",

                flexWrap:
                  "wrap",

                alignItems:
                  "center",

                gap:
                  7,

                marginTop:
                  9,
              }}
            >

              {message.route && (
                <EvidencePill
                  label={`Route: ${message.route}`}
                  icon={
                    <ArrowUpRight
                      size={10}
                    />
                  }
                  tone="red"
                />
              )}

              <EvidencePill
                label="Pandas data analysis"
                icon={
                  <Database
                    size={10}
                  />
                }
                tone="coffee"
              />

              {hasDocuments && (
                <EvidencePill
                  label={`${message.docEvidence?.length} document${
                    (message.docEvidence?.length ??
                      0) ===
                    1
                      ? ""
                      : "s"
                  } referenced`}
                  icon={
                    <FileText
                      size={10}
                    />
                  }
                  tone="coffee"
                />
              )}

              {hasDocuments && (
                <button
                  onClick={
                    onToggle
                  }
                  className="fs-focus"
                  style={{
                    padding:
                      "4px 8px",

                    borderRadius:
                      999,

                    border:
                      "1px solid rgba(86,61,49,.15)",

                    background:
                      "rgba(255,255,255,.32)",

                    color:
                      "var(--fs-muted)",

                    display:
                      "flex",

                    alignItems:
                      "center",

                    gap:
                      5,

                    fontSize:
                      9.5,

                    cursor:
                      "pointer",
                  }}
                >

                  {expanded
                    ? "Hide references"
                    : "View references"}

                  <ChevronDown
                    size={10}
                    style={{
                      transform:
                        expanded
                          ? "rotate(180deg)"
                          : "none",

                      transition:
                        "transform .2s",
                    }}
                  />

                </button>
              )}

            </div>

            {expanded &&
              hasDocuments && (

              <DocumentEvidencePanel
                documents={
                  message.docEvidence
                }
              />

            )}

          </>
        )}

      </div>

    </div>
  );
}

/* =========================================================
   RICH AI RESPONSE
========================================================= */

function RichFinancialResponse({
  content,
}: {
  content: string;
}) {
  const normalized =
    cleanBackendMarkdown(
      content
    );

  if (!normalized) {
    return (
      <p
        style={{
          margin:
            0,
        }}
      >
        No response content was returned.
      </p>
    );
  }

  const blocks =
    normalized.split(
      /\n{2,}/
    );

  return (
    <div
      style={{
        display:
          "flex",

        flexDirection:
          "column",

        gap:
          14,

        fontSize:
          12.5,

        lineHeight:
          1.75,
      }}
    >

      {blocks.map(
        (
          block,
          index
        ) => (
          <ResponseBlock
            key={
              index
            }
            block={
              block
            }
          />
        )
      )}

    </div>
  );
}

/* =========================================================
   RESPONSE BLOCK
========================================================= */

function ResponseBlock({
  block,
}: {
  block: string;
}) {
  const lines =
    block.split(
      "\n"
    );

  /* HEADING */

  if (
    lines.length ===
      1 &&
    /^#{1,6}\s+/.test(
      block
    )
  ) {
    const heading =
      block.replace(
        /^#{1,6}\s+/,
        ""
      );

    return (
      <div
        style={{
          fontFamily:
            "var(--fs-display)",

          fontSize:
            20,

          lineHeight:
            1.35,

          letterSpacing:
            "-.02em",

          color:
            "var(--fs-text)",
        }}
      >
        {renderInline(
          heading
        )}
      </div>
    );
  }

  /* TABLE */

  if (
    looksLikeTable(
      lines
    )
  ) {
    return (
      <ResponseTable
        lines={
          lines
        }
      />
    );
  }

  /* BULLET / NUMBERED LIST */

  if (
    lines.length > 0 &&
    lines.every(
      (line) =>
        /^\s*(?:[-•*]|\d+[.)])\s+/.test(
          line
        )
    )
  ) {
    return (
      <div
        style={{
          display:
            "flex",

          flexDirection:
            "column",

          gap:
            8,
        }}
      >

        {lines.map(
          (
            line,
            index
          ) => {

            const match =
              line.match(
                /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/
              );

            if (!match) {
              return null;
            }

            return (
              <div
                key={
                  index
                }
                style={{
                  display:
                    "flex",

                  alignItems:
                    "flex-start",

                  gap:
                    9,
                }}
              >

                <span
                  style={{
                    width:
                      6,

                    height:
                      6,

                    flexShrink:
                      0,

                    marginTop:
                      8,

                    borderRadius:
                      "50%",

                    background:
                      "var(--fs-red)",
                  }}
                />

                <div>
                  {renderInline(
                    match[1]
                  )}
                </div>

              </div>
            );
          }
        )}

      </div>
    );
  }

  /* QUOTE */

  if (
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.trim().startsWith(
          ">"
        )
    )
  ) {
    return (
      <div
        style={{
          padding:
            "12px 14px",

          borderLeft:
            "3px solid var(--fs-red)",

          background:
            "rgba(143,32,39,.045)",

          borderRadius:
            "0 8px 8px 0",

          color:
            "var(--fs-text-2)",
        }}
      >
        {renderInline(
          lines
            .map(
              (line) =>
                line.replace(
                  /^\s*>\s?/,
                  ""
                )
            )
            .join(" ")
        )}
      </div>
    );
  }

  /* NORMAL PARAGRAPH */

  return (
    <p
      style={{
        margin:
          0,
      }}
    >
      {renderInline(
        block
      )}
    </p>
  );
}

/* =========================================================
   INLINE MARKDOWN
========================================================= */

function renderInline(
  text: string
): ReactNode[] {
  const parts:
    ReactNode[] = [];

  const regex =
    /(\*\*.*?\*\*|__.*?__|\*.*?\*|_.*?_|`.*?`)/g;

  let lastIndex =
    0;

  const matches =
    Array.from(
      text.matchAll(
        regex
      )
    );

  matches.forEach(
    (
      match,
      index
    ) => {
      const start =
        match.index ?? 0;

      if (
        start >
        lastIndex
      ) {
        parts.push(
          <span
            key={
              `${index}-text`
            }
          >
            {text.slice(
              lastIndex,
              start
            )}
          </span>
        );
      }

      const token =
        match[0];

      if (
        token.startsWith(
          "**"
        ) ||
        token.startsWith(
          "__"
        )
      ) {
        parts.push(
          <strong
            key={
              `${index}-bold`
            }
            style={{
              fontWeight:
                700,

              color:
                "inherit",
            }}
          >
            {token.slice(
              2,
              -2
            )}
          </strong>
        );
      } else if (
        token.startsWith(
          "`"
        )
      ) {
        parts.push(
          <code
            key={
              `${index}-code`
            }
            style={{
              padding:
                "2px 5px",

              borderRadius:
                5,

              background:
                "rgba(109,73,53,.08)",

              color:
                "var(--fs-coffee)",

              fontFamily:
                "var(--fs-mono)",

              fontSize:
                "90%",
            }}
          >
            {token.slice(
              1,
              -1
            )}
          </code>
        );
      } else {
        parts.push(
          <em
            key={
              `${index}-italic`
            }
            style={{
              fontStyle:
                "italic",
            }}
          >
            {token.slice(
              1,
              -1
            )}
          </em>
        );
      }

      lastIndex =
        start +
        token.length;
    }
  );

  if (
    lastIndex <
    text.length
  ) {
    parts.push(
      <span
        key="final-text"
      >
        {text.slice(
          lastIndex
        )}
      </span>
    );
  }

  return parts;
}

/* =========================================================
   CLEAN MARKDOWN
========================================================= */

function cleanBackendMarkdown(
  text: string
) {
  return text
    .replace(
      /\r/g,
      ""
    )
    .replace(
      /^\s*---+\s*$/gm,
      ""
    )
    .trim();
}

/* =========================================================
   TABLE DETECTION
========================================================= */

function looksLikeTable(
  lines: string[]
) {
  if (
    lines.length <
    2
  ) {
    return false;
  }

  const firstLine =
    lines[0].trim();

  const secondLine =
    lines[1].trim();

  return (
    firstLine.includes(
      "|"
    ) &&
    /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(
      secondLine
    )
  );
}

/* =========================================================
   RESPONSE TABLE
========================================================= */

function ResponseTable({
  lines,
}: {
  lines: string[];
}) {
  const parseRow = (
    line: string
  ) =>
    line
      .trim()
      .replace(
        /^\|/,
        ""
      )
      .replace(
        /\|$/,
        ""
      )
      .split("|")
      .map(
        (cell) =>
          cell.trim()
      );

  const headers =
    parseRow(
      lines[0]
    );

  const rows =
    lines
      .slice(2)
      .map(
        parseRow
      );

  return (
    <div
      style={{
        width:
          "100%",

        overflowX:
          "auto",

        border:
          "1px solid rgba(75,48,36,.12)",

        borderRadius:
          10,

        background:
          "rgba(255,255,255,.42)",
      }}
    >

      <table
        style={{
          width:
            "100%",

          borderCollapse:
            "collapse",

          minWidth:
            430,
        }}
      >

        <thead>

          <tr
            style={{
              background:
                "rgba(143,32,39,.05)",
            }}
          >

            {headers.map(
              (
                header,
                index
              ) => (

                <th
                  key={
                    index
                  }
                  style={{
                    padding:
                      "11px 13px",

                    textAlign:
                      "left",

                    color:
                      "var(--fs-text)",

                    fontSize:
                      10,

                    fontWeight:
                      700,

                    textTransform:
                      "uppercase",

                    letterSpacing:
                      ".06em",

                    borderBottom:
                      "1px solid rgba(75,48,36,.11)",
                  }}
                >
                  {renderInline(
                    header
                  )}
                </th>

              )
            )}

          </tr>

        </thead>

        <tbody>

          {rows.map(
            (
              row,
              rowIndex
            ) => (

              <tr
                key={
                  rowIndex
                }
              >

                {row.map(
                  (
                    cell,
                    cellIndex
                  ) => (

                    <td
                      key={
                        cellIndex
                      }
                      style={{
                        padding:
                          "11px 13px",

                        borderBottom:
                          "1px solid rgba(75,48,36,.08)",

                        color:
                          "var(--fs-text-2)",

                        fontSize:
                          11.5,
                      }}
                    >
                      {renderInline(
                        cell
                      )}
                    </td>

                  )
                )}

              </tr>

            )
          )}

        </tbody>

      </table>

    </div>
  );
}

/* =========================================================
   DOCUMENT REFERENCES
========================================================= */

function DocumentEvidencePanel({
  documents,
}: {
  documents:
    | DocumentEvidenceItem[]
    | undefined;
}) {
  return (
    <div
      style={{
        marginTop:
          10,

        padding:
          13,

        borderRadius:
          12,

        background:
          "var(--fs-dark-3)",

        border:
          "1px solid rgba(255,255,255,.07)",
      }}
    >

      <div
        style={{
          display:
            "flex",

          alignItems:
            "center",

          gap:
            7,

          marginBottom:
            10,

          color:
            "var(--fs-red-soft)",

          fontSize:
            9.5,

          textTransform:
            "uppercase",

          letterSpacing:
            ".10em",

          fontWeight:
            700,
        }}
      >

        <FileText
          size={11}
        />

        Document references

      </div>

      <div
        style={{
          display:
            "flex",

          flexDirection:
            "column",

          gap:
            8,
        }}
      >

        {(documents || []).map(
          (
            document,
            index
          ) => (

            <div
              key={
                index
              }
              style={{
                padding:
                  "10px 11px",

                borderRadius:
                  8,

                background:
                  "rgba(255,255,255,.025)",

                border:
                  "1px solid rgba(255,255,255,.055)",
              }}
            >

              <pre
                style={{
                  margin:
                    0,

                  color:
                    "var(--fs-dark-text)",

                  fontFamily:
                    "var(--fs-mono)",

                  fontSize:
                    9.5,

                  lineHeight:
                    1.55,

                  whiteSpace:
                    "pre-wrap",

                  wordBreak:
                    "break-word",
                }}
              >
                {JSON.stringify(
                  document,
                  null,
                  2
                )}
              </pre>

            </div>

          )
        )}

      </div>
    </div>
  );
}

/* =========================================================
   EMPTY INVESTIGATION
========================================================= */

function EmptyInvestigation({
  workspaceId,
}: {
  workspaceId:
    | string
    | null;
}) {
  return (
    <div
      style={{
        height:
          "100%",

        minHeight:
          440,

        display:
          "flex",

        alignItems:
          "center",

        justifyContent:
          "center",
      }}
    >

      <div
        style={{
          width:
            "min(650px,100%)",

          textAlign:
            "center",
        }}
      >

        <div
          style={{
            width:
              72,

            height:
              72,

            borderRadius:
              21,

            margin:
              "0 auto 20px",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            background:
              "linear-gradient(145deg,rgba(143,32,39,.12),rgba(109,73,53,.08))",

            border:
              "1px solid rgba(143,32,39,.16)",

            boxShadow:
              "0 18px 45px rgba(75,47,35,.09)",
          }}
        >

          <Sparkles
            size={28}
            color={
              "var(--fs-red)"
            }
          />

        </div>

        <div
          style={{
            fontFamily:
              "var(--fs-display)",

            fontSize:
              "clamp(25px,3vw,35px)",

            color:
              "var(--fs-text)",

            letterSpacing:
              "-.03em",
          }}
        >
          Ask your financial data anything.
        </div>

        <p
          style={{
            maxWidth:
              510,

            margin:
              "10px auto 0",

            color:
              "var(--fs-muted)",

            fontSize:
              12,

            lineHeight:
              1.7,
          }}
        >
          {workspaceId
            ? "Investigate revenue, expenses, trends, anomalies, variance, and document-backed financial questions."
            : "Initialize a workspace and upload your financial files to activate the investigation terminal."}
        </p>

        {workspaceId && (

          <div
            style={{
              display:
                "flex",

              justifyContent:
                "center",

              flexWrap:
                "wrap",

              gap:
                8,

              marginTop:
                22,
            }}
          >

            {[
              "What drove the Q2 variance?",
              "Show me unusual expenses",
              "Compare revenue by period",
            ].map(
              (
                suggestion
              ) => (

                <div
                  key={
                    suggestion
                  }
                  style={{
                    padding:
                      "8px 11px",

                    borderRadius:
                      999,

                    border:
                      "1px solid rgba(86,61,49,.13)",

                    background:
                      "rgba(255,255,255,.34)",

                    color:
                      "var(--fs-text-2)",

                    fontSize:
                      10.5,
                  }}
                >
                  {
                    suggestion
                  }
                </div>

              )
            )}

          </div>

        )}

      </div>
    </div>
  );
}

/* =========================================================
   FILES VIEW
========================================================= */

function FilesView({
  datasets,
  avgQuality,
  totalRows,
}: {
  datasets: Dataset[];
  avgQuality: string;
  totalRows: number;
}) {
  return (
    <div
      className="fs-scroll fs-main-pad"
      style={{
        flex:
          1,

        overflowY:
          "auto",

        padding:
          "34px 7%",

        background:
          "var(--fs-paper-bg)",
      }}
    >

      <PageIntro
        icon={
          <BarChart3
            size={17}
          />
        }
        eyebrow="Workspace"
        title="Data health & uploads"
        description="Monitor indexed datasets and inspect the quality of the records currently powering your financial investigations."
      />

      <div
        className="fs-grid-3"
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "repeat(3,1fr)",

          gap:
            14,

          marginTop:
            25,
        }}
      >

        <LightMiniCard
          label="Files indexed"
          value={`${datasets.length}`}
          icon={
            <FileText
              size={16}
            />
          }
        />

        <LightMiniCard
          label="Rows indexed"
          value={totalRows.toLocaleString()}
          icon={
            <Table2
              size={16}
            />
          }
        />

        <LightMiniCard
          label="Average quality"
          value={`${avgQuality}%`}
          icon={
            <Check
              size={16}
            />
          }
        />

      </div>

      <section
        style={{
          marginTop:
            22,

          border:
            "1px solid var(--fs-line)",

          borderRadius:
            14,

          overflow:
            "hidden",

          background:
            "rgba(250,247,242,.80)",

          boxShadow:
            "0 14px 38px rgba(69,45,34,.06)",
        }}
      >

        <LightSectionHeader
          title="Indexed datasets"
          count={`${datasets.length}`}
        />

        <div
          className="fs-scroll"
          style={{
            overflowX:
              "auto",
          }}
        >

          <table
            style={{
              width:
                "100%",

              borderCollapse:
                "collapse",
            }}
          >

            <thead>

              <tr>

                <TableHeadingLight>
                  File
                </TableHeadingLight>

                <TableHeadingLight>
                  Rows
                </TableHeadingLight>

                <TableHeadingLight>
                  Quality
                </TableHeadingLight>

                <TableHeadingLight>
                  Dataset ID
                </TableHeadingLight>

              </tr>

            </thead>

            <tbody>

              {datasets.map(
                (
                  dataset
                ) => (

                  <tr
                    key={
                      dataset.dataset_id
                    }
                    style={{
                      borderTop:
                        "1px solid var(--fs-line)",
                    }}
                  >

                    <td
                      style={{
                        padding:
                          "15px 18px",
                      }}
                    >

                      <div
                        style={{
                          display:
                            "flex",

                          alignItems:
                            "center",

                          gap:
                            10,
                        }}
                      >

                        <div
                          style={{
                            width:
                              32,

                            height:
                              32,

                            borderRadius:
                              8,

                            display:
                              "flex",

                            alignItems:
                              "center",

                            justifyContent:
                              "center",

                            background:
                              "rgba(143,32,39,.07)",

                            border:
                              "1px solid rgba(143,32,39,.11)",

                            color:
                              "var(--fs-red)",
                          }}
                        >

                          <File
                            size={
                              14
                            }
                          />

                        </div>

                        <span
                          style={{
                            color:
                              "var(--fs-text)",

                            fontSize:
                              12,

                            fontWeight:
                              600,
                          }}
                        >
                          {
                            dataset.filename
                          }
                        </span>

                      </div>

                    </td>

                    <td
                      style={{
                        padding:
                          "15px 18px",

                        color:
                          "var(--fs-text-2)",

                        fontFamily:
                          "var(--fs-mono)",

                        fontSize:
                          10.5,
                      }}
                    >
                      {Number(
                        dataset.row_count ||
                          0
                      ).toLocaleString()}
                    </td>

                    <td
                      style={{
                        padding:
                          "15px 18px",
                      }}
                    >

                      <QualityPillLight
                        value={
                          Number(
                            dataset.quality_score ||
                              0
                          )
                        }
                      />

                    </td>

                    <td
                      style={{
                        padding:
                          "15px 18px",

                        color:
                          "var(--fs-muted)",

                        fontFamily:
                          "var(--fs-mono)",

                        fontSize:
                          9,
                      }}
                    >
                      {
                        dataset.dataset_id
                      }
                    </td>

                  </tr>

                )
              )}

              {datasets.length ===
                0 && (

                <tr>

                  <td
                    colSpan={
                      4
                    }
                    style={{
                      padding:
                        60,

                      textAlign:
                        "center",

                      color:
                        "var(--fs-muted)",

                      fontSize:
                        12,
                    }}
                  >
                    No datasets have been indexed yet.
                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      </section>

    </div>
  );
}

/* =========================================================
   TELEMETRY VIEW
========================================================= */

function TelemetryView({
  telemetry,
  totalCost,
  avgLatency,
}: {
  telemetry: Telemetry[];
  totalCost: string;
  avgLatency: string;
}) {
  return (
    <div
      className="fs-scroll fs-main-pad"
      style={{
        flex:
          1,

        overflowY:
          "auto",

        padding:
          "34px 7%",

        background:
          "var(--fs-paper-bg)",
      }}
    >

      <PageIntro
        icon={
          <Activity
            size={17}
          />
        }
        eyebrow="Administration"
        title="Request telemetry"
        description="Inspect request routing, backend latency and model operating cost."
      />

      <div
        className="fs-grid-3"
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "repeat(3,1fr)",

          gap:
            14,

          marginTop:
            25,
        }}
      >

        <LightMiniCard
          label="Requests"
          value={`${telemetry.length}`}
          icon={
            <Activity
              size={16}
            />
          }
        />

        <LightMiniCard
          label="Average latency"
          value={`${avgLatency}s`}
          icon={
            <Clock3
              size={16}
            />
          }
        />

        <LightMiniCard
          label="Total cost"
          value={`$${totalCost}`}
          icon={
            <DollarSign
              size={16}
            />
          }
        />

      </div>

      <section
        style={{
          marginTop:
            22,

          border:
            "1px solid var(--fs-line)",

          borderRadius:
            14,

          overflow:
            "hidden",

          background:
            "rgba(250,247,242,.80)",

          boxShadow:
            "0 14px 38px rgba(69,45,34,.06)",
        }}
      >

        <LightSectionHeader
          title="Live request log"
          count={`${telemetry.length}`}
        />

        <div
          className="fs-scroll"
          style={{
            overflowX:
              "auto",
          }}
        >

          <table
            style={{
              width:
                "100%",

              borderCollapse:
                "collapse",
            }}
          >

            <thead>

              <tr>

                <TableHeadingLight>
                  Query
                </TableHeadingLight>

                <TableHeadingLight>
                  Route
                </TableHeadingLight>

                <TableHeadingLight>
                  Latency
                </TableHeadingLight>

                <TableHeadingLight>
                  Cost
                </TableHeadingLight>

                <TableHeadingLight>
                  Request ID
                </TableHeadingLight>

              </tr>

            </thead>

            <tbody>

              {telemetry.map(
                (
                  log
                ) => (

                  <tr
                    key={
                      log.request_id
                    }
                    style={{
                      borderTop:
                        "1px solid var(--fs-line)",
                    }}
                  >

                    <td
                      style={{
                        padding:
                          "15px 18px",

                        maxWidth:
                          420,
                      }}
                    >

                      <div
                        title={
                          log.query
                        }
                        style={{
                          overflow:
                            "hidden",

                          textOverflow:
                            "ellipsis",

                          whiteSpace:
                            "nowrap",

                          color:
                            "var(--fs-text)",

                          fontSize:
                            11.5,
                        }}
                      >
                        {
                          log.query
                        }
                      </div>

                    </td>

                    <td
                      style={{
                        padding:
                          "15px 18px",
                      }}
                    >

                      <RoutePillLight
                        route={
                          log.route
                        }
                      />

                    </td>

                    <td
                      style={{
                        padding:
                          "15px 18px",

                        color:
                          "var(--fs-text-2)",

                        fontFamily:
                          "var(--fs-mono)",

                        fontSize:
                          10,
                      }}
                    >
                      {Number(
                        log.latency ||
                          0
                      ).toFixed(
                        2
                      )}
                      s
                    </td>

                    <td
                      style={{
                        padding:
                          "15px 18px",

                        color:
                          "var(--fs-red)",

                        fontFamily:
                          "var(--fs-mono)",

                        fontSize:
                          10,
                      }}
                    >
                      $
                      {Number(
                        log.total_cost ||
                          0
                      ).toFixed(
                        5
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "15px 18px",

                        color:
                          "var(--fs-muted)",

                        fontFamily:
                          "var(--fs-mono)",

                        fontSize:
                          9,
                      }}
                    >
                      {
                        log.request_id
                      }
                    </td>

                  </tr>
                )
              )}

              {telemetry.length ===
                0 && (

                <tr>

                  <td
                    colSpan={
                      5
                    }
                    style={{
                      padding:
                        60,

                      textAlign:
                        "center",

                      color:
                        "var(--fs-muted)",

                      fontSize:
                        12,
                    }}
                  >
                    No request telemetry available.
                  </td>

                </tr>
              )}

            </tbody>

          </table>

        </div>

      </section>

    </div>
  );
}

/* =========================================================
   EVALUATIONS VIEW
========================================================= */

function EvaluationsView({
  metrics,
}: {
  metrics:
    EvaluationMetrics;
}) {
  return (
    <div
      className="fs-scroll fs-main-pad"
      style={{
        flex:
          1,

        overflowY:
          "auto",

        padding:
          "34px 7%",

        background:
          "var(--fs-paper-bg)",
      }}
    >

      <PageIntro
        icon={
          <ShieldCheck
            size={17}
          />
        }
        eyebrow="Administration"
        title="AI evaluation"
        description="Current evaluation signals for routing, retrieval and hallucination behavior."
      />

      <div
        className="fs-grid-3"
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "repeat(3,1fr)",

          gap:
            16,

          marginTop:
            26,
        }}
      >

        <EvaluationCard
          icon={
            <TrendingUp
              size={17}
            />
          }
          label="Routing precision"
          value={
            metrics.precision
          }
          tint={
            "var(--fs-red)"
          }
          description="Backend evaluation"
        />

        <EvaluationCard
          icon={
            <Database
              size={17}
            />
          }
          label="RAG recall"
          value={
            metrics.recall
          }
          tint={
            "var(--fs-coffee)"
          }
          description="Backend evaluation"
        />

        <EvaluationCard
          icon={
            <AlertCircle
              size={17}
            />
          }
          label="Hallucination rate"
          value={
            metrics.hallucination_rate
          }
          tint={
            "var(--fs-danger)"
          }
          description="Lower is preferable"
          reverse
        />

      </div>

    </div>
  );
}

/* =========================================================
   SHARED UI
========================================================= */

function SidebarButton({
  active,
  onClick,
  icon,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  accent?: string;
}) {
  return (
    <button
      onClick={
        onClick
      }
      className="fs-focus"
      style={{
        width:
          "100%",

        border:
          "none",

        borderRadius:
          9,

        padding:
          "10px 11px",

        marginBottom:
          4,

        display:
          "flex",

        alignItems:
          "center",

        gap:
          10,

        textAlign:
          "left",

        cursor:
          "pointer",

        background:
          active
            ? accent ===
              "brand"
              ? "rgba(142,31,37,.15)"
              : "rgba(255,255,255,.045)"
            : "transparent",

        color:
          active
            ? accent ===
              "brand"
              ? "var(--fs-red-soft)"
              : "var(--fs-dark-text)"
            : "var(--fs-dark-muted)",

        fontSize:
          11.5,

        fontWeight:
          600,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function MetricLight({
  icon,
  label,
  value,
  tint,
  mono,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tint: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display:
          "flex",

        alignItems:
          "center",

        gap:
          9,
      }}
    >

      <div
        style={{
          width:
            31,

          height:
            31,

          borderRadius:
            8,

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          color:
            tint,

          background:
            "rgba(255,255,255,.35)",

          border:
            "1px solid rgba(86,61,49,.10)",
        }}
      >
        {icon}
      </div>

      <div>

        <div
          style={{
            color:
              "var(--fs-muted)",

            fontSize:
              8.5,

            fontWeight:
              600,

            textTransform:
              "uppercase",

            letterSpacing:
              ".10em",
          }}
        >
          {label}
        </div>

        <div
          style={{
            marginTop:
              2,

            color:
              "var(--fs-text)",

            fontSize:
              12,

            fontWeight:
              700,

            fontFamily:
              mono
                ? "var(--fs-mono)"
                : "var(--fs-ui)",
          }}
        >
          {value}
        </div>

      </div>

    </div>
  );
}

function PageIntro({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>

      <div
        style={{
          display:
            "flex",

          alignItems:
            "center",

          gap:
            7,

          color:
            "var(--fs-red)",

          fontSize:
            9.5,

          fontWeight:
            700,

          textTransform:
            "uppercase",

          letterSpacing:
            ".12em",
        }}
      >
        {icon}
        {eyebrow}
      </div>

      <h2
        style={{
          margin:
            "7px 0 6px",

          fontFamily:
            "var(--fs-display)",

          fontSize:
            27,

          fontWeight:
            500,

          color:
            "var(--fs-text)",

          letterSpacing:
            "-.03em",
        }}
      >
        {title}
      </h2>

      <p
        style={{
          maxWidth:
            670,

          margin:
            0,

          color:
            "var(--fs-muted)",

          fontSize:
            11.5,

          lineHeight:
            1.7,
        }}
      >
        {description}
      </p>

    </div>
  );
}

function LightMiniCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding:
          18,

        borderRadius:
          13,

        background:
          "rgba(250,247,242,.76)",

        border:
          "1px solid var(--fs-line)",

        boxShadow:
          "0 10px 28px rgba(74,48,36,.05)",
      }}
    >

      <div
        style={{
          width:
            31,

          height:
            31,

          borderRadius:
            8,

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          color:
            "var(--fs-red)",

          background:
            "rgba(143,32,39,.065)",

          marginBottom:
            11,
        }}
      >
        {icon}
      </div>

      <div
        style={{
          color:
            "var(--fs-muted)",

          fontSize:
            9,

          fontWeight:
            600,

          textTransform:
            "uppercase",

          letterSpacing:
            ".10em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop:
            4,

          color:
            "var(--fs-text)",

          fontFamily:
            "var(--fs-mono)",

          fontSize:
            21,

          fontWeight:
            600,
        }}
      >
        {value}
      </div>

    </div>
  );
}

function LightSectionHeader({
  title,
  count,
}: {
  title: string;
  count: string;
}) {
  return (
    <div
      style={{
        padding:
          "16px 18px",

        borderBottom:
          "1px solid var(--fs-line)",

        display:
          "flex",

        alignItems:
          "center",

        justifyContent:
          "space-between",
      }}
    >

      <div
        style={{
          display:
            "flex",

          alignItems:
            "center",

          gap:
            9,

          color:
            "var(--fs-text)",

          fontSize:
            11.5,

          fontWeight:
            700,
        }}
      >
        <Database
          size={14}
          color={
            "var(--fs-red)"
          }
        />

        {title}
      </div>

      <span
        style={{
          padding:
            "3px 7px",

          borderRadius:
            999,

          color:
            "var(--fs-muted)",

          background:
            "rgba(143,32,39,.055)",

          fontFamily:
            "var(--fs-mono)",

          fontSize:
            9,
        }}
      >
        {count}
      </span>

    </div>
  );
}

function TableHeadingLight({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <th
      style={{
        padding:
          "12px 18px",

        textAlign:
          "left",

        color:
          "var(--fs-muted)",

        fontSize:
          9.5,

        fontWeight:
          700,

        textTransform:
          "uppercase",

        letterSpacing:
          ".08em",
      }}
    >
      {children}
    </th>
  );
}

function QualityPillLight({
  value,
}: {
  value:
    number;
}) {
  const safe =
    Math.max(
      0,
      Math.min(
        100,
        value
      )
    );

  return (
    <span
      style={{
        display:
          "inline-flex",

        alignItems:
          "center",

        gap:
          6,

        padding:
          "4px 8px",

        borderRadius:
          999,

        color:
          "var(--fs-coffee)",

        background:
          "rgba(109,73,53,.08)",

        border:
          "1px solid rgba(109,73,53,.15)",

        fontFamily:
          "var(--fs-mono)",

        fontSize:
          9.5,
      }}
    >

      <span
        style={{
          width:
            5,

          height:
            5,

          borderRadius:
            "50%",

          background:
            "var(--fs-coffee)",
        }}
      />

      {safe.toFixed(
        1
      )}
      %

    </span>
  );
}

function RoutePillLight({
  route,
}: {
  route:
    string;
}) {
  return (
    <span
      style={{
        display:
          "inline-flex",

        padding:
          "4px 8px",

        borderRadius:
          999,

        color:
          "var(--fs-text-2)",

        background:
          "rgba(143,32,39,.055)",

        border:
          "1px solid rgba(143,32,39,.12)",

        fontFamily:
          "var(--fs-mono)",

        fontSize:
          9,
      }}
    >
      {route}
    </span>
  );
}

function EvidencePill({
  icon,
  label,
  tone,
}: {
  icon:
    ReactNode;

  label:
    string;

  tone:
    "red"
    | "coffee";
}) {
  const config =
    tone ===
    "red"
      ? {
          color:
            "var(--fs-red)",

          background:
            "rgba(143,32,39,.055)",

          border:
            "rgba(143,32,39,.14)",
        }
      : {
          color:
            "var(--fs-coffee)",

          background:
            "rgba(109,73,53,.07)",

          border:
            "rgba(109,73,53,.15)",
        };

  return (
    <span
      style={{
        display:
          "inline-flex",

        alignItems:
          "center",

        gap:
          5,

        padding:
          "4px 8px",

        borderRadius:
          999,

        background:
          config.background,

        border:
          `1px solid ${config.border}`,

        color:
          config.color,

        fontSize:
          9.5,

        fontWeight:
          700,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function EvaluationCard({
  icon,
  label,
  value,
  description,
  tint,
  reverse,
}: {
  icon:
    ReactNode;

  label:
    string;

  value:
    string;

  description:
    string;

  tint:
    string;

  reverse?:
    boolean;
}) {
  const numeric =
    parseFloat(
      value
    ) || 0;

  const width =
    reverse
      ? Math.min(
          100,
          numeric * 5
        )
      : Math.min(
          100,
          numeric
        );

  return (
    <div
      style={{
        minHeight:
          220,

        padding:
          21,

        borderRadius:
          14,

        display:
          "flex",

        flexDirection:
          "column",

        justifyContent:
          "space-between",

        background:
          "rgba(250,247,242,.76)",

        border:
          "1px solid var(--fs-line)",

        boxShadow:
          "0 15px 38px rgba(69,45,34,.07)",
      }}
    >

      <div>

        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            gap:
              8,

            color:
              tint,
          }}
        >

          {icon}

          <span
            style={{
              color:
                "var(--fs-muted)",

              fontSize:
                9.5,

              fontWeight:
                700,

              textTransform:
                "uppercase",

              letterSpacing:
                ".08em",
            }}
          >
            {label}
          </span>

        </div>

        <div
          style={{
            marginTop:
              20,

            color:
              tint,

            fontFamily:
              "var(--fs-mono)",

            fontSize:
              30,

            letterSpacing:
              "-.04em",
          }}
        >
          {value}
        </div>

        <div
          style={{
            marginTop:
              7,

            color:
              "var(--fs-muted)",

            fontSize:
              10,
          }}
        >
          {description}
        </div>

      </div>

      <div
        style={{
          height:
            6,

          overflow:
            "hidden",

          borderRadius:
            999,

          background:
            "rgba(79,54,43,.10)",
        }}
      >

        <div
          style={{
            width:
              `${width}%`,

            height:
              "100%",

            borderRadius:
              999,

            background:
              tint,

            transition:
              "width .8s ease",
          }}
        />

      </div>

    </div>
  );
}