import 'dotenv/config'

import { readdir, readFile, stat } from 'fs/promises'
import { extname, join } from 'path'

import { Database } from '../src/managers'

import ExifReader from 'exifreader'
import { v4 as uuidv4 } from 'uuid'
import { imageHash } from 'image-hash'
import sharp from 'sharp'

const database = new Database()
database.connect()

const dir = join('src', 'static', 'gallery')

const generateThumbnail = async (filename, directory) => {
  const filePath = join(directory, filename)

  const file = await readFile(filePath)
  const ext = extname(filename).toLowerCase()
  const output = `${filename.slice(0, -ext.length)}.webp`

  await sharp(file)
    .resize(64, 64)
    .toFormat('webp')
    .toFile(join('src', 'static', 'thumbs', 'square', output))
  await sharp(file)
    .resize(225)
    .toFormat('webp')
    .toFile(join('src', 'static', 'thumbs', output))
}

const loader = async (directory) => {
  const folders = await readdir(directory);
  console.log(directory)

  if (folders.length > 0) {
    for (let i = 0; i < folders.length; i++) {
      const fileOrDirName = folders[i]
      const stats = await stat(join(directory, fileOrDirName))

      if (stats.isDirectory()) {
        await loader(join(directory, fileOrDirName))
      } else {
        const folderName = directory.slice((directory.lastIndexOf('\\') + 1) - directory.length)
        let file = await database.findFileByName(fileOrDirName.toLowerCase())

        if (!file) {
          file = {
            id: uuidv4(),
            name: fileOrDirName,
            extname: fileOrDirName.slice(fileOrDirName.lastIndexOf('.') - fileOrDirName.length),
            tags: null,
            type: null,
            hash: null,
            size: null,
            createdAt: +new Date(),
            modifiedAt: +new Date()
          }

          const fileBuffer = await readFile(join(directory, fileOrDirName))
          file.tags = ExifReader.load(fileBuffer, { expanded: true })
          file.type = file.tags.format?.value
          file.size = Buffer.byteLength(fileBuffer)

          imageHash({
            data: fileBuffer
          }, 16, true, (error, data) => {
            if(error) throw error;
            file.hash = data
          });

          await generateThumbnail(fileOrDirName, directory)

          await database.insertFile(file)

          // console.log(`${fileOrDirName}: Inserted in database ✅`)

          let album = await database.findAlbumByName(folderName.toLowerCase())
          if (!album) {
            album = await database.insertAlbum({
              id: uuidv4(),
              name: folderName,
              nsfw: false,
              hidden: false,
              createdAt: +new Date(),
              modifiedAt: +new Date()
            })
          }

          await database.updateFile(file.id, { albumId: album.id })
          await database.updateAlbum(album.id, { modifiedAt: +new Date() })

          // console.log(`${fileOrDirName}: Successfully updated ✅`)
        }

        if (!file.albumId) {
          let album = await database.findAlbumByName(folderName.toLowerCase())
          if (!album) {
            album = await database.insertAlbum({
              id: uuidv4(),
              name: folderName,
              nsfw: false,
              hidden: false,
              createdAt: +new Date(),
              modifiedAt: +new Date()
            })
          }

          await database.updateFile(file.id, { albumId: album.id })
          await database.updateAlbum(album.id, { modifiedAt: +new Date() })

          console.log(`${fileOrDirName}: Successfully updated ✅`)
        }
      }
    }
  }
}

await loader(dir)
