import { Route } from '../structures'
import { join } from 'path'
import sharp from 'sharp'

export default class Albums extends Route {
  constructor() {
    super({
      position: 2,
      path: '/albums'
    });
  }

  routes(app, options, done) {
    const getAlbum = async (req, reply) => {
      if (!req.params.id) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } });

      const album = await app.database.getAlbumById(req.params.id);

      if (!album) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } });

      return album;
    }

    app.get('/random', { config: { rateLimit: { max: 15, timeWindow: 15 * 1000 } } }, async (req) => {
      const excluded = ['c10a66f4-4b18-427f-81b5-f6213d38cdc1', '34b7cce4-bb76-4e31-9dd7-3ccde004db6a', '4ac306ea-bcec-41b6-b942-1938296a01d6', 'ac8ae991-fce0-4b2d-8a0b-a3a6395d6f6d', '64fe4ee3-ab8b-4712-bfed-a46fe6ac538d']
      const images = await app.database.getRandomImages(50, excluded)

      for (let image of images) {
        const host = `http://${req.headers.host}`
        const album = await app.database.getAlbumById(image.albumId)

        image.album = album
        image.url = `${host}/gallery/${album.name}/${image.name}`
        image.thumb = {
          url: `${host}/images/${image.name}`,
          width: 225,
          height: null,
          sizes: {
            square: {
              url: `${host}/images/${image.name}`,
              width: 64,
              height: 64
            }
          }
        }

        const filePath = join('src', 'static', 'gallery', album.name, image.name)

        const imageTrans = await sharp(filePath)
          .resize(225)
          .toBuffer()

        const imageMetadata = await sharp(imageTrans).metadata()
        image.thumb.height = imageMetadata.height
      }

      return images
    })

    app.get('/:id', async (req, reply) => {
      const album = await getAlbum(req, reply)

      const page = req.query.page ? parseInt(req.query.page) : 1
      const limit = req.query.limit ? parseInt(req.query.limit) : 50
      const pages = (imageCount) => Math.ceil(imageCount / limit);

      let images = await app.database.getAlbumFiles(album.id)
      const fileCount = images.length
      images = images.slice((page - 1) * limit, page * limit);

      for (let image of images) {
        const host = `http://${req.headers.host}`

        image.url = `${host}/gallery/${album.name}/${image.name}`
        image.thumb = {
          url: `${host}/images/${image.name}`,
          width: 225,
          height: null,
          sizes: {
            square: {
              url: `${host}/images/${image.name}`,
              width: 64,
              height: 64
            }
          }
        }

        const filePath = join('src', 'static', 'gallery', album.name, image.name)

        const imageTrans = await sharp(filePath)
          .resize(225)
          .toBuffer()

        const imageMetadata = await sharp(imageTrans).metadata()
        image.thumb.height = imageMetadata.height
      }

      reply.code(200).send({
        album,
        images,
        fileCount,
        pages: pages(fileCount)
      })
    });

    app.get('/:id/download', async (req, reply) => {
      const album = await getAlbum(req, reply)

      return reply.download(`/archives/${album.name}.zip`)
    });

    done();
  }
}
