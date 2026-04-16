// src/index.ts — bc-resilience-service
// Ryan Loisell — Developer / Architect | GitHub Copilot | April 2026

import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { extensionRoute } from './routes/copilot.js'
import { healthRoute }    from './routes/health.js'

const app = Fastify({
  logger: {
    level:     process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
  },
})

await app.register(sensible)
await app.register(healthRoute)
await app.register(extensionRoute, { prefix: '/api/v1' })

const port = parseInt(process.env.PORT ?? '8080', 10)

try {
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`bc-resilience-service listening on 0.0.0.0:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
