import 'dotenv/config'

import type { Worker } from 'node:cluster'
import cluster from 'node:cluster'
import os from 'node:os'
import { Logger } from '../utils'

const workers: Map<number, Worker> = new Map()
const workersLength: number = (process.env.WORKERS_NUMBER ? parseInt(process.env.WORKERS_NUMBER) : false) || os.cpus().length

cluster.setupPrimary()

for (let i = 0; i < workersLength; i++) {
  const worker: Worker = cluster.fork()
  workers.set(worker.id, worker)
}

cluster.on('message', (worker: Worker, message) => {
  if (message.type) {
    switch (message.type) {
      case 'log':
        Logger.log(`Worker #${worker.id}`, message.content)
        break
      case 'warn':
        Logger.warn(`Worker #${worker.id}`, message.content)
        break
      case 'error':
        Logger.error(`Worker #${worker.id}`, message.content)
        break
    }
  }
})

cluster.on('online', (worker: Worker) => {
  Logger.log('Primary', `Worker #${worker.id} is online`)
})

cluster.on('disconnect', (worker: Worker) => {
  Logger.warn('Primary', `Worker ${worker.id} disconnected`)
})

cluster.on('exit', (worker: Worker, code, signal) => {
  Logger.log(`Worker #${worker.id}`, `Worker #${worker.id} died with code: ${code} and signal: ${signal}`)
  Logger.log('Primary', 'Starting a new worker')

  const newWorker: Worker = cluster.fork()
  workers.delete(worker.id)
  workers.set(newWorker.id, newWorker)
})
