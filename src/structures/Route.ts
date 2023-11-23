import type { FastifyInstance, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

export interface RouteOptions {
  position: number
  path: string
  middlewares?: any[]
}

export class Route {
  position: number
  path: string
  middlewares?: any[]

  constructor(options: RouteOptions) {
    this.position = options.position
    this.path = options.path
    this.middlewares = options.middlewares || []
  }

  routes(app: FastifyInstance, options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    done()
  }
}
