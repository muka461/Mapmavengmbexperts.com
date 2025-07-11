import winston from 'winston';
import { config } from '../config/env';

/**
 * Logger configuration using Winston
 */
class Logger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const logMessage = stack || message;
          const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level.toUpperCase()}]: ${logMessage}${metaString}`;
        })
      ),
      defaultMeta: { service: 'reputation-guardian' },
      transports: this.getTransports(),
    });
  }

  /**
   * Get winston transports based on environment
   */
  private getTransports(): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport for all environments
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      })
    );

    // File transport for production and development
    if (config.env !== 'test') {
      transports.push(
        new winston.transports.File({
          filename: config.logging.filePath,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        })
      );

      // Separate error log file
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        })
      );
    }

    return transports;
  }

  /**
   * Log error message
   */
  public error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  /**
   * Log warning message
   */
  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  /**
   * Log info message
   */
  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  /**
   * Log debug message
   */
  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  /**
   * Log HTTP request
   */
  public http(message: string, meta?: any): void {
    this.logger.http(message, meta);
  }

  /**
   * Create child logger with additional context
   */
  public child(context: object): winston.Logger {
    return this.logger.child(context);
  }

  /**
   * Get the underlying winston logger instance
   */
  public getInstance(): winston.Logger {
    return this.logger;
  }
}

// Export singleton instance
export const logger = new Logger();