# bc-resilience-service

A **GitHub Copilot Extension** that delivers on-demand OCP workload resilience
posture analysis for BC Gov teams.

---

## Usage

```
# Basic — analyse all environments in a namespace
@bc-resilience analyze namespace:f1b263

# With optional repo cross-reference
@bc-resilience analyze namespace:f1b263 repo:bcgov-c/myapp cluster:silver

# Specific environments
@bc-resilience analyze namespace:f1b263 envs:prod,test

# Help
@bc-resilience help
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `namespace` | ✅ | — | 6-char OCP license plate prefix |
| `repo` | ❌ | — | GitHub `owner/name` for Helm/k8s source cross-reference |
| `cluster` | ❌ | `silver` | Source cluster: `silver` \| `gold` \| `emerald` |
| `envs` | ❌ | `dev,test,prod,tools` | Environment suffixes |

---

## What it analyses

The service checks 15 resilience gap categories across all workloads:

| Code | Severity | Check |
|------|----------|-------|
| R01 | CRITICAL | PDB missing on multi-replica workloads |
| R02 | CRITICAL | PDB misconfigured |
| R03 | CRITICAL | Single replica, no HPA |
| R04 | HIGH | No liveness probe |
| R05 | HIGH | No readiness probe |
| R06 | HIGH | No HPA / static scaling |
| R07 | HIGH | No pod anti-affinity |
| R08 | HIGH | No graceful termination |
| R09 | HIGH | BestEffort QoS |
| R10 | CRITICAL | RWO PVC on replicated Deployment |
| R11 | INFO | No startup probe |
| R12 | HIGH | Recreate update strategy |
| R13 | INFO | No PriorityClass |
| R14 | HIGH | Recent OOMKill / Eviction |
| R15 | CRITICAL | Live PDB violation |

**Grade: A–F** (based on number of CRITICAL / HIGH findings)

---

## Architecture

```
GitHub Copilot Chat
        │
        ▼  POST /api/v1/extension  (HMAC-SHA256 verified)
bc-resilience-service  [Fastify 5, Node 22, TypeScript 5]
        │
        ├── bash collect.sh (ocp-resilience-toolkit)
        │     └── oc CLI → OCP APIs (read-only, cluster-reader SA)
        │
        ├── GitHub Models API  openai/gpt-4o  (SSE streaming)
        │
        ├── pandoc + Chromium  → PDF render
        │
        └── GitHub Releases → PDF + Markdown upload → URL in chat
```

**Deployed on:** Emerald OpenShift — namespace `be808f`  
**Secrets:** HashiCorp Vault + External Secrets Operator  
**Scaling:** KEDA HTTP Add-on (dev, scale-to-zero); HPA (test/prod)  
**GitOps:** ArgoCD → `rloisell/bc-resilience-service-gitops`

---

## Development

```bash
# Install
npm install

# Run locally (dev mode with watch)
npm run dev

# Typecheck
npm run typecheck

# Build
npm run build

# Test
npm test
```

### Required env vars

```env
GITHUB_APP_WEBHOOK_SECRET=<hmac-secret>
GITHUB_MODELS_API_KEY=<pat-with-models-read>
OC_SILVER_TOKEN=<sa-token>
OC_GOLD_TOKEN=<sa-token>
TOOLKIT_PATH=./submodules/ocp-resilience-toolkit
```

---

## Deployment

See [CLAUDE.md](CLAUDE.md) for full deployment guide.

Vault path: `secret/data/be808f-<env>/bc-resilience-service`

---

## Related tools

| Tool | Purpose |
|------|---------|
| [ocp-resilience-toolkit](../ocp-resilience-toolkit) | CLI toolkit (Tier 1 & 2) |
| [bc-migrate-service](../bc-migrate-service) | Sister service — migration analysis |
| [rl-agents-n-skills](../rl-agents-n-skills) | SKILL.md library |

---

## License

Apache 2.0 — Copyright © 2024 Province of British Columbia
