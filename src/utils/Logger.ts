import { inspect } from 'util'
import chalk from 'chalk'
import { consola } from 'consola'

/**
 * Provides some logs for info, errors and warns
 * @class Logger
 */
export class Logger {
  /**
   * Used to format arguments.
   * @function formatInput()
   * @param {(string | object)[]} args - Message(s) to be shown in the log.
   * @returns string[]
   */
  formatInput(args: (string | object)[]): string[] {
    return args.map((arg) => arg instanceof Object ? inspect(arg, { depth: 4 }) : arg)
  }

  /**
   * Used to display some messages.
   * @function log()
   * @param {string} worker The worker's identifier
   * @param {(string | object)[]} args Message(s) to be shown in the
   * @returns {void}
   */
  log(worker: string, ...args: (string | object)[]): void {
    args = this.formatInput(args)
    return consola.info(`${chalk.cyan(`[${worker}]`)} | ${args}`)
  }

  /**
   * Used to display some debugging messages.
   * @function debug()
   * @param {string} worker The worker's identifier
   * @param {(string | object)[]} args Message(s) to be shown in the
   * @returns {void}
   */
  debug(worker: string, ...args: (string | object)[]): void {
    args = this.formatInput(args)
    return consola.debug(`${chalk.green(`[${worker}]`)} | [${chalk.green('DEBUG')}] - ${args}`)
  }

  /**
   * Used to display warnings messages.
   * @function warn()
   * @param {string} worker The worker's identifier
   * @param {(string | object)[]} args Message(s) to be shown in the warn log.
   * @returns {void}
   */
  warn(worker: string, ...args: (string | object)[]): void {
    args = this.formatInput(args)
    return consola.warn(`${chalk.yellow(`[${worker}]`)} | ${args}`)
  }

  /**
   * Used to display errors messages.
   * @function error()
   * @param {string} worker The worker's identifier
   * @param {(string | object)[]} args Message(s) to be shown in the error log.
   * @returns {void}
   */
  error(worker: string, ...args: (string | object)[]): void {
    args = this.formatInput(args)
    return consola.error(`${chalk.red(`[${worker}]`)} | ${args}`)
  }
}
