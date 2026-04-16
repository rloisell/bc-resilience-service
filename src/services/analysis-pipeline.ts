// src/services/analysis-pipeline.ts — bc-resilience-service
// Orchestrates: Collect → Analyse → Render → Upload
// Ryan Loisell — Developer / Architect | GitHub Copilot | April 2026

import { execFile }    from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join }        from 'node:path'
import { tmpdir }      from 'node:os'
import { promisify }   from 'node:util'
import { verifyRepoAccess } from '../lib/github.js'
import { streamAnalysis }   from './analyzer.js'
import { renderPdf }        from './renderer.js'
import { uploadArtifact }   from './uploader.js'

const execFileAsync = promisify(execFile)

export interface AnalysisPipelineOptions {
  namespace:    string
  repo?:        string
  cluster:      string
  envs:         string
  callerToken?: string
  onChunk:      (text: string) => void
}

export async function runAnalysis(opts: AnalysisPipelineOptions): Promise<void> {
  const { namespace, repo, cluster, envs, callerToken, onChunk } = opts

  // ── Access check (only when a repo is provided) ───────────────────────────
  if (repo && callerToken) {
    onChunk(`Verifying access to \`${repo}\`...`)
    const hasAccess = await verifyRepoAccess(repo, callerToken)
    if (!hasAccess) {
      throw new Error(
        `You do not have read access to \`${repo}\`. ` +
        'Ensure the bc-resilience GitHub App is installed on that repository.'
      )
    }
    onChunk(' ✓\n\n')
  }

  // ── Scratch directory ──────────────────────────────────────────────────────
  const workDir   = process.env.WORK_DIR ?? join(tmpdir(), 'bc-resilience-work')
  const jobDir    = join(workDir, `${namespace}-${Date.now()}`)
  const reportDir = join(jobDir, 'report')
  await mkdir(jobDir,    { recursive: true })
  await mkdir(reportDir, { recursive: true })

  const toolkitPath = process.env.TOOLKIT_PATH ?? './submodules/ocp-resilience-toolkit'

  // ── Stage 1: Collect ───────────────────────────────────────────────────────
  onChunk(`\n## Stage 1 — Collecting namespace data\n\n`)
  onChunk(`Scanning \`${namespace}\` on **${cluster}** (envs: ${envs})...\n`)

  const collectScript = join(toolkitPath, 'collect', 'collect.sh')
  const collectArgs   = [
    '--namespace', namespace,
    '--cluster',   cluster,
    '--envs',      envs,
    '--output',    join(jobDir, 'working'),
    ...(repo ? ['--repo', repo] : []),
  ]

  const ocToken = cluster === 'silver'
    ? process.env.OC_SILVER_TOKEN
    : cluster === 'gold'
      ? process.env.OC_GOLD_TOKEN
      : process.env.OC_EMERALD_TOKEN

  if (!ocToken) {
    onChunk(
      '> ⚠️ No OCP token configured for this cluster. ' +
      'Namespace data will be empty — analysis will be based on GitHub repo only.\n\n'
    )
  } else {
    try {
      await execFileAsync('bash', [collectScript, ...collectArgs], {
        env: { ...process.env, KUBECONFIG: '' },
        timeout: (parseInt(process.env.JOB_TIMEOUT_MINUTES ?? '10') * 60 * 1000) / 2,
      })
      onChunk('Collection complete. ✓\n\n')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onChunk(`> ⚠️ Collection encountered errors: ${msg}\n> Proceeding with partial data.\n\n`)
    }
  }

  // ── Stage 2: Analyse ───────────────────────────────────────────────────────
  onChunk(`## Stage 2 — AI Resilience Analysis\n\n`)

  const manifestSummaryPath = join(jobDir, 'working', 'manifest-summary.md')
  let manifestSummary = ''
  try {
    manifestSummary = await readFile(manifestSummaryPath, 'utf-8')
  } catch {
    manifestSummary = `# Resilience Collection Summary\n\nNamespace: ${namespace}\nNo OCP data collected.\n`
  }

  const sectionGuidePath = join(toolkitPath, 'templates', 'report-sections.md')
  const sectionGuide     = await readFile(sectionGuidePath, 'utf-8').catch(() => '')

  const appName    = namespace.toUpperCase()
  const reportFile = join(reportDir, `${appName}-Resilience-Report.md`)

  const reportChunks: string[] = []
  await streamAnalysis({
    manifestSummary,
    sectionGuide,
    namespace,
    repo,
    cluster,
    callerToken,
    onChunk: (text) => { onChunk(text); reportChunks.push(text) },
  })

  await writeFile(reportFile, reportChunks.join(''), 'utf-8')

  // ── Stage 3: Render + Upload ───────────────────────────────────────────────
  onChunk(`\n\n## Stage 3 — Rendering PDF\n\n`)

  try {
    await renderPdf({
      inputMd:      reportFile,
      outputDir:    reportDir,
      cssPath:      join(toolkitPath, 'templates', 'style', 'report-style.css'),
      renderScript: join(toolkitPath, 'render', 'render.sh'),
    })
    onChunk('PDF rendered. ✓\n\n')
  } catch (err) {
    onChunk(`> ⚠️ PDF rendering failed: ${err instanceof Error ? err.message : err}\n\n`)
  }

  if (callerToken && repo) {
    try {
      const pdfFile = join(reportDir, `${appName}-Resilience-Report.pdf`)
      const artifactUrl = await uploadArtifact({
        repo,
        pdfPath:      pdfFile,
        markdownPath: reportFile,
        appName,
        callerToken,
        releaseSuffix: 'resilience-report',
      })
      onChunk(
        `---\n\n✅ **Analysis complete.**\n\n` +
        `📄 [Download PDF Report](${artifactUrl})\n\n` +
        `Generated: ${new Date().toISOString()}\n`
      )
    } catch {
      onChunk(`---\n\n✅ **Analysis complete.** (PDF upload skipped.)\n\nGenerated: ${new Date().toISOString()}\n`)
    }
  } else {
    onChunk(`---\n\n✅ **Analysis complete.**\n\nGenerated: ${new Date().toISOString()}\n`)
  }
}
