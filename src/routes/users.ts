import type { User } from '@/types'
import type { FastifyInstance, FastifyReply, FastifyRequest, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

import { Route } from '@/structures'
import { generatePassword } from '@/utils'
import { ObjectId } from 'mongodb'
import bcrypt from 'bcrypt'

interface IParams {
  id: string
}

interface IBody {
  firstName: string
  lastName: string
  email: string
  role: string
  password: string
  newPassword: string
  user?: Omit<User, 'password'>
}

export default class Users extends Route {
  constructor() {
    super({
      position: 1,
      path: '/users'
    })
  }

  routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    const getUser = async (req: FastifyRequest<{ Params: IParams; Body: IBody }>, reply: FastifyReply) => {
      if (req.params.id.length > 100) return reply.status(404).send({ status: 404, message: 'The user you are looking for does not exist.' })
      if (req.params.id === '@me' && req.body.user) {
        return req.body.user
      }

      const user = await app.database.getUserById(req.params.id)

      if (!user) {
        return reply.status(404).send({ status: 404, message: 'The user you are looking for does not exist.' })
      }

      return req.body.user = user
    }

    app.get<{
      Querystring: {
        page: number
        limit: number
      }
    }>('/', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' }
          }
        }
      }
    }, async (req) => {
      const {
        page = 1,
        limit = 25
      } = req.query

      let users = await app.database.getUsersSorted()

      const pages = (userCount: number) => Math.ceil(userCount / limit)

      const count = users.length
      users = users.slice((page - 1) * limit, page * limit)

      return {
        data: users,
        count,
        pages: pages(count)
      }
    })

    app.post<{
      Body: IBody
    }>('/', {
      config: {
        rateLimit: {
          max: 5, timeWindow: 1000
        }
      },
      schema: {
        body: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' }
          }
        }
      }
    }, async (req, reply) => {
      const user = await app.database.getUserByEmail(req.body.email)
      if (user) return reply.code(409).send({ error: { status: 409, message: 'User already created.' } })

      const userId = new ObjectId()

      const metadata = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        role: req.body.role ?? 'user',
        avatar: '',
        createdAt: +new Date(),
        modifiedAt: +new Date()
      }

      const credentials = {
        email: req.body.email,
        password: generatePassword(16),
        createdAt: +new Date(),
        modifiedAt: +new Date()
      }

      console.warn('Credentials:', credentials.email, credentials.password)

      credentials.password = bcrypt.hashSync(credentials.password, 10)

      await app.database.insertUserMetadata({ _id: userId, ...metadata })
      await app.database.insertUserCredentials({ _id: userId, ...credentials })

      return { _id: userId, ...metadata }
    })

    app.get('/@me', {
      config: {
        rateLimit: { max: 5, timeWindow: 1000 }
      },
      preHandler: [getUser]
    }, (req) => {
      return req.body.user
    })

    app.post<{
      Params: IParams
      Body: IBody
    }>('/:id/password/update', {
      preHandler: [getUser]
    }, async (req, reply) => {
      const { password, newPassword } = req.body

      if (!password || !newPassword) return reply.status(400).send({ message: 'Invalid body provided' })
      if (password === newPassword) return reply.status(400).send({ message: 'Passwords have to be different' })

      const user = await app.database.getUserCredentialsWithFields(req.body.user._id, ['password'])

      const comparePassword = await bcrypt.compare(password, user?.password ?? '')
      if (!comparePassword) return reply.status(401).send({ message: 'Current password is incorrect' })

      if (newPassword.length < 6 || newPassword.length > 64) {
        return reply.status(400).send({ message: 'Password must have 6-64 characters' })
      }

      let hash: string
      try {
        hash = await bcrypt.hash(newPassword, 10)
      } catch (err) {
        req.log.error(err)
        return reply.status(401).send({ message: 'There was a problem processing your account' })
      }

      const currentTimestamp = +new Date()
      await app.database.updateUserCredentials(req.body.user._id,
        {
          password: hash,
          modifiedAt: currentTimestamp
        }
      )

      return { message: 'The password was changed successfully' }
    })

    done()
  }
}
