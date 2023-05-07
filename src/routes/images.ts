import { Route } from '../structures'
import { join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import sharp from 'sharp'

export default class Images extends Route {
  constructor() {
    super({
      position: 2,
      path: '/images'
    })
  }

  async routes(app, options, done) {
    const defaultFormat = 'webp'
    const allowedFormats = ['png', 'jpeg', 'webp']

    app.delete('/', async (req, res) => {
      if (!('ids' in req.body)) return res.code(400).send({ error: { status: 400, message: 'Missing "ids" field from request body.' } })

      if (!Array.isArray(req.body.ids)) return res.code(400).send({ error: { status: 400, message: 'An invalid ids was provided. The ids must be an array.' } })

      for (const id of req.body.ids) {
        const image = await app.database.getFileById(id, true)
        if (!image) return res.code(404).send({ error: { status: 404, message: `Album '${id}' not found` } })

        await app.database.deleteFile(image.id)

        const filePath = join('src', 'static', 'gallery', image.album.name, image.name)
        await unlink(filePath)
      }

      res.code(204)
    })

    app.get('/:name', async (req, reply) => {
      const name = req.params.name
      const width = req.query.width ? parseInt(req.query.width) : null
      const height = req.query.height ? parseInt(req.query.height) : null
      const fit = req.query.fit ?? null
      const format = allowedFormats.includes(req.query.format) ? req.query.format : defaultFormat

      const image = await app.database.findFileByName(name.toLowerCase())
      if (!image) return reply.code(404).send({ error: { status: 404, message: 'Image not found.' } })

      const album = await app.database.getAlbumById(image.albumId)

      const filePath = join('src', 'static', 'gallery', album.name, name)
      const buffer  = await sharp(filePath)
        .resize({
          width,
          height,
          fit
        })
        .toFormat(format)
        .toBuffer()

      return buffer
    })

    const authMiddleware = await import('../middlewares/auth.js')

    app.delete('/:id', {
      preHandler: [authMiddleware.default]
    }, async (req, reply) => {
      try {
        const image = await app.database.getFileById(req.params.id, true)
        if (!image) return reply.code(404).send({ error: { status: 404, message: 'Image not found.' } })

        const isImageCover = image.album.coverId === image.id
        if (isImageCover) {
          await app.database.updateAlbum(image.albumId, { coverId: null })
        }

        const isImageCoverFallback = image.album.coverFallbackId === image.id
        if (isImageCoverFallback) {
          const images = await app.database.getAlbumImages(image.albumId)
          const newCover = images[0]

          await app.database.updateAlbum(image.albumId, { coverId: newCover?.id ?? null })
        }

        const filePath = join('src', 'static', 'gallery', image.album.name, image.name)

        await app.database.deleteFile(image.id)

        await unlink(filePath)

        reply.code(204)
      } catch (error) {
        app.log.error(error.stack || error)
        return reply.code(500).send({ error: { status: 500, message: 'Something went wrong while deleting the image.' } })
      }
    })

    app.get('/:id/download', async (req, reply) => {
      const file = await app.database.getFileById(req.params.id, true)

      if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

      const album = await app.database.getAlbumById(file.albumId)

      const filePath = join('src', 'static', 'gallery', album.name, file.name)
      const buffer = await readFile(filePath)

      reply.header('Content-Disposition', `attachment; filename="${file.name}"`)
      reply.header('Content-Type', file.mimetype)

      return buffer
    })

    done()
  }
}
