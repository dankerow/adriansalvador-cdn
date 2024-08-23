import cluster from 'cluster'

if (cluster.isPrimary) {
  await import('./cluster/primary.js')
} else {
  await import('./cluster/worker.js')
}
