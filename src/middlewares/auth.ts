import jwt from 'jsonwebtoken'

export default function (req, res, next) {
  if (!req.headers.authorization) return res.status(401).send({ message: 'No authorization header provided' })

  const token = req.headers.authorization.split(' ')[1]
  if (!token) return res.status(401).send({ message: 'No authorization header provided' })

  jwt.verify(token, process.env.AUTH_SECRET, async (error, decoded) => {
    if (error) return res.status(401).send({ message: 'Invalid token' })

    const id = decoded?.sub ?? null
    if (!id) return res.status(401).send({ message: 'Invalid authorization' })

    const user = await this.database.getUserById(id)
    if (!user) return res.status(401).send({ message: 'User doesn\'t exist' })

    req.user = user
    next()
  })
}
