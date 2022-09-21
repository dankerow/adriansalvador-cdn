import { Route } from '../structures'
import { join } from 'path'
import sharp from 'sharp'

export default class Images extends Route {
  constructor() {
    super({
      position: 2,
      path: '/images'
    });
  }

  routes(app, options, done) {
    const defaultFormat = 'webp'
    const allowedFormats = ['png', 'jpeg', 'webp']

    app.get('/:name', async (req, reply) => {
      const name = req.params.name
      const width = req.query.width ? parseInt(req.query.width) : null
      const height = req.query.height ? parseInt(req.query.height) : null
      const fit = req.query.fit ?? null
      const format = allowedFormats.includes(req.query.format) ? req.query.format : defaultFormat

      const image = await app.database.findFileByName(name)
      if (!image) return reply.code(404).send({ error: { status: 404, message: 'Image not found.' } })

      const album = await app.database.getAlbumById(image.albumId)

      const filePath = join('src', 'static', 'gallery', album.name, name)
      const buffer  = await sharp(filePath, {
        fit
      })
        .resize({
          width,
          height,
          fit
        })
        .toFormat(format)
        .toBuffer()

      return buffer
    });

    done();
  }
}
