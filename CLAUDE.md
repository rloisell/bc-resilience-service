# bc-resilience-service — CLAUDE.md
# Ryan Loisell — Developer / Architect | GitHub Copilot | April 2026
#
# Context for Claude Code and other AI agents.

## Purpose

`bc-resilience-service` is a GitHub Copilot Extension that delivers on-demand
OCP workload resilience analysis for BC Gov teams.

Invoked as:
```
@bc-resilience analyze namespace:f1b263 [repo:bcgov-c/myapp] [cluster:silver] [envs:dev,prod]
```

The service collects live namespace data, runs AI-powered gap analysis against
15 resilience check categories, and streams a graded report (A–F) back to
GitHub Copilot Chat, then uploads a PDF artifact.

---

## Architecture

```
GitHub Copilot Chat
        │
        ▼
bc-resilience-service (Fastify, port 8080)    ← Emerald / be808f
        │
        ├─ collect.sh (ocp-resilience-toolkit submodule)
        │       └─ oc CLI → OCP Silver / Gold APIs (read-only)
        │
        ├─ GitHub Models API  (openai/gpt-4o)  → streaming analysis
        │
        └─ PDF render + GitHub Releases upload
```

---

## Resilience Check Categories

| ID  | Severity | Description |
|-----|----------|-------------|
| R01 | CRITICAL | PDB missing (multi-replica Deployment/StatefulSet) |
| R02 | CRITICAL | PDB misconfigured (blocks all or no disruptions) |
| R03 | CRITICAL | Single replica, no HPA minReplicas ≥ 2 |
| R04 | HIGH     | No liveness probe |
| R05 | HIGH     | No readiness probe |
| R06 | HIGH     | No HPA / static scaling |
| R07 | HIGH     | No pod anti-affinity on multi-replica workloads |
| R08 | HIGH     | No graceful termination |
| R09 | HIGH     | BestEffort QoS (missing resources.requests) |
| R10 | CRITICAL | RWO PVC on Deployment replicas > 1 |
| R11 | INFO     | No startup probe on long-starting containers |
| R12 | HIGH     | Recreate update strategy on user-facing Deployment |
| R13 | INFO     | No PriorityClass |
| R14 | HIGH     | Recent OOMKill / Eviction events |
| R15 | CRITICAL | Live PDB violation |

---

## Grading

- **A** — 0 CRITICAL, 0 HIGH
- **B** — 0 CRITICAL, ≤ 2 HIGH
- **C** — 0 CRITICAL, > 2 HIGH
- **D** — 1 CRITICAL
- **F** — 2+ CRITICAL

Task IDs: `RES-NN`

---

## Key files

| File | Purpose |
|------|---------|
| `src/routes/copilot.ts` | SSE handler, HMAC verification, command dispatch |
| `src/lib/command-parser.ts` | Parse `@bc-resilience analyze` params |
| `src/services/analysis-pipeline.ts` | Collect → Analyse → Render → Upload |
| `src/services/analyzer.ts` | GitHub Models API streaming call |
| `submodules/ocp-resilience-toolkit/` | collect.sh, render.sh, report-sections.md |
| `gitops/charts/bc-resilience/` | Helm chart (Deployment, Service, Route, PDB, ESO, NetworkPolicy) |
| `.github/workflows/build-and-push.yml` | ISB EA Option 2 CI pipeline |

---

## Environment variables (from Vault ESO)

| Variable | Description |
|----------|-------------|
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App RSA private key (PEM) |
| `GITHUB_APP_WEBHOOK_SECRET` | Webhook HMAC secret |
| `GITHUB_MODELS_API_KEY` | PAT with `models:read` scope |
| `OC_SILVER_TOKEN` | OCP Silver service account token (cluster-reader) |
| `OC_GOLD_TOKEN` | OCP Gold service account token (cluster-reader) |

Vault path: `secret/data/be808f-<env>/bc-resilience-service`

---

## Agent instructions

Load skills from `.github/agents/` (rl-agents-n-skills submodule):
- `ocp-resilience-analyst/SKILL.md` — primary domain knowledge
- `bc-gov-devops/SKILL.md` — policy-as-code, deployment standards
- `bc-gov-emerald/SKILL.md` — Emerald namespace conventions
- `bc-gov-networkpolicy/SKILL.md` — ag-helm NetworkPolicy intent API
- `security-architect/SKILL.md` — OWASP, secret management
- `observability/SKILL.md` — logging, health probes

Never fabricate OCP data. Never skip Phase 1 collection without noting the gap.
