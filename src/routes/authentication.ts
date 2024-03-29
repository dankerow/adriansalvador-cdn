import type { User } from '@/types'
import type { FastifyInstance, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

import { Route } from '@/structures'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

interface IBody {
  email: string
  password: string
}

export default class Authentication extends Route {
  constructor() {
    super({
      position: 2,
      path: '/authentication',
      middlewares: ['auth']
    })
  }

  async routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    app.decorateRequest('user', null)

    const createToken = (user: Omit<User, 'password'>) => {
      return jwt.sign(user, process.env.AUTH_SECRET, {
        expiresIn: '3h',
        issuer: 'adriansalvador',
        subject: user._id.toHexString()
      })
    }

    app.post<{
      Body: IBody
    }>('/login', {
      config: {
        auth: false
      },
      schema: {
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 10 }
          },
          required: ['email', 'password'],
          additionalProperties: false
        }
      }
    }, async (req, reply) => {
      const email = req.body.email
      const password = req.body.password

      const user = await app.database.getUserByEmail(email)
      if (!user) {
        return reply.code(401).send({ error: { message: 'Invalid credentials.' } })
      }

      const userCredentials = await app.database.getUserCredentials(user._id)

      const passwordVerification = await bcrypt.compare(password, userCredentials.password)
      if (!passwordVerification) {
        return reply.code(401).send({ error: { message: 'Invalid credentials.' } })
      }

      const token = createToken(user)

      /* await app.database.updateUser(user.id, {
        sessionToken: token
      }) */

      reply.setCookie('sessionId', req.session.sessionId, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      })

      return { token, user }
    })

    app.get('/verify', (req) => {
      return req.user
    })

    done()
  }
}
