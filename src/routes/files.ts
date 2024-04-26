import type { AlbumFile } from '@/types'
import type { FastifyInstance, RegisterOptions, DoneFuncWithErrOrRes } from 'fastify'

import { Route } from '@/structures'
import { join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { filesize } from 'filesize'

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

  routes(app: FastifyInstance, _options: RegisterOptions, done: DoneFuncWithErrOrRes) {
    const deleteFile = async (file: AlbumFile) => {
      const filePath = join('src', 'static', 's-files', file.name)

      await unlink(filePath)
      await app.database.deleteFile(file._id)

      if (file.albumId) {
        await app.database.updateAlbum(file.albumId, { modifiedAt: +new Date() })
      }
    }

    app.get<{
      Querystring: {
        search?: string
        sort?: 'lowerName' | 'createdAt' | 'modifiedAt'
        order?: 'asc' | 'desc'
        includeAlbum?: boolean
        page?: number
        limit?: number
      }
    }>('/', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string', maxLength: 100 },
            sort: { type: 'string', enum: ['lowerName', 'name', 'size', 'createdAt', 'modifiedAt'] },
            order: { type: 'string', enum: ['asc', 'desc'] },
            includeAlbum: { type: 'boolean' },
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: -1 }
          }
        }
      }
    }, async (req) => {
      const {
        search = null,
        sort = 'lowerName',
        order = 'asc',
        includeAlbum = false,
        page = 1,
        limit = 25
      } = req.query

      const params = {
        search,
        sort,
        order,
        includeAlbum,
        limit,
        skip: (page - 1) * limit
      }

      const files = await app.database.getFiles(params)
      const count = await app.database.getFileCount()
      const pages = (fileCount: number) => Math.ceil(fileCount / limit)

      return {
        data: files,
        count,
        pages: pages(count)
      }
    })

    app.get('/random', {
      config: {
        auth: false,
        rateLimit: { max: 15, timeWindow: 15 * 1000 }
      }
    }, async () => {
      return await app.database.getRandomAlbumsImages(35)
    })

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

      const album = req.query.albumId ? await app.database.getAlbumById(req.query.albumId) : null
      if (!album) return reply.code(404).send({ error: { status: 404, message: 'Album not found.' } })

      const entry: Omit<AlbumFile, '_id'> = {
        name: data.filename,
        extname: data.filename.slice(data.filename.lastIndexOf('.') - data.filename.length),
        type: null,
        size: null,
        albumId: album._id ?? null,
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

      await reply.type('text/plain')

      return data.filename
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
                  type: 'string'
                },
                minItems: 1
              }
            },
            required: ['ids']
          }
        }
      }, async (req, reply) => {
        for (const id of req.body.ids) {
          const file = await app.database.getFileById(id)
          if (!file) return reply.code(404).send({ error: { status: 404, message: `File '${id}' not found` } })

          await deleteFile(file)
        }

        await reply.code(204)
      })

    app.get<{
      Params: IParams
      Querystring: {
        includeAlbum?: boolean
      }
    }>('/:id', {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        },
        querystring: {
          type: 'object',
          properties: {
            includeAlbum: { type: 'boolean' }
          }
        }
      }
    }, async (req, reply) => {
      const includeAlbum = req.query.includeAlbum ?? false
      const file = await app.database.getFileById(req.params.id, includeAlbum)

      if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

      return {
        ...file,
        size: filesize(file.size)
      }
    })

    app.delete<{
      Params: IParams
    }>('/:id', {
      schema: {
        params: {
          id: { type: 'string' }
        }
      }
    }, async (req, reply) => {
      try {
        const file = await app.database.getFileById(req.params.id, true)
        if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

        if (file.albumId) {
          const isFileCover = file.album.coverId ? file.album.coverId.toString() === file._id.toString() : false
          if (isFileCover) {
            await app.database.updateAlbum(file.albumId, { coverId: null })
          }

          const isFileCoverFallback = file.album.coverFallback ? file.album.coverFallbackId.toString() === file._id.toString() : false
          if (isFileCoverFallback) {
            const images = await app.database.getAlbumFiles(file.albumId)
            const newCover = images[1]

            await app.database.updateAlbum(file.albumId, { coverId: newCover?._id ?? null })
          }
        }

        await deleteFile(file)

        await reply.code(204)
      } catch (error) {
        app.log.error(error)

        return reply.code(500).send({
          error: {
            status: 500,
            message: 'Something went wrong while deleting the image.'
          }
        })
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
          id: { type: 'string' }
        }
      }
    }, async (req, reply) => {
      const file = await app.database.getFileById(req.params.id)

      if (!file) return reply.code(404).send({ error: { status: 404, message: 'File not found.' } })

      const filePath = join('src', 'static', 's-files', file.name)
      const buffer = await readFile(filePath)

      await reply.header('Content-Disposition', `attachment; filename="${file.name}"`)
      await reply.header('Content-Type', file.mimetype)

      return buffer
    })

    done()
  }
}
