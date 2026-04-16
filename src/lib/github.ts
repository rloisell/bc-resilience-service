// src/lib/github.ts — bc-resilience-service
import { Octokit } from '@octokit/rest'

export async function verifyRepoAccess(repo: string, token: string): Promise<boolean> {
  const [owner, repoName] = repo.split('/')
  const octokit = new Octokit({ auth: token })
  try {
    await octokit.repos.get({ owner, repo: repoName })
    return true
  } catch {
    return false
  }
}
