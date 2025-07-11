import mongoose from 'mongoose';
import { config } from './env';
import { logger } from '../utils/logger';

/**
 * MongoDB connection configuration and setup
 */
export class Database {
  private static instance: Database;
  private isConnected: boolean = false;

  private constructor() {}

  /**
   * Get singleton instance of Database
   */
  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  /**
   * Connect to MongoDB database
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      logger.info('Database already connected');
      return;
    }

    try {
      // Set mongoose connection options
      const options = {
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        bufferMaxEntries: 0, // Disable mongoose buffering
        bufferCommands: false, // Disable mongoose buffering
        family: 4, // Use IPv4, skip trying IPv6
      };

      await mongoose.connect(config.database.uri, options);
      
      this.isConnected = true;
      logger.info(`MongoDB connected successfully to: ${config.database.uri}`);

      // Set up connection event listeners
      this.setupEventListeners();

    } catch (error) {
      logger.error('MongoDB connection error:', error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB database
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('MongoDB disconnected successfully');
    } catch (error) {
      logger.error('MongoDB disconnection error:', error);
      throw error;
    }
  }

  /**
   * Check if database is connected
   */
  public getConnectionStatus(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * Get mongoose connection instance
   */
  public getConnection(): mongoose.Connection {
    return mongoose.connection;
  }

  /**
   * Setup event listeners for database connection
   */
  private setupEventListeners(): void {
    const db = mongoose.connection;

    db.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
    });

    db.on('error', (error) => {
      logger.error('Mongoose connection error:', error);
    });

    db.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    db.on('reconnected', () => {
      logger.info('Mongoose reconnected to MongoDB');
      this.isConnected = true;
    });

    // If the Node process ends, close the Mongoose connection
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  /**
   * Health check for database connection
   */
  public async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      if (!this.getConnectionStatus()) {
        return { status: 'disconnected' };
      }

      // Simple ping to check database responsiveness
      await mongoose.connection.db.admin().ping();
      
      return {
        status: 'connected',
        details: {
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          name: mongoose.connection.name,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        details: error,
      };
    }
  }
}

// Export singleton instance
export const database = Database.getInstance();