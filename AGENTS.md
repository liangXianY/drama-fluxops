# AGENTS.md — AI Coding Assistant Onboarding Guide

This repository (`drama-fluxops`) is a full-stack **Short-Drama Programmatic Ad Delivery & Traffic Pool Automation Platform MVP** (短剧投流自动化运营中台), targeting **Kuaishou Magnetic Engine (快手磁力智投)** and **Douyin Ocean Engine (抖音巨量广告)**.

If a user clones this repository on a new machine and asks you (an AI assistant such as Claude Code, Cursor, Codex, Windsurf, or Antigravity) to set up, run, test, or extend this project, follow the instructions below.

---

## 1. Prerequisites & Zero-Config Design
- **Python**: `>= 3.10` (tested on `3.12`)
- **Node.js**: `>= 18` (tested on `v20` / `v24`)
- **Zero External Middleware Required**:
  - Database uses local **SQLite** (`backend/fluxops.db`), which is **automatically created and seeded** with realistic short-drama data on FastAPI startup (`app/main.py` -> `on_startup` -> `seed_initial_data`).
  - No API keys or Redis/Docker containers are required to run the full closed-loop demo. Optional OpenAI-compatible LLM keys (DeepSeek, Qwen, SiliconFlow, GLM, Doubao, OpenAI) can be configured directly in the UI (`多维报表与规则锁 -> 自动化规则引擎 & 账户资金安全锁`).

---

## 2. How to Run Locally (Step-by-Step)

### Step A: Backend (`http://127.0.0.1:8000`)
```bash
cd backend
python -m pip install -r requirements.txt

# Run unit tests first to verify environment (should pass 6/6 tests)
PYTHONPATH=. python -m pytest -v tests/test_fluxops_core.py

# Start FastAPI server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Step B: Frontend (`http://127.0.0.1:5173`)
In a second terminal:
```bash
cd frontend
npm install

# Optional: verify TypeScript + Vite production build
npm run build

# Start Vite dev server (proxies /api/* -> http://127.0.0.1:8000)
npm run dev
```
Open **`http://127.0.0.1:5173`** in the browser.

*(On Windows, running `start_mvp.bat` or on macOS/Linux running `bash start_mvp.sh` automates Steps A & B.)*

---

## 3. Codebase Architecture Map

```text
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py                 # FastAPI app, REST endpoints (/api/overview, /api/materials/*, /api/videos/*, /api/reports/multidim, /api/sim/*)
│   │   ├── database.py             # SQLAlchemy engine (defaults to sqlite:///fluxops.db; override via DATABASE_URL env var)
│   │   ├── models.py               # ORM tables: SystemConfig, AdAccount, ShortVideo, MaterialAsset, AdPlan, MetricSnapshot, AutomationRule, AuditLog, FeishuApprovalCard
│   │   ├── schemas.py              # Pydantic v2 request/response schemas
│   │   ├── seed.py                 # Auto-seeds short drama slices, KWAI/OCEAN accounts, materials, 5-min snapshots, L1 rules
│   │   ├── engine/
│   │   │   ├── rule_engine.py      # L1 deterministic horse-racing rules (R1~R4), 30m cooldown anti-spam, cold-start cleanup, Kill Switch
│   │   │   ├── simulator.py        # 5-min traffic pool physics simulator (+5m tick, viral injection, midnight runaway burn, reset)
│   │   │   └── ai_copilot.py       # L2 AI diagnosis & Kuaishou dual-column cover A/B generator (OpenAI-compatible LLM + built-in fallback)
│   │   └── gateways/
│   │       └── kuaishou_api.py     # Adapter pattern: SandboxMagneticTaurusGateway + OfficialMagneticTaurusGateway OpenAPI v2 skeleton
│   └── tests/
│       └── test_fluxops_core.py    # Pytest suite (MD5 deduplication, spec check, rejected-asset guard, Cartesian builder, Kill Switch, R3 stop-loss, reports)
├── frontend/
│   ├── vite.config.ts              # Proxies /api to http://127.0.0.1:8000
│   └── src/
│       ├── App.tsx                 # Two-tier enterprise light header + Sandbox time-travel toolbar + Toast feedback
│       ├── api/client.ts           # Typed API client
│       └── components/
│           ├── DashboardView.tsx       # Tab 1: Core KPIs, 4-stage funnel, Cumulative vs 30m Marginal ROI chart, execution log table
│           ├── MaterialHubView.tsx     # Tab 2: Web Crypto SHA-256 slice dedup + HTML5 video spec probe + Cartesian batch ad builder drawer
│           ├── TrafficPoolView.tsx     # Tab 3: 4-stage traffic pool cards (OBSERVING/TESTING/SCALING/ELIMINATED) + Kuaishou dual-column cover preview
│           ├── AnalyticsAndRulesView.tsx # Tab 4: Editor hit-rate ranking, drama 7d ROI summary, KWAI vs OCEAN comparison + RuleEngineView
│           ├── RuleEngineView.tsx      # Capital safety guard (break-even ROI, plan cap, hourly auto-add cap, Kill Switch) + L1 rules + LLM presets
│           ├── AICopilotModal.tsx      # AI bottleneck diagnosis + 3 dual-column cover A/B variants + 3s hook rewrites
│           └── FeishuCardDrawer.tsx    # Human-in-the-loop Feishu interactive approval cards
└── docs/
    └── ARCHITECTURE_AND_RULES.md   # Detailed business rules & production scaling design (MQ, sharding, attribution lag)
```

## 4. Resetting Database Schema After Model Edits
If you add or modify SQLAlchemy columns in `backend/app/models.py`, delete `backend/fluxops.db` and restart `uvicorn` — it will recreate all tables and re-seed fresh baseline data automatically.
