import type { Album, AlbumFile, File, User, UserMetadata, UserCredentials } from '@/types'
import type { Db, WithId } from 'mongodb'

import { EventEmitter } from 'node:events'
import { MongoClient, ObjectId } from 'mongodb'

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

  getUserById(id: ObjectId | string) {
    return this.mongoUsers
      .collection('metadata')
      .aggregate([
        { $match: { _id: new ObjectId(id) } },
        { $lookup: { from: 'credentials', localField: '_id', foreignField: '_id', as: 'credentials' } },
        {
          $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ '$credentials', 0 ] }, '$$ROOT' ] } }
        },
        { $project: { credentials: 0 } },
        { $unset: [ 'password' ] }
      ])
      .limit(1)
      .next()  as Promise<WithId<Omit<User, 'password'>>>
  }

  getUserByEmail(email: string): Promise<WithId<Omit<User, 'password'>>> {
    return this.mongoUsers
      .collection('credentials')
      .aggregate([
        { $match: { email } },
        { $lookup: { from: 'metadata', localField: '_id', foreignField: '_id', as: 'metadata' } },
        {
          $replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ '$metadata', 0 ] }, '$$ROOT' ] } }
        },
        { $project: { metadata: 0 } },
        { $unset: [ 'password' ] }
      ])
      .limit(1)
      .next() as Promise<WithId<Omit<User, 'password'>>>
  }

  getUserCredentials(id: ObjectId | string) {
    return this.mongoUsers
      .collection('credentials')
      .aggregate([
        { $match: { _id: new ObjectId(id) } }
      ])
      .limit(1)
      .next() as Promise<WithId<UserCredentials>>
  }

  getUsersSorted() {
    return this.mongoUsers
      .collection('metadata')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$firstName' } } }
      ])
      .sort({ firstName: 1 })
      .toArray() as Promise<WithId<UserMetadata>[]>
  }

  getUsersMetadata() {
    return this.mongoUsers
      .collection('metadata')
      .find()
      .toArray() as Promise<WithId<UserMetadata>[]>
  }

  getUsersCredentials(): Promise<WithId<UserCredentials>[]> {
    return this.mongoUsers
      .collection('credentials')
      .find()
      .toArray() as Promise<WithId<UserCredentials>[]>
  }

  getUserCredentialsWithFields(id: ObjectId, fields: string[]) {
    const project = {}

    for (let i = 0; i < fields.length; i++) {
      project[fields[i]] = '$' + fields[i]
    }

    return this.mongoUsers
      .collection('credentials')
      .aggregate([
        { $match: { _id: { $in: [new ObjectId(id)] } } },
        { $project: { ...project } }
      ])
      .limit(1)
      .next() as Promise<WithId<Partial<UserCredentials>>>
  }

  getAlbumById(id: ObjectId | string) {
    return this.mongo
      .collection('albums')
      .aggregate([
        { $match: { _id: new ObjectId(id) } },
        { $lookup: { from: 'files', localField: 'coverId', foreignField: '_id', as: 'cover' } },
        { $lookup: { from: 'files', localField: 'coverFallbackId', foreignField: '_id', as: 'coverFallback' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $addFields: { coverFallback: { $arrayElemAt: ['$coverFallback', 0] } } },
        { $unset: [ 'cover.albumId', 'coverFallback.albumId' ] }
      ])
      .limit(1)
      .next() as Promise<Album>
  }

  getAlbums(params: { status?: string; favorites?: boolean; featured?: boolean; search?: string; sort?: string; order?: string; skip?: number; limit?: number } = {}) {
    const aggregation = []

    if (params.status && params.status !== 'all') {
      aggregation.push({ $match: { draft: params.status === 'draft' ?? params.status !== 'posted' } })
    }

    if (params.favorites && params.featured) aggregation.push({ $match: { $or: [{ favorite: true }, { featured: true }] } })
    else if (params.favorites) aggregation.push({ $match: { favorite: true } })
    else if (params.featured) aggregation.push({ $match: { featured: true } })

    if (params.search) aggregation.push({ $match: { name: { $regex: params.search, $options: 'i' } } })
    if (params.sort) aggregation.push({ $addFields: { lowerName: { $toLower: '$name' } } }, { $sort: { [params.sort]: params.order === 'asc' ? 1 : -1 } })
    if (params.skip) aggregation.push({ $skip: params.skip })
    if (params.limit) aggregation.push({ $limit: params.limit })

    return this.mongo
      .collection('albums')
      .aggregate([
        ...aggregation,
        { $lookup: { from: 'files', localField: 'coverId', foreignField: '_id', as: 'cover' } },
        { $lookup: { from: 'files', localField: 'coverFallbackId', foreignField: '_id', as: 'coverFallback' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $addFields: { coverFallback: { $arrayElemAt: ['$coverFallback', 0] } } },
        { $unset: [ 'cover.albumId', 'coverFallback.albumId' ] },
        { $project: { lowerName: 0 } }
      ], {
        collation: {
          locale: 'en_US',
          numericOrdering: true
        }
      })
      .toArray() as Promise<WithId<Album>[]>
  }

  getAlbumCount() {
    return this.mongo
      .collection('albums')
      .countDocuments()
  }

  getRandomAlbumsImages(limit: number): Promise<WithId<AlbumFile>[]> {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId: { $ne: null } } },
        { $sample: { size: limit } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: '_id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } }
      ])
      .toArray() as Promise<WithId<AlbumFile>[]>
  }

  getAlbumFiles(albumId: ObjectId | string) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId: new ObjectId(albumId) } }
      ])
      .toArray() as Promise<WithId<AlbumFile>[]>
  }

  getAlbumFileCount(albumId: ObjectId) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId: new ObjectId(albumId) } },
        { $count: 'count' }
      ])
      .limit(1)
      .next()
  }

  getFiles(params: { search?: string; sort?: string; order?: string; includeAlbum?: boolean; skip?: number; limit?: number } = {}) {
    const aggregation = []

    if (params.search) aggregation.push({ $match: { name: { $regex: params.search, $options: 'i' } } })
    if (params.sort) aggregation.push({ $addFields: { lowerName: { $toLower: '$name' } } }, { $sort: { [params.sort]: params.order === 'asc' ? 1 : -1 } })
    if (params.includeAlbum) {
      aggregation.push(
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: '_id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } }
      )
    }
    if (params.skip) aggregation.push({ $skip: params.skip })
    if (params.limit) aggregation.push({ $limit: params.limit })

    return this.mongo
      .collection('files')
      .aggregate([
        ...aggregation,
        { $project: { lowerName: 0 } }
      ], {
        collation: {
          locale: 'en_US',
          numericOrdering: true
        }
      })
      .toArray() as Promise<WithId<AlbumFile>[]>
  }

  getFileById(id: ObjectId | string, includeAlbum = false) {
    const collection = this.mongo.collection('files')

    if (!includeAlbum) return collection.findOne({ _id: new ObjectId(id) }) as Promise<WithId<AlbumFile>>

    return collection
      .aggregate([
        { $match: { _id: new ObjectId(id) } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: '_id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } }
      ])
      .limit(1)
      .next() as Promise<WithId<AlbumFile>>
  }

  getFileCount(): Promise<number> {
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
        { $lookup: { from: 'files', localField: 'coverFallbackId', foreignField: 'id', as: 'coverFallback' } },
        { $addFields: { cover: { $arrayElemAt: ['$cover', 0] } } },
        { $addFields: { coverFallback: { $arrayElemAt: ['$coverFallback', 0] } } },
        { $unset: ['cover.albumId', 'coverFallback.albumId' ] },
        { $project: { lowerName: 0 } }
      ])
      .limit(1)
      .next() as Promise<WithId<Album>>
  }

  findFileByName(name: string) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$name' } } },
        { $match: { lowerName: name } },
        { $lookup: { from: 'albums', localField: 'albumId', foreignField: '_id', as: 'album' } },
        { $addFields: { album: { $arrayElemAt: ['$album', 0] } } },
        { $project: { lowerName: 0 } }
      ])
      .limit(1)
      .next() as Promise<WithId<AlbumFile>>
  }

  insertUserMetadata(document: UserMetadata) {
    return this.mongoUsers
      .collection('metadata')
      .insertOne(document)
  }

  insertUserCredentials(document: UserCredentials) {
    return this.mongoUsers
      .collection('credentials')
      .insertOne(document)
  }

  insertAlbum(document: Album) {
    return this.mongo
      .collection('albums')
      .insertOne(document)
  }

  insertFile(document: Omit<File, '_id'> | Omit<AlbumFile, '_id'>) {
    return this.mongo
      .collection('files')
      .insertOne(document)
  }

  updateUserMetadata(id: ObjectId, fields: Omit<Partial<UserMetadata>, '_id' | 'createdAt'>) {
    return this.mongoUsers
      .collection('metadata')
      .updateOne({ _id: new ObjectId(id) }, { $set: fields })
  }

  updateUserCredentials(id: ObjectId, fields: Omit<Partial<UserCredentials>, '_id' | 'createdAt'>) {
    return this.mongoUsers
      .collection('credentials')
      .updateOne({ _id: new ObjectId(id) }, { $set: fields })
  }

  updateAlbum(id: ObjectId | string, fields: Omit<Partial<Album>, '_id'>) {
    return this.mongo
      .collection('albums')
      .updateOne({ _id: new ObjectId((id)) }, { $set: fields })
  }

  updateFile(id: ObjectId | string, fields: string[]) {
    return this.mongo
      .collection('files')
      .updateOne({ _id: new ObjectId(id) }, { $set: fields })
  }

  deleteAlbum(id: ObjectId | string) {
    return this.mongo
      .collection('albums')
      .deleteOne({ _id: new ObjectId(id) })
  }

  deleteAlbums(ids: ObjectId[]) {
    return this.mongo
      .collection('albums')
      .deleteMany({ _id: { $in: ids } })
  }

  deleteAlbumFiles(albumId: ObjectId | string) {
    return this.mongo
      .collection('files')
      .deleteMany({ albumId: new ObjectId(albumId) })
  }

  deleteFile(id: ObjectId | string) {
    return this.mongo
      .collection('files')
      .deleteOne({ _id: new ObjectId(id) })
  }

  deleteFiles(ids: ObjectId[]) {
    return this.mongo
      .collection('files')
      .deleteMany({ _id: { $in: ids } })
  }
}
