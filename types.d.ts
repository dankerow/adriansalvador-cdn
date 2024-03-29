import type { ObjectId } from 'mongodb'
import type { Database } from '@/services'
import type { Logger } from '@/utils'

declare module 'fastify' {
  interface FastifyInstance {
    database: Database
    logger: Logger
  }

  interface FastifyContextConfig {
    auth?: boolean
  }

  interface FastifyRequest {
    user?: Omit<User, 'password'>
    album?: Album
  }
}


export interface UserMetadata {
  readonly _id: ObjectId
  firstName: string
  lastName: string
  readonly createdAt: number
  readonly modifiedAt: number
}

export interface UserCredentials {
  readonly _id: ObjectId
  email: string
  password: string
  readonly createdAt: number
  readonly modifiedAt: number
}

export type User = UserMetadata & UserCredentials

export interface File {
  readonly _id: ObjectId
  name: string
  url?: string
  type: string
  extname: string
  size: number
  albumId?: string | null
  album?: Album
  metadata: { width: number; height: number }
  createdAt: number
  modifiedAt: number
}

export interface Album {
  readonly _id: ObjectId
  name: string
  url?: string
  draft: boolean
  hidden: boolean
  nsfw: boolean
  favorite: boolean
  featured: boolean
  coverId: ObjectId | null
  cover?: Omit<File, | 'albumId' | 'album' | 'createdAt' | 'modifiedAt'>
  coverFallbackId: ObjectId | null
  coverFallback?: Omit<File, | 'albumId' | 'album' | 'createdAt' | 'modifiedAt'>
  fileCount: number
  images: File[]
  postedAt: number | null
  createdAt: number
  modifiedAt: number
}

export interface AlbumFile extends File {
  albumId: ObjectId
  album: Album
}
