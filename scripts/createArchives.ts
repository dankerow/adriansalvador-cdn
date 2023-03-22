import 'dotenv/config'

import { createWriteStream } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'

import archiver from 'archiver'

import { Database } from '../src/managers'

const database = new Database()
database.connect()

const dirGallery = join('src', 'static', 'gallery')
const dirArchives = join('src', 'static', 'archives')

const loader = async (directory) => {
	const folders = await readdir(directory);

	if (folders.length > 0) {
		for (let i = 0; i < folders.length; i++) {
			const dirName = folders[i]

			const output = createWriteStream(join(dirArchives, dirName) + '.zip');
			const archive = archiver('zip', {
				zlib: { level: 9 }
			});

			output.on('close', function() {
				console.log(`${dirName} - ${archive.pointer()} total bytes`);
				console.log('archiver has been finalized and the output file descriptor has closed.');
			});

			archive.on('warning', function(err) {
				if (err.code === 'ENOENT') {
					console.log(err)
				} else {
					throw err;
				}
			});

			archive.on('error', function(err) {
				throw err;
			});

			await archive.pipe(output);

			await archive.directory(join(dirGallery, dirName), false);

			await archive.finalize();

			if (i + 1 === folders.length) return process.exit(1)
		}
	}
}

await loader(dirGallery)
