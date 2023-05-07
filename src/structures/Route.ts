import type { FastifyInstance, FastifyServerOptions, DoneFuncWithErrOrRes } from 'fastify'

export interface RouteOptions {
  position: number
  path: string
}

export class Route {
  position: number
  path: string

  constructor(options: RouteOptions) {
    this.position = options.position
    this.path = options.path
  }

  routes(app: FastifyInstance, options: FastifyServerOptions, done: DoneFuncWithErrOrRes) {
    done()
  }
}
