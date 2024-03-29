import type { FastifyInstance } from 'fastify'
import type { Route } from './Route'

import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdir, stat } from 'node:fs/promises'

import Fastify from 'fastify'
import sentry from '@immobiliarelabs/fastify-sentry'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import session from '@fastify/session'
import fstatic from '@fastify/static'
import jwt from 'jsonwebtoken'

import { Database } from '@/services'
import { Logger } from '@/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class Server {
  public app: FastifyInstance
  private readonly routers: Array<Route>
  private tasks: Array<() => Promise<void>>
  public logger: Logger
  public database: Database

  constructor() {
    this.app = Fastify({
      ignoreTrailingSlash: true,
      trustProxy: true,
      logger: true
    })

    this.routers = []
    this.tasks = []

    this.logger = new Logger()
    this.database = new Database()
  }

  /**
   * @description Sets up the application by registering middleware, error handler, and initializing the database.
   * @returns {Promise<void>} A promise that resolves when the setup is complete.
   */
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

    this.app.register(cookie, {
      secret: process.env.COOKIE_SECRET
    })

    this.app.register(session, {
      secret: process.env.SESSION_SECRET,
      cookie: {
        httpOnly: true
      }
    })

    await this.app.register(multipart, {
      limits: {
        fileSize: 16777216
      }
    })

    await this.app.register(rateLimit,
      {
        global: true,
        ban: 3,
        max: 100,
        keyGenerator: (req) => {
          if (req.headers.authorization) {
            const token = req.headers.authorization.split(' ')[1]
            try {
              const decoded = jwt.verify(token, process.env.AUTH_SECRET) as { id: string }

              return decoded.id
            } catch (err) {
              return req.ip
            }
          }

          return req.ip
        },
        errorResponseBuilder: () => ({ status: 429, message: 'Too many requests, please you need to slow down, try again later.' })
      })

    this.app.setErrorHandler((error, req, reply) => {
      process.send({ type: 'error', content: `Something went wrong.\nError: ${error.stack || error}` })

      const statusCode = error.statusCode || 500

      reply.code(statusCode).send({
        error: {
          status: statusCode,
          message: error.message ?? 'Oops! Something went wrong. Try again later.'
        }
      })
    })

    await this.app.register(sentry, {
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 1.0
    })

    this.app.register(fstatic, {
      root: join(__dirname, '..', 'static'),
      immutable: true,
      maxAge: '1y',
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
      }
    })

    await this.initializeDatabase()
    await this.loadRoutes(join('src', 'routes'))
    await this.registerRoutes()
    await this.loadTasks(join('src', 'tasks'))
    this.listen()
  }

  /**
   * @description A method to create a connection to the database
   * @private
   * @returns Promise<void>
   */
  private async initializeDatabase(): Promise<void> {
    await this.database.connect()

    this.app.decorate('database', this.database)

    this.app.addHook('onClose', async () => {
      await this.database.close()
    })

    process.send({ type: 'log', content: 'Successfully connected to database.' })
  }

  /**
   * @description Loads the routes on the HTTP Server instance
   * @param directory The path to the routes directory
   * @param prefix Prefix used load the routes following the file structure
   * @private
   * @returns Promises<void>
   */
  private async loadRoutes(directory: string, prefix: string | boolean = false): Promise<void> {
    const routes = await readdir(directory)

    for (const route of routes) {
      const stats = await stat(join(directory, route))

      if (stats.isDirectory()) {
        await this.loadRoutes(join(directory, route), route.replace('/', ''))

        continue
      }

      const routeFile = relative(__dirname, join(directory, route)).replaceAll('\\', '/')
      const routeImport = await import(routeFile)
      const RouteClass = routeImport.default
      const routeInstance = new RouteClass(this)

      if (prefix) {
        routeInstance.path = `/${prefix}${routeInstance.path}`
      }

      this.routers.push(routeInstance)
    }
  }

  /**
   * @description Loads the specified middlewares dynamically.
   * @param {string[]} middlewares - The names of the middlewares to load.
   * @return {Promise<any[]>} - A promise that resolves with an array of imported middlewares.
   */
  private async loadMiddlewares(middlewares: string[]): Promise<any[]> {
    const importedMiddlewares = []

    for (const middleware of middlewares) {
      const importedMiddlewarePath = relative(__dirname, join('src', 'middlewares', middleware)).replaceAll('\\', '/')
      const importedMiddleware = await import(importedMiddlewarePath)
      importedMiddlewares.push(importedMiddleware.default)
    }

    return importedMiddlewares
  }

  /**
   * @description Registers the routes on the Fastify instance
   * @private
   * @returns Promise<void>
   */
  private async registerRoutes(): Promise<void> {
    this.routers.sort((a, b) => a.position - b.position)

    for (const router of this.routers) {
      const middlewares = router.middlewares?.length ? await this.loadMiddlewares(router.middlewares) : []

      await this.app.register((app, options, done) => {
        app.addHook('onRoute', (routeOptions) => {
          if (routeOptions.config && routeOptions.config.auth === false) return

          if (middlewares.length > 0) {
            routeOptions.preHandler = [...(routeOptions.preHandler || []), ...middlewares]
          }

          return
        })

        router.routes(app, options, done)
      }, { prefix: router.path })
    }

    process.send({ type: 'log', content: `Loaded ${this.routers.length} routes.` })
  }

  /**
   * @description Loads the tasks on the HTTP Server instance
   * @param directory
   * @private
   */
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
  }

  /**
   * @description Listens for incoming requests on the specified port.
   * @return {void}
   */
  private listen(): void {
    this.app.listen({ port: parseInt(process.env.PORT) }, (error, address) => {
      if (error) return process.send({ type: 'error', content: error.stack || error })
      return process.send({ type: 'log', content: `Running on ${address}` })
    })
  }
}
