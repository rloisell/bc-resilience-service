// src/lib/command-parser.ts — bc-resilience-service
// Parses @bc-resilience commands from Copilot Chat messages.
//
// Supported syntax:
//   @bc-resilience analyze namespace:f1b263 [repo:owner/name] [cluster:silver] [envs:dev,prod]
//   @bc-resilience help

export type AnalyzeCommand = {
  type:      'analyze'
  namespace: string
  repo?:     string
  cluster?:  string
  envs?:     string
}

export type HelpCommand    = { type: 'help' }
export type UnknownCommand = { type: 'unknown'; raw: string }
export type ParsedCommand  = AnalyzeCommand | HelpCommand | UnknownCommand

const VALID_CLUSTERS = new Set(['silver', 'gold', 'emerald'])

export function parseCommand(message: string): ParsedCommand {
  const cleaned = message
    .replace(/@bc-resilience\s*/gi, '')
    .trim()

  if (!cleaned || /^help$/i.test(cleaned)) {
    return { type: 'help' }
  }

  if (!/^analyze\b/i.test(cleaned)) {
    return { type: 'unknown', raw: cleaned }
  }

  const args   = cleaned.replace(/^analyze\s*/i, '')
  const params: Record<string, string> = {}
  const kvRegex = /(\w+):("([^"]+)"|([^\s]+))/g
  let match: RegExpExecArray | null
  while ((match = kvRegex.exec(args)) !== null) {
    params[match[1].toLowerCase()] = match[3] ?? match[4]
  }

  const namespace = params['namespace']
  const repo      = params['repo']
  const cluster   = params['cluster']

  if (!namespace || !/^[a-z0-9]{6}$/.test(namespace)) {
    return {
      type: 'unknown',
      raw:  `Invalid or missing namespace: "${namespace ?? ''}". Must be 6-character alphanumeric (e.g. f1b263).`,
    }
  }

  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return { type: 'unknown', raw: `Invalid repo format: "${repo}". Must be owner/name.` }
  }

  if (cluster && !VALID_CLUSTERS.has(cluster)) {
    return { type: 'unknown', raw: `Invalid cluster: "${cluster}". Must be: ${[...VALID_CLUSTERS].join(' | ')}` }
  }

  return {
    type:      'analyze',
    namespace,
    repo,
    cluster:   cluster as AnalyzeCommand['cluster'],
    envs:      params['envs'],
  }
}
