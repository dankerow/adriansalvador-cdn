import type { FastifyInstance, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

import { Route } from '@/structures'

export default class Sitemap extends Route {
  constructor() {
    super({
      position: 2,
      path: '/sitemap'
    })
  }

  routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    app.get('/', async () => {
      const routes: object[] = []
      const albums = await app.database.getAlbums({ sort: { name: 1 } })

      for (const album of albums) {
        const images = await app.database.getAlbumFiles(album._id)
        const cdnURL = process.env.CDN_BASE_URL

        routes.push({
          loc: `/albums/${album._id}`,
          changefreq: 'monthly',
          lastmod: new Date(album.modifiedAt),
          priority: 0.8,
          images: images.map(image => ({ loc: `${cdnURL}/${album.name}/${image.name}` }))
        })
      }

      return routes
    })

    done()
  }
}
