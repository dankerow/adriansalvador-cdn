import type { Server } from '@/structures'
import { Task } from '@/structures'

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
      const cover = album.cover ? await this.database.getFileById(album.cover._id) : null

      album.coverId = cover?._id ?? null

      const files = await this.database.getAlbumFiles(album._id)
      if (!album.coverFallbackId || album.coverFallbackId && files.length > 0 && album.coverFallbackId.toString() !== files[0]._id.toString()) {

        await this.database.updateAlbum(album._id, { coverFallbackId: files.length > 0 ? files[0]._id : null })
      }

      await this.database.updateAlbum(album._id, { coverId: album.coverId })
    }
  }
}
