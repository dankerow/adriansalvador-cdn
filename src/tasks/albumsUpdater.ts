import type { Server } from '../structures'
import { Task } from '../structures'

export default class albumsUpdater extends Task {
  constructor(server: Server) {
    super({
      name: 'Update Albums',
      interval: '0 0 * * *'
    })

    Object.assign(this, server)
  }

  async execute() {
    const albums = await this.database.getAlbums()

    for (const album of albums) {
      const cover = album.cover ? await this.database.getFileById(album.cover) : null

      album.coverId = cover?.id ?? null

      if (!album.coverFallbackId) {
        const files = await this.database.getAlbumFiles(album.id)

        await this.database.updateAlbum(album.id, { coverFallbackId: files.length > 0 ? files[0].id : null })
      }

      await this.database.updateAlbum(album.id, { coverId: album.coverId })
    }
  }
}
