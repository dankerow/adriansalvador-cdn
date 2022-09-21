import 'dotenv/config'
import { Server } from '../structures'

const server = new Server()
server.setup()

process.on('uncaughtException', (error) => process.send({ type: 'error', content: error.stack || error }));
process.on('unhandledRejection', (error: Error) => process.send({ type: 'error', content: error.stack || error }));
