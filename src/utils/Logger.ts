import { inspect } from 'util'
import chalk from 'chalk'
import dayjs from 'dayjs'

/**
 * Provides some logs for info, errors and warns
 * @typedef {Logger} Logger
 */
export class Logger {
  /**
   * Used to have the date on the log more simply
   * @function date()
   */
  static get date() {
    return chalk.gray(dayjs(Date.now()).format('MM-DD-YY HH:MM:ss'))
  }

  /**
   * Used to format arguments.
   * @function formatInput()
   * @param {Object} args - Message(s) to be shown in the log.
   * @returns {Object}
   */
  static formatInput(args: any[]) {
    return args.map((arg) => arg instanceof Array ? inspect(arg) : arg)
  }

  /**
   * Used to display some messages.
   * @function logger.log()
   * @param {Object} args - Message(s) to be shown in the log.
   * @param worker
   * @returns {void}
   */
  static log(worker, ...args: string[]) {
    args = this.formatInput(args)
    console.log(`${chalk.blue(`[${worker}]`)} | ${chalk.blue('[INFO]')} - [${this.date}] - ${args.join(' ')}`)
  }

  /**
   * Used to display warnings messages.
   * @function logger.warn()
   * @param {Object} args - Message(s) to be shown in the log.
   * @param worker
   * @returns {void}
   */
  static warn(worker, ...args: string[]) {
    args = this.formatInput(args)
    console.warn(`${chalk.yellow(`[${worker}]`)} | ${chalk.yellow('[WARN]')} - [${this.date}] - ${args.join(' ')}`)
  }

  /**
   * Used to display errors messages.
   * @function logger.error()
   * @param {Object} args - Message(s) to be shown in the log.
   * @param worker
   * @returns {void}
   */
  static error(worker, ...args: string[]) {
    args = this.formatInput(args)
    console.error(`${chalk.red(`[${worker}]`)} | ${chalk.red('[ERROR]')} - [${this.date}] - ${args.join(' ')}`)
  }
}
