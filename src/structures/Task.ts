import { CronJob } from 'cron'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Server } from './Server'
dayjs.extend(duration)
dayjs.extend(relativeTime)

export class Task extends Server {
  name: string
  noDevelopment: boolean
  job: CronJob

  constructor(options) {
    super()

    this.name = options.name
    this.noDevelopment = options.noDevelopment || false

    this.job = new CronJob(options.interval, () => {
      if (process.env.NODE_ENV === 'development' && this.noDevelopment) return

      process.send({ type: 'log', content: `[Task] ${this.name} was executed.` })
      this.execute()
    }, null, true)
  }

  execute(): void {
    throw new Error('You must implement execute() method.')
  }

  timeUntil() {
    return dayjs.duration(this.job.nextDate() - Date.now()).humanize(true)
  }
}
