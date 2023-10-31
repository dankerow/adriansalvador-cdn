import type { AlbumFile } from '../../types'

import { Route } from '../structures'
import { join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import sharp from 'sharp'

const pump = promisify(pipeline)

export default class Files extends Route {
  constructor() {
    super({
      position: 2,
      path: '/files',
      middlewares: ['auth']
    })
  }

  async routes(app, _options, done) {
    const defaultFormat = 'webp'
    const allowedFormats = ['png', 'jpeg', 'webp']

    app.post('/upload', async (req, reply) => {
      const data = await req.file()
      if (!data) {
        return reply.code(400).send({ error: { status: 400, message: 'No file was uploaded.' } })
      }

      const file = await app.database.findAlbumByName(data.filename.toLowerCase())
      if (file) {
        return reply.code(409).send({ error: { status: 409, message: 'A file with this name already exists.' } })
      }

      const path = join('src', 'static', 's-files', data.filename)

      await pump(data.file, createWriteStream(path))

      console.log(data.file.truncated)

      if (req.query.albumId) {
        const album = await app.database.getAlbumById(req.query.albumId)
        if (!album) return reply.code(404).send({ error: { status: 404, message: 'Album not found.' } })
      }

      const entry: Partial<AlbumFile> = {
        id: crypto.randomUUID(),
        name: data.filename,
        extname: data.filename.slice(data.filename.lastIndexOf('.') - data.filename.length),
        type: null,
        size: null,
        albumId: req.query.albumId ?? null,
        createdAt: +new Date(),
        modifiedAt: +new Date()
      }

      const fileBuffer = await readFile(path)
      const fileMetadata = await sharp(fileBuffer).metadata()
      entry.type = fileMetadata.format
      entry.size = Buffer.byteLength(fileBuffer)
      entry.metadata = {
        height: fileMetadata.height,
        width: fileMetadata.width
      }

      await app.database.insertFile(entry)
      await app.database.updateAlbum(entry.albumId, { modifiedAt: +new Date() })

      reply.type('text/plain').send(data.filename)
    })

    app.delete('/upload', async (req, reply) => {
      const file = await app.database.findFileByName(req.body.toLowerCase())
      if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

      const path = join('src', 'static', 's-files', req.body)

      await unlink(path)
      await app.database.deleteFile(file.id)

      if (file.albumId) {
        await app.database.updateAlbum(file.albumId, { modifiedAt: +new Date() })
      }

      return reply.send(204)
    })

    app.delete('/', async (req, res) => {
      if (!('ids' in req.body)) return res.code(400).send({ error: { status: 400, message: 'Missing "ids" field from request body.' } })

      if (!Array.isArray(req.body.ids)) return res.code(400).send({ error: { status: 400, message: 'An invalid ids was provided. The ids must be an array.' } })

      for (const id of req.body.ids) {
        const image = await app.database.getFileById(id)
        if (!image) return res.code(404).send({ error: { status: 404, message: `File '${id}' not found` } })

        await app.database.deleteFile(image.id)

        const filePath = join('src', 'static', 's-files', image.name)
        await unlink(filePath)
      }

      res.code(204)
    })

    app.get('/:name', {
      config: {
        auth: false
      }
    }, async (req, reply) => {
      const name = req.params.name
      const width = req.query.width ? parseInt(req.query.width) : null
      const height = req.query.height ? parseInt(req.query.height) : null
      const fit = req.query.fit ?? null
      const format = allowedFormats.includes(req.query.format) ? req.query.format : defaultFormat

      const image = await app.database.findFileByName(name.toLowerCase())
      if (!image) return reply.code(404).send({ error: { status: 404, message: 'Image not found.' } })

      const filePath = join('src', 'static', 's-files', name)
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

    app.delete('/:id', async (req, reply) => {
      try {
        const file = await app.database.getFileById(req.params.id, true)
        if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

        if (file.albumId) {
          const isFileCover = file.album.coverId === file.id
          if (isFileCover) {
            await app.database.updateAlbum(file.albumId, { coverId: null })
          }

          const isFileCoverFallback = file.album.coverFallbackId === file.id
          if (isFileCoverFallback) {
            const images = await app.database.getAlbumFiles(file.albumId)
            const newCover = images[0]

            await app.database.updateAlbum(file.albumId, { coverId: newCover?.id ?? null })
          }
        }

        const filePath = join('src', 'static', 's-files', file.name)

        await app.database.deleteFile(file.id)

        await unlink(filePath)

        reply.code(204)
      } catch (error) {
        app.log.error(error.stack || error)
        return reply.code(500).send({ error: { status: 500, message: 'Something went wrong while deleting the image.' } })
      }
    })

    app.get('/:id/download', {
      config: {
        auth: false
      }
    }, async (req, reply) => {
      const file = await app.database.getFileById(req.params.id)

      if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

      const filePath = join('src', 'static', 's-files', file.name)
      const buffer = await readFile(filePath)

      reply.header('Content-Disposition', `attachment; filename="${file.name}"`)
      reply.header('Content-Type', file.mimetype)

      return buffer
    })

    done()
  }
}
