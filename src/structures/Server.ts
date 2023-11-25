import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
import { readdir, stat } from 'fs/promises'

import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import sentry from '@immobiliarelabs/fastify-sentry'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fstatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'

import { Database } from '../managers'
import { Logger as logger } from '../utils'
import type { Route } from './Route'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class Server {
  public app: FastifyInstance
  private readonly routers: Array<Route>
  private tasks: Array<() => Promise<void>>
  public logger: logger
  public database: Database

  constructor() {
    this.app = Fastify({
      ignoreTrailingSlash: true,
      trustProxy: true,
      logger: true
    })

    this.routers = []
    this.tasks = []

    this.logger = logger
    this.database = new Database()
  }

  public async setup(): Promise<void> {
    await this.app.register(helmet, {
      crossOriginResourcePolicy: false
    })

    const mainAppBaseURL = process.env.NODE_ENV === 'production' ? process.env.MAIN_APP_BASE_URL : process.env.MAIN_APP_BASE_URL_DEV
    const manageAppBaseURL = process.env.NODE_ENV === 'production' ? process.env.MANAGE_APP_BASE_URL : process.env.MANAGE_APP_BASE_URL_DEV
    const apiBaseURL = process.env.NODE_ENV === 'production' ? process.env.API_BASE_URL : process.env.API_BASE_URL_DEV

    await this.app.register(cors, {
      origin: [mainAppBaseURL, manageAppBaseURL, apiBaseURL],
      allowedHeaders: ['Accept', 'Origin', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Content-Type']
    })

    await this.app.register(multipart, {
      limits: {
        fileSize: 16777216
      }
    })

    await this.app.register(rateLimit,
      {
        global : false,
        max: 100,
        keyGenerator: (req) => req.headers.authorization || req.ip,
        errorResponseBuilder: () => ({ status: 429, message: 'Too many requests, please you need to slow down, try again later.' })
      })

    this.app.setErrorHandler((error, req, reply) => {
      logger.error(`Something went wrong.\nError: ${error.stack || error}`)

      reply.code(500).send({
        success: false,
        status: 500,
        message: 'Oops! Something went wrong. Try again later.'
      })
    })

    await this.app.register(sentry, {
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 1.0
    })

    this.app.register(fstatic, {
      root: join(__dirname, '..', 'static'),
      preCompressed: true,
      immutable: true,
      maxAge: '1y',
      etag: true,
      lastModified: true,
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
      }
    })

    await this.initializeDatabase()
  }

  /**
   * @description A method to create a connection to the database
   * @private
   * @returns void
   */
  private async initializeDatabase(): Promise<void> {
    await this.database.connect()
    this.app.decorate('database', this.database)

    this.app.addHook('onClose', async (instance, done) => {
      await this.database.close()
      done()
    })

    process.send({ type: 'log', content: 'Successfully connected to database.' })

    await this.loadRoutes(join('src', 'routes'))
  }

  /**
   * @description Loads the routes on the HTTP Server instance
   * @param directory The path to the routes directory
   * @param prefix Prefix used load the routes following the file structure
   * @returns void
   * @private
   */
  private async loadRoutes(directory: string, prefix: string | boolean = false): Promise<void> {
    const routes = await readdir(directory)

    if (routes.length > 0) {
      for (let i = 0; i < routes.length; i++) {
        const stats = await stat(join(directory, routes[i]))

        if (stats.isDirectory()) {
          await this.loadRoutes(join(directory, routes[i]), routes[i].replace('/', ''))
          return
        } else {
          const routeFile = relative(__dirname, join(directory, routes[i])).replaceAll('\\', '/')
          const routeImport = await import(routeFile)
          const RouteClass = routeImport.default
          const route = new RouteClass(this)

          if (prefix) {
            route.path = `/${prefix}${route.path}`
          }

          this.routers.push(route)
        }

        if (i + 1 === routes.length) {
          await this.registerRoutes()
        }
      }
    } else {
      await this.loadTasks(join('src', 'tasks'))
    }
  }

  /**
   * @description Registers the routes on the Fastify instance
   * @private
   * @returns void
   */
  private async registerRoutes(): Promise<void> {
    this.routers.sort((a, b) => {
      if (a.position > b.position) return 1
      if (b.position > a.position) return -1
      return 0
    })

    for (let i = 0; i < this.routers.length; i++) {
      const route = this.routers[i]

      const middlewares = []
      if (route.middlewares?.length) {
        for (const middleware of route.middlewares) {
          const importedMiddlewarePath = relative(__dirname, join('src', 'middlewares', middleware)).replaceAll('\\', '/')
          const importedMiddleware = await import(importedMiddlewarePath)
          middlewares.push(importedMiddleware.default)
        }
      }

      await this.app.register((app, options, done) => {
        app.addHook('onRoute', (routeOptions) => {
          if (routeOptions.config && routeOptions.config.auth === false) return

          routeOptions.preHandler = [...(routeOptions.preHandler || []), ...middlewares]

          return
        })

        route.routes(app, options, done)
      }, { prefix: route.path })

      if (i + 1 === this.routers.length) {
        process.send({ type: 'log', content: `Loaded ${this.routers.length} routes.` })

        await this.loadTasks(join('src', 'tasks'))
      }
    }
  }

  private async loadTasks(directory: string) {
    const start = process.hrtime()
    const tasks = await readdir(directory)

    for (const task of tasks) {
      try {
        const jobFile = relative(__dirname, join(directory, task)).replaceAll('\\', '/')
        const jobImport = await import(jobFile)
        const JobClass = jobImport.default
        const job = new JobClass(this)

        this.tasks.push(job)
      } catch (error) {
        process.send({ type: 'error', content: `Unable to load task ${task}: ${error.stack || error}` })
      }
    }

    const end = process.hrtime(start)
    process.send({ type: 'log', content: `Loaded ${this.tasks.length}/${tasks.length} tasks (took ${end[1] / 1000000}ms)` })

    this.listen()
  }

  private listen(): void {
    this.app.listen({ port: parseInt(process.env.PORT) }, (error, address) => {
      if (error) return process.send({ type: 'error', content: error.stack || error })
      return process.send({ type: 'log', content: `Running on ${address}` })
    })
  }
}
