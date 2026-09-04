import { Hono } from 'hono'
import { z } from 'zod'

const app = new Hono()

const healthResponseSchema = z.object({
  service: z.literal('fieldrep-os-api'),
  status: z.literal('ok'),
})

app.get('/api/v1/health', (c) => {
  const payload = healthResponseSchema.parse({
    service: 'fieldrep-os-api',
    status: 'ok',
  })

  return c.json(payload)
})

app.notFound((c) => c.json({ error: 'not_found' }, 404))

export default app
