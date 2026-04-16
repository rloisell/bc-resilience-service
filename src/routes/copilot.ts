// src/routes/copilot.ts — bc-resilience-service
// GitHub Copilot Extensions SSE handler for @bc-resilience
// Ryan Loisell — Developer / Architect | GitHub Copilot | April 2026
//
// POST /api/v1/extension
//   Verifies GitHub HMAC signature, parses @bc-resilience command,
//   streams resilience analysis back as SSE delta chunks.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { runAnalysis }  from '../services/analysis-pipeline.js'
import { parseCommand } from '../lib/command-parser.js'

interface CopilotMessage {
  role:    'user' | 'assistant' | 'system'
  content: string
}

interface CopilotExtensionBody {
  messages: CopilotMessage[]
}

export async function extensionRoute(app: FastifyInstance) {
  app.post<{ Body: CopilotExtensionBody }>(
    '/extension',
    { config: { rawBody: true } },
    async (request: FastifyRequest<{ Body: CopilotExtensionBody }>, reply: FastifyReply) => {

      // ── Signature verification ────────────────────────────────────────────
      const secret = process.env.GITHUB_APP_WEBHOOK_SECRET
      if (secret) {
        const signature = request.headers['x-hub-signature-256'] as string | undefined
        if (!signature) {
          return reply.code(401).send({ error: 'Missing signature header' })
        }
        const body    = (request as unknown as { rawBody: Buffer }).rawBody
        const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
        const sigBuf   = Buffer.from(signature)
        const expBuf   = Buffer.from(expected)
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return reply.code(401).send({ error: 'Invalid signature' })
        }
      }

      // ── Parse command ─────────────────────────────────────────────────────
      const userMessage = request.body.messages
        .filter(m => m.role === 'user')
        .at(-1)?.content ?? ''

      const command = parseCommand(userMessage)

      if (command.type === 'help' || command.type === 'unknown') {
        const text = command.type === 'unknown'
          ? `**Error:** ${command.raw}\n\n${helpText()}`
          : helpText()
        return sendSingleResponse(reply, text)
      }

      if (!command.namespace) {
        return sendSingleResponse(reply,
          '**Missing namespace.**\n\n' +
          'Usage: `@bc-resilience analyze namespace:<prefix> [repo:<owner/name>]`'
        )
      }

      // ── Stream analysis ───────────────────────────────────────────────────
      reply.raw.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection':        'keep-alive',
      })

      const callerToken = request.headers['x-github-token'] as string | undefined

      try {
        await runAnalysis({
          namespace:    command.namespace,
          repo:         command.repo,
          cluster:      command.cluster ?? 'silver',
          envs:         command.envs    ?? 'dev,test,prod,tools',
          callerToken,
          onChunk: (text) => writeSseChunk(reply, text),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        writeSseChunk(reply, `\n\n**Analysis failed:** ${message}`)
        app.log.error({ err, command }, 'Resilience pipeline error')
      }

      writeSseDone(reply)
      reply.raw.end()
    }
  )
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function writeSseChunk(reply: FastifyReply, content: string) {
  const chunk = {
    choices: [{ delta: { role: 'assistant', content }, finish_reason: null, index: 0 }],
  }
  reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`)
}

function writeSseDone(reply: FastifyReply) {
  const done = { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] }
  reply.raw.write(`data: ${JSON.stringify(done)}\n\n`)
  reply.raw.write('data: [DONE]\n\n')
}

function sendSingleResponse(reply: FastifyReply, content: string) {
  reply.header('Content-Type', 'text/event-stream')
  writeSseChunk(reply, content)
  writeSseDone(reply)
  reply.raw.end()
  return reply
}

function helpText(): string {
  return [
    '## @bc-resilience — OCP Resilience Posture Analysis',
    '',
    '**Commands:**',
    '',
    '```',
    '# Full resilience posture report for a namespace',
    '@bc-resilience analyze namespace:<prefix>',
    '',
    '# With optional parameters',
    '@bc-resilience analyze namespace:f1b263 repo:bcgov-c/myapp cluster:silver envs:dev,prod',
    '```',
    '',
    '**Parameters:**',
    '| Parameter | Required | Default | Description |',
    '|-----------|----------|---------|-------------|',
    '| `namespace` | ✅ | — | OCP license plate prefix (e.g. `f1b263`) |',
    '| `repo` | ❌ | — | GitHub repo `owner/name` — cross-references Helm/k8s source |',
    '| `cluster` | ❌ | `silver` | Source cluster: `silver` \\| `gold` \\| `emerald` |',
    '| `envs` | ❌ | `dev,test,prod,tools` | Environment suffixes to analyse |',
    '',
    '**Report covers:** PodDisruptionBudgets · Scaling (HPA/VPA) · Health Probes ·',
    'Anti-affinity · Graceful Termination · QoS · Storage · Disruption Simulation',
    '',
    'Analysis takes 3–6 minutes. You will receive streaming progress, then a PDF link.',
  ].join('\n')
}
