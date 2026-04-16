// src/services/renderer.ts — bc-resilience-service
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface RenderOptions {
  inputMd:      string
  outputDir:    string
  cssPath:      string
  renderScript: string
}

export async function renderPdf(opts: RenderOptions): Promise<void> {
  const { inputMd, outputDir, cssPath, renderScript } = opts
  await execFileAsync('bash', [renderScript, '--input', inputMd, '--output', outputDir, '--css', cssPath], {
    timeout: 120_000,
  })
}
