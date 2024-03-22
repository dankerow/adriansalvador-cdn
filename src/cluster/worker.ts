import { Server } from '@/structures'

const handleError = (error: Error) => {
  if (process.send) {
    process.send({ type: 'error', content: error.stack || error })
  } else {
    console.error(error)
  }
}

const server = new Server()
try {
  server.setup()
} catch (error) {
  handleError(error)
}

process.on('uncaughtException', handleError)
process.on('unhandledRejection', handleError)
