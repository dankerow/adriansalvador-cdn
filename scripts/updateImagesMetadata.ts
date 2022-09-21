import 'dotenv/config'

import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'

import { Database } from '../src/managers'

import sharp from 'sharp'

const database = new Database()
await database.connect()

const dir = join('src', 'static', 'gallery')

const loader = async (directory) => {
  const folders = await readdir(directory);
  console.log('Folder', directory)

  if (folders.length > 0) {
    for (let i = 0; i < folders.length; i++) {
      const fileOrDirName = folders[i]
      const stats = await stat(join(directory, fileOrDirName))

      if (stats.isDirectory()) {
        await loader(join(directory, fileOrDirName))
      } else {
        let file = await database.findFileByName(fileOrDirName)

        const fileBuffer = await readFile(join(directory, fileOrDirName))
        const fileMetadata = await sharp(fileBuffer).metadata()
        file.type = fileMetadata.format
        file.metadata = {
          height: fileMetadata.height,
          width: fileMetadata.width
        }

        await database.mongo
          .collection('files')
          .updateOne({ id: file.id }, { $unset: { hash: '' } });

        await database.updateFile(file.id, { type: file.type, metadata: file.metadata, modifiedAt: +new Date() })

        console.log(`${fileOrDirName}: Successfully updated ✅`)
      }
    }
  }
}

await loader(dir)
