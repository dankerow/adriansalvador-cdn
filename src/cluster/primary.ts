import cluster, { Worker } from 'cluster';
import os from 'os';
import { Logger as logger } from '../utils';

const workers: Map<any, any> = new Map();
const workersLength: number = os.cpus().length;

logger.log('Primary', `Setting up ${workersLength} workers...`);

cluster.setupPrimary();

for (let i = 0; i < workersLength; i++) {
	const worker: Worker = cluster.fork();
	workers.set(worker.id, worker);
}

cluster.on('message', (worker: Worker, message) => {
	if (message.type) {
		switch (message.type) {
		case 'log':
			logger.log(`Worker #${worker.id}`, message.content);
			break;
		case 'warn':
			logger.warn(`Worker #${worker.id}`, message.content);
			break;
		case 'error':
			logger.error(`Worker #${worker.id}`, message.content);
			break;
		}
	}
});

cluster.on('online', (worker: Worker) => {
	logger.log('Primary', `Worker #${worker.id} is online`);
});

cluster.on('disconnect', (worker: Worker) => {
	logger.warn('Primary', `Worker ${worker.id} disconnected`);
});

cluster.on('exit', (worker: Worker, code, signal) => {
	logger.log(`Worker #${worker.id}`, `Worker #${worker.id} died with code: ${code} and signal: ${signal}`);
	logger.log('Primary', 'Starting a new worker');

	const newWorker: Worker = cluster.fork();
	workers.delete(worker.id);
	workers.set(newWorker.id, newWorker);
});
