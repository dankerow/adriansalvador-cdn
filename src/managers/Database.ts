import type { Db } from 'mongodb'
import type { Album, File } from '../../types'
import { MongoClient } from 'mongodb'
import { EventEmitter } from 'node:events'

export class Database extends EventEmitter {
  private client: MongoClient
  public mongo: Db
  private mongoUsers: Db

  constructor() {
    super()

    this.client = new MongoClient(process.env.MONGO_URI, { minPoolSize: 12 })
    this.mongo = null
    this.mongoUsers = null
  }

  async connect() {
    await this.client.connect()
      .then(() => {
        this.mongo = this.client.db(process.env.MONGO_DATABASE)
        this.mongoUsers = this.client.db(process.env.MONGO_USERS_DATABASE)

        this.emit('ready')
      })
      .catch((err) => {
        this.emit('error', err)
      })
  }

  async close(force = false) {
    await this.client.close(force)
  }

  getUserById(id: string) {
    return this.mongoUsers
      .collection('metadata')
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'credentials', localField: 'id', foreignField: 'id', as: 'credentials' } },
        {
          $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ '$credentials', 0 ] }, '$$ROOT' ] } }
        },
        { $project: { credentials: 0 } },
        { $unset: [ '_id', 'password' ] }
      ])
      .limit(1)
      .next()
  }

  getAlbumById(id: string) {
    return this.mongo
      .collection('albums')
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'files', localField: 'coverId', foreignField: 'id', as: 'cover' } },
        { $lookup: { from: 'files', localField: 'coverFallbackId', foreignField: 'id', as: 'coverFallback' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $addFields: { coverFallback: { $arrayElemAt: ['$coverFallback', 0] } } },
        { $unset: [ 'cover._id', 'cover.albumId', 'coverFallback._id', 'coverFallback.albumId' ] },
        { $project: { _id: 0 } }
      ])
      .limit(1)
      .next()
  }

  getAlbums(params: { favorite?: boolean; featured?: boolean; search?: string; sort?: any; skip?: number; limit?: number } = {}) {
    const aggregation = []
    if (params.favorite) aggregation.push({ $match: { favorite: true } })
    if (params.featured) aggregation.push({ $match: { featured: true } })
    if (params.search) aggregation.push({ $match: { name: { $regex: params.search, $options: 'i' } } })
    if (params.sort) aggregation.push({ $addFields: { lowerName: { $toLower: '$name' } } }, { $sort: params.sort })
    if (params.skip) aggregation.push({ $skip: params.skip })
    if (params.limit) aggregation.push({ $limit: params.limit })

    return this.mongo
      .collection('albums')
      .aggregate([
        ...aggregation,
        { $lookup: { from: 'files', localField: 'coverId', foreignField: 'id', as: 'cover' } },
        { $lookup: { from: 'files', localField: 'coverFallbackId', foreignField: 'id', as: 'coverFallback' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $addFields: { coverFallback: { $arrayElemAt: ['$coverFallback', 0] } } },
        { $unset: [ 'cover._id', 'cover.id', 'cover.type', 'cover.size', 'cover.albumId', 'coverFallback._id', 'coverFallback.id', 'coverFallback.type', 'coverFallback.size', 'coverFallback.albumId' ] },
        { $project: { _id: 0, lowerName: 0 } }
      ], {
        collation: {
          locale: 'en_US',
          numericOrdering: true
        }
      })
      .toArray()
  }

  getAlbumCount() {
    return this.mongo
      .collection('albums')
      .countDocuments()
  }

  getRandomImages(limit: number) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $sample: { size: limit } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { _id: 0 } }
      ])
      .toArray()
  }

  pickRandomImages(limit: number, ids: string[] = []) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId: { $in: ids } } },
        { $sample: { size: limit } }
      ])
      .toArray()
  }

  getAlbumFiles(albumId: string) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId } },
        { $project: { _id: 0 } }
      ])
      .toArray()
  }

  getAlbumFileCount(albumId: string) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId } },
        { $count: 'count' }
      ])
      .limit(1)
      .next()
  }

  getAlbumFilesWithFields(id: string, fields: string[]) {
    const project = {}

    for (let i = 0; i < fields.length; i++) {
      project[fields[i]] = '$' + fields[i]
    }

    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId: { $in: [id] } } },
        { $project: { _id: 0, ...project } }
      ])
      .toArray()
  }

  getFileById(id: string, includeAlbum = false) {
    const collection = this.mongo.collection('files')

    if (!includeAlbum) return collection.findOne({ id })

    return collection
      .aggregate([
        { $match: { id } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { _id: 0 } }
      ])
      .limit(1)
      .next()
  }

  getFileCount() {
    return this.mongo
      .collection('files')
      .countDocuments()
  }

  findAlbumByName(name: string) {
    return this.mongo
      .collection('albums')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$name' } } },
        { $match: { lowerName: name } },
        { $lookup: { from: 'files', localField: 'coverId', foreignField: 'id', as: 'cover' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $unset: [ 'cover._id', 'cover.id', 'cover.type', 'cover.size', 'cover.albumId' ] },
        { $project: { _id: 0, lowerName: 0 } }
      ])
      .limit(1)
      .next()
  }

  findFileByName(name: string) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$name' } } },
        { $match: { lowerName: name } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: 'id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { _id: 0, lowerName: 0 } }
      ])
      .limit(1)
      .next()
  }

  insertAlbum(document: Album) {
    return this.mongo
      .collection('albums')
      .insertOne(document)
  }

  insertFile(document: File) {
    return this.mongo
      .collection('files')
      .insertOne(document)
  }

  updateAlbum(id: string, fields: string[]) {
    return this.mongo
      .collection('albums')
      .updateOne({ id }, { $set: fields })
  }

  updateFile(id: string, fields: string[]) {
    return this.mongo
      .collection('files')
      .updateOne({ id }, { $set: fields })
  }

  deleteAlbum(id: string) {
    return this.mongo
      .collection('albums')
      .deleteOne({ id })
  }

  deleteAlbums(ids: string[]) {
    return this.mongo
      .collection('albums')
      .deleteMany({ id: { $in: ids } })
  }

  deleteAlbumFiles(albumId: string) {
    return this.mongo
      .collection('files')
      .deleteMany({ albumId })
  }

  deleteFile(id: string) {
    return this.mongo
      .collection('files')
      .deleteOne({ id })
  }

  deleteFiles(ids: string[]) {
    return this.mongo
      .collection('files')
      .deleteMany({ id: { $in: ids } })
  }
}
