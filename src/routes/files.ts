import type { AlbumFile } from '../../types'
import type { FastifyInstance, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'
import type { FitEnum, FormatEnum } from 'sharp'

import { Route } from '../structures'
import { join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import sharp from 'sharp'

const pump = promisify(pipeline)

interface IParams {
  id: string
}

interface IBodyDelete {
  ids: string[]
}

interface IQuerystring {
  albumId?: string
}

export default class Files extends Route {
  constructor() {
    super({
      position: 2,
      path: '/files',
      middlewares: ['auth']
    })
  }

  async routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    const defaultFormat = 'webp'
    const allowedFormats = ['png', 'jpeg', 'webp']

    const deleteFile = async (file: AlbumFile) => {
      const filePath = join('src', 'static', 's-files', file.name)

      await unlink(filePath)
      await app.database.deleteFile(file.id)

      if (file.albumId) {
        await app.database.updateAlbum(file.albumId, { modifiedAt: +new Date() })
      }
    }

    app.post<{
      Querystring: IQuerystring
    }>('/upload', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            albumId: { type: 'string' }
          },
          required: ['albumId']
        }
      }
    }, async (req, reply) => {
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

    app.delete<{
      Body: string
    }>('/upload', async (req, reply) => {
      const file = await app.database.findFileByName(req.body.toLowerCase())
      if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

      await deleteFile(file)

      return reply.send(204)
    })

    app.delete<{
      Body: IBodyDelete
    }>('/',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              ids: {
                type: 'array',
                items: {
                  type: 'string',
                  format: 'uuid'
                },
                minItems: 1
              }
            },
            required: ['ids']
          }
        }
      }, async (req, res) => {
        for (const id of req.body.ids) {
          const file = await app.database.getFileById(id)
          if (!file) return res.code(404).send({ error: { status: 404, message: `File '${id}' not found` } })

          await deleteFile(file)
        }

        res.code(204)
      })

    app.get<{
      Params: {
        name: string
      }
      Querystring: {
        width?: number
        height?: number
        fit?: keyof FitEnum
        format?: keyof FormatEnum
      }
    }>('/:name', {
      config: {
        auth: false
      },
      schema: {
        params: {
          name: { type: 'string' }
        },
        querystring: {
          type: 'object',
          properties: {
            width: { type: 'number', nullable: true },
            height: { type: 'number', nullable: true },
            fit: { type: 'string', enum: ['cover', 'contain', 'fill', 'inside', 'outside'], nullable: true },
            format: { type: 'string', enum: allowedFormats, default: defaultFormat }
          }
        }
      }
    }, async (req, reply) => {
      const name = req.params.name
      const width = req.query.width ?? null
      const height = req.query.height ?? null
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

    app.delete<{
      Params: IParams
    }>('/:id', {
      schema: {
        params: {
          id: { type: 'string', format: 'uuid' }
        }
      }
    }, async (req, reply) => {
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

        await deleteFile(file)

        reply.code(204)
      } catch (error) {
        app.log.error(error.stack || error)
        return reply.code(500).send({ error: { status: 500, message: 'Something went wrong while deleting the image.' } })
      }
    })

    app.get<{
      Params: IParams
    }>('/:id/download', {
      config: {
        auth: false
      },
      schema: {
        params: {
          id: { type: 'string', format: 'uuid' }
        }
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
