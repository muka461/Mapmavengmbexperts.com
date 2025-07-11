import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/env';
import { database } from './config/database';
import { logger } from './utils/logger';
import { initializeQueues } from './jobs/queue.setup';
import { outreachWorker, notificationWorker } from './jobs/outreach.worker';

// Import routes
import webhookRoutes from './api/routes/webhook.routes';

/**
 * Application class that sets up and manages the Express server
 */
class Application {
  public app: Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = config.port;
    
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize Express middlewares
   */
  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? [config.apiBaseUrl] 
        : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Signature'],
    }));

    // Compression middleware
    this.app.use(compression());

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req: any, res: any, buf: Buffer) => {
        // Store raw body for webhook signature verification
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // Log request
      logger.http('Incoming request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length'),
      });

      // Override res.json to log response
      const originalJson = res.json;
      res.json = function(body: any) {
        const responseTime = Date.now() - startTime;
        
        logger.http('Outgoing response', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime,
          contentLength: JSON.stringify(body).length,
        });

        return originalJson.call(this, body);
      };

      next();
    });
  }

  /**
   * Initialize API routes
   */
  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.env,
      });
    });

    // API routes
    this.app.use('/api/webhooks', webhookRoutes);

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        message: 'Reputation Guardian API',
        version: process.env.npm_package_version || '1.0.0',
        documentation: `${config.apiBaseUrl}/docs`,
        health: `${config.apiBaseUrl}/health`,
      });
    });

    // 404 handler for undefined routes
    this.app.use('*', (req: Request, res: Response) => {
      logger.warn('Route not found', {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
      });

      res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
      });
    });
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        ip: req.ip,
      });

      // Don't leak error details in production
      const errorMessage = config.env === 'production' 
        ? 'Internal server error' 
        : err.message;

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: errorMessage,
        ...(config.env !== 'production' && { stack: err.stack }),
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      
      // Exit gracefully
      this.shutdown();
    });
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      logger.info('Starting Reputation Guardian server...');

      // Connect to database
      logger.info('Connecting to database...');
      await database.connect();

      // Initialize background job queues
      logger.info('Initializing background job queues...');
      await initializeQueues();

      // Start background workers
      logger.info('Starting background workers...');
      await outreachWorker.start();
      await notificationWorker.start();

      // Start HTTP server
      const server = this.app.listen(this.port, () => {
        logger.info(`🚀 Server started successfully on port ${this.port}`, {
          port: this.port,
          environment: config.env,
          apiBaseUrl: config.apiBaseUrl,
        });

        logger.info('Available endpoints:', {
          health: `${config.apiBaseUrl}/health`,
          webhooks: `${config.apiBaseUrl}/api/webhooks`,
          gmbWebhook: `${config.apiBaseUrl}/api/webhooks/gmb`,
        });
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown(server);

      // Test external services
      await this.testExternalServices();

    } catch (error) {
      logger.error('Failed to start server', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Test external services connectivity
   */
  private async testExternalServices(): Promise<void> {
    try {
      logger.info('Testing external services...');

      // Test OpenAI connection
      try {
        const { aiService } = await import('./services/ai.service');
        const aiConnected = await aiService.testConnection();
        logger.info(`OpenAI connection: ${aiConnected ? '✅ Connected' : '❌ Failed'}`);
      } catch (error) {
        logger.warn('OpenAI connection test failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Test email service
      try {
        const { notificationService } = await import('./services/notification.service');
        const emailResult = await notificationService.testEmailConnection();
        logger.info(`Email service: ${emailResult.success ? '✅ Connected' : '❌ Failed'}`);
      } catch (error) {
        logger.warn('Email service test failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Test Slack connection
      try {
        const { notificationService } = await import('./services/notification.service');
        const slackResult = await notificationService.testSlackConnection();
        logger.info(`Slack service: ${slackResult.success ? '✅ Connected' : '❌ Failed'}`);
      } catch (error) {
        logger.warn('Slack service test failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      logger.info('External services testing completed');

    } catch (error) {
      logger.warn('External services testing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(server: any): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server stopped accepting new connections');

        try {
          // Stop background workers
          logger.info('Stopping background workers...');
          await outreachWorker.stop();
          await notificationWorker.stop();

          // Close database connection
          logger.info('Closing database connection...');
          await database.disconnect();

          logger.info('Graceful shutdown completed');
          process.exit(0);

        } catch (error) {
          logger.error('Error during graceful shutdown', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Shutdown the application
   */
  private shutdown(): void {
    logger.info('Shutting down application...');
    process.exit(1);
  }
}

// Create and start the application
const app = new Application();

// Only start the server if this file is executed directly (not imported)
if (require.main === module) {
  app.start().catch((error) => {
    logger.error('Failed to start application', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  });
}

export default app;