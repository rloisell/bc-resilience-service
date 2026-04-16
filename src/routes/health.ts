// src/routes/health.ts — bc-resilience-service
import type { FastifyInstance } from 'fastify'

export async function healthRoute(app: FastifyInstance) {
  app.get('/health/live',  async (_req, reply) => reply.send({ status: 'ok' }))
  app.get('/health/ready', async (_req, reply) =>
    reply.send({ status: 'ok', version: process.env.npm_package_version ?? 'unknown' }))
}
