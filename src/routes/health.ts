import type { FastifyInstance, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

import { Route } from '../structures'

export default class Health extends Route {
  constructor() {
    super({
      position: 1,
      path: '/health'
    })
  }

  routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    app.get('/', async (req, reply) => {
      reply.headers('Cache-Control', [
        'private',
        'max-age=0',
        'no-cache',
        'no-store',
        'must-revalidate'
      ].join(', '))

      reply.headers('Expires', new Date(Date.now() - 1000).toUTCString())

      return {
        status: 'OK',
        latestCheck: Date.now()
      }
    })

    done()
  }
}
