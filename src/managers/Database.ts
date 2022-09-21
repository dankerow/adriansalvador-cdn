import { MongoClient, Db } from 'mongodb';
import { EventEmitter } from 'events';

export class Database extends EventEmitter {
  private client: MongoClient;
  public mongo: Db;

  constructor() {
    super();

    this.client = new MongoClient(process.env.MONGO_URI, { minPoolSize: 12 });
    this.mongo = null;
  }

  connect() {
    this.client.connect()
      .then(() => {
        this.emit('ready');
        this.mongo = this.client.db(process.env.MONGO_DATABASE);
      })
      .catch((err) => {
        this.emit('error', err);
      })
  }

  getAlbumById(id) {
    return this.mongo
      .collection('albums')
      .findOne({ id });
  }

  getAllAlbums() {
    return this.mongo
      .collection('albums')
      .find()
      .toArray();
  }

  getAlbumsSorted() {
    return this.mongo
      .collection('albums')
      .aggregate([
        { $addFields: { lowerName: { $toLower: '$name' } } }
      ],
        {
          collation: {
            locale: 'en_US',
            numericOrdering: true
          }
        })
      .sort({ name: 1 })
      .toArray();
  }

  getAlbumCount() {
    return this.mongo
      .collection('albums')
      .countDocuments();
  }

  getRandomImages(limit, ids = []) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId: { $in: ids } } },
        { $sample: { size: limit } }
      ])
      .toArray();
  }

  getAlbumFiles(albumId) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId } },
      ])
      .toArray();
  }

  getAlbumFileCount(albumId) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId } },
        { $count: 'count' }
      ])
      .limit(1)
      .next();
  }

  getAlbumFilesWithFields(id, fields) {
    const project = {};

    for (let i = 0; i < fields.length; i++) {
      project[fields[i]] = '$' + fields[i];
    }

    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId: { $in: [id] } } },
        { $project: { _id: 0, ...project } }
      ])
      .toArray();
  }

  getAlbumFilesPaginated(id, skip, limit) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { albumId: { $in: [id] } } },
      ])
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  getFile(name, size) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { name, size } },
      ])
      .limit(1)
      .next();
  }

  findAlbumByName(name) {
    return this.mongo
      .collection('albums')
      .aggregate([
        { $addFields: { name: { $toLower: '$name' } } },
        { $match: { name } }
      ])
      .limit(1)
      .next();
  }

  findFileByName(name) {
    return this.mongo
      .collection('files')
      .aggregate([
        { $match: { name } }
      ])
      .limit(1)
      .next();
  }

  updateFile(id, fields) {
    return this.mongo
      .collection('files')
      .updateOne({ id }, { $set: fields });
  }
}
