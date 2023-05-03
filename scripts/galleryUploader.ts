import 'dotenv/config'

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'

import { Database } from '../src/managers'

const database = new Database()
await database.connect()

const dir = join('src', 'static', 'gallery')

const loader = async (directory) => {
  const folders = await readdir(directory)
  console.log('Folder', directory)

  if (folders.length > 0) {
    for (let i = 0; i < folders.length; i++) {
      const fileOrDirName = folders[i]
      const stats = await stat(join(directory, fileOrDirName))

      if (stats.isDirectory()) {
        await loader(join(directory, fileOrDirName))
      } else {
        const folderName = directory.slice((directory.lastIndexOf('\\') + 1) - directory.length)

        let album = await database.findAlbumByName(folderName.toLowerCase())
        if (!album) {
          album = {
            id: crypto.randomUUID(),
            name: folderName,
            coverId: null,
            coverFallbackId: null,
            draft: false,
            nsfw: false,
            hidden: false,
            favorite: false,
            featured: false,
            postedAt: null,
            createdAt: +new Date(),
            modifiedAt: +new Date()
          }

          await database.insertAlbum(album)

          console.log(`${folderName}: Album successfully created ✅`)
        }

        let file = await database.findFileByName(fileOrDirName.toLowerCase())
        if (!file) {
          file = {
            id: crypto.randomUUID(),
            name: fileOrDirName,
            extname: fileOrDirName.slice(fileOrDirName.lastIndexOf('.') - fileOrDirName.length),
            type: null,
            size: null,
            albumId: album.id,
            createdAt: +new Date(),
            modifiedAt: +new Date()
          }

          const fileBuffer = await readFile(join(directory, fileOrDirName))
          const fileMetadata = await sharp(fileBuffer).metadata()
          file.type = fileMetadata.format
          file.height = fileMetadata.height
          file.width = fileMetadata.width
          file.size = Buffer.byteLength(fileBuffer)

          await database.insertFile(file)

          console.log(`${fileOrDirName}: File successfully created ✅`)
        }

        if (file.albumId !== album.id) {
          await database.updateFile(file.id, {
            albumId: album.id,
            modifiedAt: +new Date()
          })

          console.log(`${fileOrDirName}: File successfully updated ✅`)
        }

        if (!album.coverFallbackId && i === 0) {
          await database.updateAlbum(album.id, {
            coverFallbackId: file.id,
            modifiedAt: +new Date()
          })

          console.log(`${fileOrDirName}: Album successfully updated ✅`)
        }
      }
    }
  }
}

await loader(dir)
