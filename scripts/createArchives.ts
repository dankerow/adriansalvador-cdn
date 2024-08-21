import 'dotenv/config'

import { createWriteStream } from 'node:fs'
import { join } from 'node:path'

import archiver from 'archiver'

import { Database } from '@/services'

const database = new Database()
await database.connect()

const dirGallery = join('src', 'static', 's-files')
const dirArchives = join('src', 'static', 'archives')

const loader = async (directory: string) => {
  const albums = await database.getAlbums()

  if (albums.length > 0) {
    for (let i = 0; i < albums.length; i++) {
      const album = albums[i]

      const output = createWriteStream(join(dirArchives, album.name) + '.zip')
      const archive = archiver('zip', {
        zlib: { level: 9 }
      })

      output.on('close', function () {
        console.log(`${album.name} (${album._id.toString()} - ${archive.pointer()} total bytes`)
        console.log('archiver has been finalized and the output file descriptor has closed.')
      })

      archive.on('warning', function (err) {
        if (err.code === 'ENOENT') {
          console.log(err)
        } else {
          throw err
        }
      })

      archive.on('error', function (err) {
        throw err
      })

      archive.pipe(output)

      const files = await database.getAlbumFiles(album._id)
      for (const file of files) {
        archive.file(join(directory, file.name), { name: file.name })
      }

      await archive.finalize()

      if (i + 1 === albums.length) return process.exit(1)
    }
  }
}

await loader(dirGallery)
