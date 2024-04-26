import { Server } from '@/structures'

const handleError = (error: any) => {
  if (process.send) {
    process.send({ type: 'error', content: error })
  } else {
    console.error(error)
  }
}

const server = new Server()
try {
  await server.setup()
} catch (error) {
  handleError(error)
}

process.on('uncaughtException', handleError)
process.on('unhandledRejection', handleError)
