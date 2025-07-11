import { Worker, Job } from 'bullmq';
import { redisConnection } from './queue.setup';
import { outreachService, ICustomerContact, IReviewRequestData } from '../services/outreach.service';
import { Client } from '../models/Client.model';
import { logger } from '../utils/logger';

/**
 * Interface for review request job data
 */
interface IReviewRequestJobData {
  clientId: string;
  customerData: {
    name: string;
    email?: string;
    phone?: string;
    preferredMethod?: 'email' | 'sms' | 'both';
  };
  requestedAt: string;
}

/**
 * Outreach Worker
 * Processes delayed review request jobs
 */
export class OutreachWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'outreach',
      this.processJob.bind(this),
      {
        connection: redisConnection,
        concurrency: 3, // Process up to 3 jobs concurrently
        removeOnComplete: 50,
        removeOnFail: 100,
      }
    );

    this.setupEventListeners();
  }

  /**
   * Process a review request job
   */
  private async processJob(job: Job<IReviewRequestJobData>): Promise<void> {
    const { clientId, customerData, requestedAt } = job.data;

    try {
      logger.info('Processing review request job', {
        jobId: job.id,
        clientId,
        customerName: customerData.name,
        requestedAt,
      });

      // Find the client
      const client = await Client.findById(clientId);
      if (!client) {
        throw new Error(`Client not found: ${clientId}`);
      }

      if (!client.isActive) {
        logger.warn('Skipping review request for inactive client', {
          jobId: job.id,
          clientId,
        });
        return;
      }

      // Validate customer contact information
      const validation = outreachService.validateCustomerContact(customerData);
      if (!validation.valid) {
        throw new Error(`Invalid customer data: ${validation.errors.join(', ')}`);
      }

      // Prepare review request data
      const reviewRequestData: IReviewRequestData = {
        clientName: client.name,
        customerName: customerData.name,
        reviewLinks: {
          primary: client.reviewLinks.gmb || '',
          gmb: client.reviewLinks.gmb,
          facebook: client.reviewLinks.facebook,
        },
        businessType: client.industryProfile.primaryIndustry,
        location: `${client.industryProfile.region}, ${client.industryProfile.country}`,
        personalizedMessage: undefined, // Could be customized per client
      };

      // Validate that we have at least a primary review link
      if (!reviewRequestData.reviewLinks.primary) {
        throw new Error('Client does not have a primary review link configured');
      }

      // Send the review request
      const result = await outreachService.sendReviewRequest(
        client,
        customerData as ICustomerContact,
        reviewRequestData
      );

      if (result.success) {
        logger.info('Review request sent successfully', {
          jobId: job.id,
          clientId,
          customerName: customerData.name,
          method: result.method,
          messageId: result.messageId,
        });

        // Update client's last activity
        await client.updateLastActivity();
      } else {
        throw new Error(result.error || 'Failed to send review request');
      }

    } catch (error) {
      logger.error('Review request job failed', {
        jobId: job.id,
        clientId,
        customerName: customerData.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts: job.attemptsMade,
      });

      throw error; // Re-throw to trigger retry mechanism
    }
  }

  /**
   * Setup event listeners for the worker
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job) => {
      logger.info('Outreach worker job completed', {
        jobId: job.id,
        jobName: job.name,
        duration: Date.now() - job.timestamp,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Outreach worker job failed', {
        jobId: job?.id,
        jobName: job?.name,
        error: err.message,
        attempts: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
      });
    });

    this.worker.on('error', (err) => {
      logger.error('Outreach worker error', {
        error: err.message,
      });
    });

    this.worker.on('stalled', (jobId) => {
      logger.warn('Outreach worker job stalled', {
        jobId,
      });
    });

    logger.info('Outreach worker event listeners setup completed');
  }

  /**
   * Start the worker
   */
  public async start(): Promise<void> {
    try {
      await this.worker.waitUntilReady();
      logger.info('Outreach worker started successfully');
    } catch (error) {
      logger.error('Failed to start outreach worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Stop the worker gracefully
   */
  public async stop(): Promise<void> {
    try {
      await this.worker.close();
      logger.info('Outreach worker stopped successfully');
    } catch (error) {
      logger.error('Error stopping outreach worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get worker statistics
   */
  public getStats(): any {
    return {
      isRunning: this.worker.isRunning(),
      // Add more stats as needed
    };
  }
}

/**
 * Additional worker for handling notification jobs
 */
export class NotificationWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'notifications',
      this.processNotificationJob.bind(this),
      {
        connection: redisConnection,
        concurrency: 5, // Process more notification jobs concurrently
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );

    this.setupEventListeners();
  }

  /**
   * Process a notification job
   */
  private async processNotificationJob(job: Job): Promise<void> {
    const { type, data } = job.data;

    try {
      logger.info('Processing notification job', {
        jobId: job.id,
        type,
      });

      // Import notification service here to avoid circular dependencies
      const { notificationService } = await import('../services/notification.service');

      switch (type) {
        case 'slack':
          await notificationService.sendSlackNotification(data.client, data.notificationData);
          break;
        
        case 'email':
          await notificationService.sendEmailNotification(data.client, data.notificationData);
          break;
        
        default:
          throw new Error(`Unknown notification type: ${type}`);
      }

      logger.info('Notification job completed successfully', {
        jobId: job.id,
        type,
      });

    } catch (error) {
      logger.error('Notification job failed', {
        jobId: job.id,
        type: job.data.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Setup event listeners for the notification worker
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job) => {
      logger.info('Notification worker job completed', {
        jobId: job.id,
        jobName: job.name,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Notification worker job failed', {
        jobId: job?.id,
        jobName: job?.name,
        error: err.message,
      });
    });

    this.worker.on('error', (err) => {
      logger.error('Notification worker error', {
        error: err.message,
      });
    });
  }

  /**
   * Start the notification worker
   */
  public async start(): Promise<void> {
    try {
      await this.worker.waitUntilReady();
      logger.info('Notification worker started successfully');
    } catch (error) {
      logger.error('Failed to start notification worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Stop the notification worker gracefully
   */
  public async stop(): Promise<void> {
    try {
      await this.worker.close();
      logger.info('Notification worker stopped successfully');
    } catch (error) {
      logger.error('Error stopping notification worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

// Export worker instances
export const outreachWorker = new OutreachWorker();
export const notificationWorker = new NotificationWorker();