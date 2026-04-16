// src/services/analyzer.ts — bc-resilience-service
// Calls GitHub Models API to stream the resilience posture report.
// Ryan Loisell — Developer / Architect | GitHub Copilot | April 2026

export interface StreamAnalysisOptions {
  manifestSummary: string
  sectionGuide:    string
  namespace:       string
  repo?:           string
  cluster?:        string
  callerToken?:    string
  onChunk:         (text: string) => void
}

export async function streamAnalysis(opts: StreamAnalysisOptions): Promise<void> {
  const { manifestSummary, sectionGuide, namespace, repo, cluster, callerToken, onChunk } = opts

  const apiKey    = process.env.GITHUB_MODELS_API_KEY ?? callerToken ?? ''
  const apiBase   = process.env.LLM_API_BASE ?? 'https://models.inference.ai.azure.com'
  const modelId   = process.env.LLM_MODEL    ?? 'openai/gpt-4o'

  const systemPrompt = buildSystemPrompt()
  const userPrompt   = buildUserPrompt({ manifestSummary, sectionGuide, namespace, repo, cluster })

  const response = await fetch(`${apiBase}/chat/completions`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:  modelId,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`GitHub Models API error: ${response.status} ${response.statusText}`)
  }

  const decoder = new TextDecoder()
  const reader  = response.body!.getReader()
  let   buffer  = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const stripped = line.trim()
      if (!stripped.startsWith('data: ')) continue
      const payload = stripped.slice(6)
      if (payload === '[DONE]') return
      try {
        const event   = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const content = event.choices?.[0]?.delta?.content
        if (content) onChunk(content)
      } catch { /* malformed line — skip */ }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert OpenShift / Kubernetes platform engineer specialised in
workload resilience. You analyse collected namespace data against 15 resilience
check categories (R01–R15) and produce structured, actionable reports.

RESILIENCE CHECK CATEGORIES:
R01 ⛔ CRITICAL — PDB missing (multi-replica Deployment/StatefulSet with no PDB)
R02 ⛔ CRITICAL — PDB misconfigured (minAvailable:0, maxUnavailable:100%, or blocks all disruptions)
R03 ⛔ CRITICAL — Single replica (replicas:1 with no HPA minReplicas >= 2)
R04 ⚠  HIGH — No liveness probe
R05 ⚠  HIGH — No readiness probe
R06 ⚠  HIGH — No HPA / static scaling
R07 ⚠  HIGH — No pod anti-affinity on multi-replica workloads
R08 ⚠  HIGH — No graceful termination (terminationGracePeriodSeconds < 10 or no preStop)
R09 ⚠  HIGH — BestEffort QoS (missing resources.requests)
R10 ⛔ CRITICAL — RWO PVC on Deployment with replicas > 1
R11 ℹ  INFO — No startup probe on containers that take >10s to start
R12 ⚠  HIGH — Recreate update strategy on a user-facing Deployment
R13 ℹ  INFO — No PriorityClass assigned
R14 ⚠  HIGH — Recent OOMKill or Eviction events
R15 ⛔ CRITICAL — Live PDB violation (disruptionsAllowed:0 AND currentHealthy < desiredHealthy)

GRADING SCALE:
A — 0 CRITICAL, 0 HIGH
B — 0 CRITICAL, ≤ 2 HIGH
C — 0 CRITICAL, > 2 HIGH
D — 1 CRITICAL (any)
F — 2+ CRITICAL (any)

TASK ID FORMAT: RES-NN (e.g. RES-01, RES-02)

BC GOV PLATFORM KNOWLEDGE:
- OCP 4.x on Silver/Gold clusters (Platform Services, BC Gov)
- Emerald cluster: sensitive workloads (CITZ), stricter NetworkPolicy
- All BC Gov workloads should have pod labels: DataClass, owner, environment
- ag-helm-templates provides intent-based NetworkPolicy API
- External Secrets Operator (ESO) + HashiCorp Vault for secret management
- KEDA HTTP Add-on available for scale-to-zero on dev/tools
- Recommended PriorityClass values: low-priority, medium-priority, high-priority
- Use podAntiAffinity preferredDuringSchedulingIgnoredDuringExecution for HA
- terminationGracePeriodSeconds: 30 minimum for production workloads
- Standard health probe paths: /health/live, /health/ready, /health/start

OUTPUT RULES:
1. Every finding MUST cite the specific workload name and namespace
2. Every recommendation MUST include a concrete YAML example
3. Prioritise CRITICAL issues first in all sections
4. Grade justification must cite exact finding codes (R01, R15, etc.)
5. The disruption simulation must show both current state (with gaps) and expected state (after fixes)
6. Format task IDs as: RES-NN — Short description

Output in clean Markdown suitable for pandoc PDF rendering.`
}

function buildUserPrompt(opts: {
  manifestSummary: string
  sectionGuide:    string
  namespace:       string
  repo?:           string
  cluster?:        string
}): string {
  const { manifestSummary, sectionGuide, namespace, repo, cluster } = opts
  return [
    `Generate a complete OCP Resilience Posture Report for namespace \`${namespace}\`` +
    ` on cluster \`${cluster ?? 'silver'}\`${repo ? ` (repo: ${repo})` : ''}.`,
    '',
    '## Collected Namespace Data',
    '```',
    manifestSummary.slice(0, 60_000),  // guard against huge inputs
    '```',
    '',
    '## Report Sections Template',
    sectionGuide.slice(0, 8_000),
    '',
    'Generate the full report. Include all 12 sections. Do not skip or abbreviate.',
    'Begin with the document header template.',
  ].join('\n')
}
