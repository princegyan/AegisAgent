---
name: brag
description: Turn the codebase or web application into a production-ready kinetic launch and architecture demo video (Hook -> Problem -> Architecture Reveal -> Live Execution -> Sponsor Tracks -> Outro) with storyboard, voiceover script, soundtrack, and rendered MP4.
---

# /brag — Product Launch & Architecture Demo Video Generator

Generates a structured, high-impact launch and technical walkthrough video from the repository's source code, README, and live UI.

## Workflow

1. **Ground in Source Code & README**
   - Extract the core problem statement, system architecture, deterministic state transitions, API integrations, and UI highlights directly from the repo.
2. **Compose the 6-Act Storyboard (3:00 / 180 Seconds)**
   - **Act 1 (0:00–0:25) — The Hook & CFO Dilemma**: Why enterprises block LLMs from programmatic payment access (hallucinated pricing, prompt-injection attacks, zero rollback, missing audit trail).
   - **Act 2 (0:25–0:55) — Multi-Agent Ingestion & Threat Defense**: Agent 1 (Multimodal Sourcing, StrictRFQSchema Zod normalization, Prompt-Injection Threat Modeler) and Agent 2 (KYC/Sanctions, SHA-256 Duplicate Invoice Hash, `>15%` Historical Moving-Median Price Anomaly Detection).
   - **Act 3 (0:55–1:25) — Deterministic Constraint Solver & Dual-Key Merkle Log**: Multi-objective optimization ($U = 0.45 S_{\text{cost}} + 0.30 S_{\text{delivery}} + 0.25 S_{\text{sla}}$) and Dual-Key HMAC-SHA256 / Ed25519 signatures chained into PayPal's `custom_id`.
   - **Act 4 (1:25–2:05) — APIMatic + PayPal Developer Sandbox v2 Settlement**: Dynamic Milestone Escrow (`POST /v2/checkout/orders` with `intent: "AUTHORIZE"`), Order Capture (`POST /v2/payments/authorizations/{id}/capture`), Automated Discrepancy Invoicing (`POST /v2/invoicing/invoices` for 80/100 unit partial deliveries), and Multi-Tier Batch Payouts (`POST /v1/payments/payouts`).
   - **Act 5 (2:05–2:40) — AG Grid Enterprise Operational Flight Deck**: Real-time SSE telemetry stream (`/api/stream`), Custom Cell Renderers, 4-card Master-Detail Transaction Audit Drilldowns, and Batch Action Triggers (`Batch Dual-Key Approve`, `Batch Freeze`).
   - **Act 6 (2:40–3:00) — Live 4-Scenario Verification & Outro**: Summary of Scenario A (Happy Path), Scenario B (`+33.1%` Price Anomaly), Scenario C (Blocked Prompt Injection), and Scenario D (`80/100` Partial Delivery Invoice).
3. **Render Output**
   - Interactive Kinetic Player at `/demo` (`src/app/demo/page.tsx`) with synchronized narration, captions, and Web Audio synth.
   - Standalone 180-second MP4 video file rendered to `public/brag-demo-3min.mp4` via `scripts/render-brag-video.mjs` (`ffmpeg-static`).
