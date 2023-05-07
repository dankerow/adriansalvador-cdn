import type { AlbumFile } from '../types/Album'

import { Route } from '../structures'
import { join } from 'node:path'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
const pump = promisify(pipeline)
import { mkdir, readFile, rename, rm, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import crypto from 'node:crypto'
import sharp from 'sharp'

export default class Albums extends Route {
  constructor() {
    super({
      position: 2,
      path: '/albums',
      middlewares: ['auth']
    })
  }

  routes(app, options, done) {
    const getAlbum = async (req, reply) => {
      if (!req.params.id) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } })

      const album = await app.database.getAlbumById(req.params.id)

      if (!album) return reply.code(404).send({ error: { status: 404, message: 'Album not found' } })

      return req.album = album
    }

    app.post('/', {
      config: {
        rateLimit: { max: 5, timeWindow: 15 * 1000 }
      }
    }, async (req, reply) => {
      if (!('name' in req.body)) return reply.code(400).send({ error: { status: 400, message: 'Missing "name" field from request body.' } })

      req.body.nsfw = req.body.nsfw ?? false
      req.body.hidden = req.body.hidden ?? false
      req.body.favorite = req.body.favorite ?? false
      req.body.featured = req.body.featured ?? false

      if (typeof req.body.name !== 'string') return reply.code(400).send({ error: { status: 400, message: 'An invalid name was provided. The name must be a string.' } })

      const album = await app.database.findAlbumByName(req.body.name.toLowerCase())
      if (album) return reply.code(409).send({ error: { status: 409, message: 'An album with that name already exists.' } })

      await app.database.insertAlbum({
        id: crypto.randomUUID(),
        name: req.body.name,
        coverId: null,
        nsfw: Boolean(req.body.nsfw),
        hidden: Boolean(req.body.hidden),
        favorite: Boolean(req.body.favorite),
        featured: Boolean(req.body.favorite),
        createdAt: +new Date(),
        modifiedAt: +new Date()
      })

      const albumPath = join('src', 'static', 'gallery', req.body.name)
      await mkdir(albumPath)

      reply.code(204)
    })

    app.delete('/', async (req, reply) => {
      try {
        if (!('ids' in req.body)) return reply.code(400).send({ error: { status: 400, message: 'Missing "ids" field from request body.' } })

        if (!Array.isArray(req.body.ids)) return reply.code(400).send({ error: { status: 400, message: 'An invalid ids was provided. The ids must be an array.' } })

        for (const id of req.body.ids) {
          const album = await app.database.getAlbumById(id)
          if (!album) return reply.code(404).send({ error: { status: 404, message: `Album '${id}' not found` } })

          const albumPath = join('src', 'static', 'gallery', album.name)
          const albumArchivePath = join('src', 'static', 'archives', `${album.name}.zip`)

          await rm(albumPath, { force: true, recursive: true })
          await rm(albumArchivePath, { force: true, recursive: true })

          await app.database.deleteAlbumFiles(id)
        }

        await app.database.deleteAlbums(req.body.ids)
      } catch (error) {
        app.log.error(error.stack || error)
        reply.code(500).send({ error: { status: 500, message: 'Something went wrong while deleting the albums in the database.' } })
      }
    })

    app.put('/:id', {
      preHandler: [getAlbum]
    },
    async (req, reply) => {
      if (!('name' in req.body)) return reply.code(400).send({ error: { status: 400, message: 'Missing "name" field from request body.' } })

      req.body.nsfw = req.body.nsfw ?? req.album.nsfw
      req.body.hidden = req.body.hidden ?? req.album.hidden
      req.body.favorite = req.body.favorite ?? req.album.favorite
      req.body.featured = req.body.featured ?? req.album.featured

      if (typeof req.body.name !== 'string') return reply.code(400).send({ error: { status: 400, message: 'An invalid name was provided. The name must be a string.' } })

      const entry: {
        name?: string
        nsfw?: boolean
        hidden?: boolean
        favorite?: boolean
        featured?: boolean
        modifiedAt?: number
      } = {}

      if (req.body.name.toLowerCase() !== req.album.name.toLowerCase()) {
        const nameTaken = await app.database.findAlbumByName(req.body.name)
        if (nameTaken) return reply.code(400).send({ error: { status: 400, message: 'Album name already taken.' } })

        entry.name = req.body.name
      }

      if (req.body.nsfw !== req.album.nsfw) entry.nsfw = req.body.nsfw
      if (req.body.hidden !== req.album.hidden) entry.hidden = req.body.hidden
      if (req.body.favorite !== req.album.favorite) entry.favorite = req.body.favorite
      if (req.body.featured !== req.album.featured) entry.featured = req.body.featured

      const isObjectEmpty = (obj) => Object.keys(obj).length === 0 && obj.constructor === Object

      if (isObjectEmpty(entry)) return reply.code(400).send({ error: { status: 400, message: 'No changes were made to the album.' } })

      entry.modifiedAt = +new Date()

      try {
        if (entry.name) {
          if (req.body.name.toLowerCase() !== req.album.name.toLowerCase()) {
            const nameTaken = await app.database.findAlbumByName(req.body.name)
            if (nameTaken) return reply.code(400).send({ error: { status: 400, message: 'Album name already taken.' } })

            const oldAlbumPath = join('src', 'static', 'gallery', req.album.name)
            const newAlbumPath = join('src', 'static', 'gallery', req.body.name)

            await rename(oldAlbumPath, newAlbumPath) // Rename the album folder

            const oldAlbumArchivePath = join('src', 'static', 'archives', `${req.album.name}.zip`)
            const newAlbumArchivePath = join('src', 'static', 'archives', `${req.body.name}.zip`)

            await rename(oldAlbumArchivePath, newAlbumArchivePath) // Rename the album archive
          }
        }

        await app.database.updateAlbum(req.album.id, entry)

        return await app.database.getAlbumById(req.params.id)
      } catch (error) {
        app.log.error(error.stack || error)
        reply.code(500).send({ error: { status: 500, message: 'Something went wrong while updating the album in the database.' } })
      }
    })

    app.delete('/:id', {
      schema: {
        params: {
          id: { type: 'string' }
        }
      },
      preHandler: [getAlbum]
    }, async (req, reply) => {
      try {
        const albumPath = join('src', 'static', 'gallery', req.album.name)
        const albumArchivePath = join('src', 'static', 'archives', `${req.album.name}.zip`)

        await rm(albumPath, { force: true, recursive: true })
        await rm(albumArchivePath, { force: true, recursive: true })

        await app.database.deleteAlbum(req.params.id)
        await app.database.deleteAlbumFiles(req.params.id)

        reply.code(204)
      } catch (error) {
        app.log.error(error.stack || error)
        return reply.code(500).send({ error: { status: 500, message: 'Something went wrong while deleting the image.' } })
      }
    })

    app.post('/:id/images/upload', {
      preHandler: [getAlbum]
    }, async (req, reply) => {
      const data = await req.file()
      const path = join('src', 'static', 'gallery', req.album.name, data.filename)

      await pump(data.file, createWriteStream(path))

      const entry: Partial<AlbumFile> = {
        id: crypto.randomUUID(),
        name: data.filename,
        extname: data.filename.slice(data.filename.lastIndexOf('.') - data.filename.length),
        type: null,
        size: null,
        albumId: req.album.id,
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
      await app.database.updateAlbum(req.album.id, { modifiedAt: +new Date() })

      reply.type('text/plain').send(data.filename)
    })

    app.delete('/:id/images/upload', {
      preHandler: [getAlbum]
    }, async (req, reply) => {
      const image = await app.database.findFileByName(req.body)
      if (!image) return reply.code(404).send({ error: { status: 404, message: 'Image not found.' } })

      const path = join('src', 'static', 'gallery', req.album.name, req.body)

      await unlink(path)

      return reply.send(204)
    })

    app.post('/:id/cover/upload', {
      preHandler: [getAlbum]
    }, async (req, reply) => {
      const data = await req.file()

      if (!data) return reply.code(400).send({ error: { status: 400, message: 'No file was uploaded.' } })

      const fileName = decodeURIComponent(data.filename)

      const isCover = await app.database.findFileByName(fileName.toLowerCase())

      if (isCover && (req.album.cover && req.album.coverId === isCover.id)) return reply.type('text/plain').send(data.filename)
      if (isCover && (req.album.coverFallback && req.album.coverFallbackId === isCover.id)) return reply.type('text/plain').send(data.filename)

      const path = join('src', 'static', 'covers', fileName)

      await pump(data.file, createWriteStream(path))

      const entry: Partial<AlbumFile> = {
        id: crypto.randomUUID(),
        name: fileName,
        extname: fileName.slice(fileName.lastIndexOf('.') - fileName.length),
        type: null,
        size: null,
        albumId: null,
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

      await app.database.updateAlbum(req.album.id, { coverId: entry.id, modifiedAt: +new Date() })

      return reply.type('text/plain').send(data.filename)
    })

    app.delete('/:id/cover/upload', {
      preHandler: [getAlbum]
    }, async (req, reply) => {
      const fileName = decodeURIComponent(req.body)
      const image = await app.database.findFileByName(fileName.toLowerCase())
      if (!image) return reply.code(404).send({ error: { status: 404, message: 'Image not found.' } })

      if (req.album.coverFallback && req.album.coverFallback.id === image.id) return reply.send(204)

      const path = join('src', 'static', 'covers', fileName)

      await unlink(path)

      await app.database.deleteFile(image.id)
      await app.database.updateAlbum(req.album.id, { coverId: null, modifiedAt: +new Date() })

      return reply.send(204)
    })

    app.get('/:id/download', {
      config: {
        auth: false
      },
      preHandler: [getAlbum]
    }, async (req, reply) => {
      return reply.download(`/archives/${req.album.name}.zip`)
    })

    done()
  }
}
