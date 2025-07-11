import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Redis connection configuration
 */
export const redisConnection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
});

/**
 * Queue configuration options
 */
const queueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 100,    // Keep last 100 failed jobs
    attempts: 3,          // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,        // Start with 2 second delay
    },
  },
};

/**
 * Worker configuration options
 */
const workerOptions: WorkerOptions = {
  connection: redisConnection,
  concurrency: 5,        // Process up to 5 jobs concurrently
  removeOnComplete: 50,
  removeOnFail: 100,
};

/**
 * Queue for handling review request outreach
 */
export const outreachQueue = new Queue('outreach', queueOptions);

/**
 * Queue for handling AI processing tasks
 */
export const aiProcessingQueue = new Queue('ai-processing', queueOptions);

/**
 * Queue for handling notifications
 */
export const notificationQueue = new Queue('notifications', queueOptions);

/**
 * Queue for handling data cleanup tasks
 */
export const cleanupQueue = new Queue('cleanup', queueOptions);

/**
 * Setup queue event listeners for monitoring
 */
export function setupQueueEventListeners(): void {
  // Outreach queue events
  outreachQueue.on('completed', (job) => {
    logger.info('Outreach job completed', {
      jobId: job.id,
      jobName: job.name,
      duration: Date.now() - job.timestamp,
    });
  });

  outreachQueue.on('failed', (job, err) => {
    logger.error('Outreach job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  outreachQueue.on('stalled', (jobId) => {
    logger.warn('Outreach job stalled', { jobId });
  });

  // AI processing queue events
  aiProcessingQueue.on('completed', (job) => {
    logger.info('AI processing job completed', {
      jobId: job.id,
      jobName: job.name,
      duration: Date.now() - job.timestamp,
    });
  });

  aiProcessingQueue.on('failed', (job, err) => {
    logger.error('AI processing job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  // Notification queue events
  notificationQueue.on('completed', (job) => {
    logger.info('Notification job completed', {
      jobId: job.id,
      jobName: job.name,
      duration: Date.now() - job.timestamp,
    });
  });

  notificationQueue.on('failed', (job, err) => {
    logger.error('Notification job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  // Cleanup queue events
  cleanupQueue.on('completed', (job) => {
    logger.info('Cleanup job completed', {
      jobId: job.id,
      jobName: job.name,
      duration: Date.now() - job.timestamp,
    });
  });

  cleanupQueue.on('failed', (job, err) => {
    logger.error('Cleanup job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  logger.info('Queue event listeners setup completed');
}

/**
 * Add a delayed review request job
 */
export async function addReviewRequestJob(
  clientId: string,
  customerData: {
    name: string;
    email?: string;
    phone?: string;
    preferredMethod?: 'email' | 'sms' | 'both';
  },
  delayHours: number = config.reviewRequest.delayHours
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const job = await outreachQueue.add(
      'send-review-request',
      {
        clientId,
        customerData,
        requestedAt: new Date().toISOString(),
      },
      {
        delay: delayHours * 60 * 60 * 1000, // Convert hours to milliseconds
        jobId: `review-request-${clientId}-${Date.now()}`,
      }
    );

    logger.info('Review request job added to queue', {
      jobId: job.id,
      clientId,
      customerName: customerData.name,
      delayHours,
    });

    return {
      success: true,
      jobId: job.id as string,
    };

  } catch (error) {
    logger.error('Failed to add review request job', {
      clientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add job to queue',
    };
  }
}

/**
 * Add an AI processing job
 */
export async function addAiProcessingJob(
  type: 'sentiment-analysis' | 'response-generation' | 'review-analysis',
  data: any,
  priority: number = 0
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const job = await aiProcessingQueue.add(
      type,
      data,
      {
        priority,
        jobId: `ai-${type}-${Date.now()}`,
      }
    );

    logger.info('AI processing job added to queue', {
      jobId: job.id,
      type,
      priority,
    });

    return {
      success: true,
      jobId: job.id as string,
    };

  } catch (error) {
    logger.error('Failed to add AI processing job', {
      type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add job to queue',
    };
  }
}

/**
 * Add a notification job
 */
export async function addNotificationJob(
  type: 'slack' | 'email' | 'sms',
  data: any,
  priority: number = 0
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const job = await notificationQueue.add(
      `send-${type}-notification`,
      data,
      {
        priority,
        jobId: `notification-${type}-${Date.now()}`,
      }
    );

    logger.info('Notification job added to queue', {
      jobId: job.id,
      type,
      priority,
    });

    return {
      success: true,
      jobId: job.id as string,
    };

  } catch (error) {
    logger.error('Failed to add notification job', {
      type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add job to queue',
    };
  }
}

/**
 * Add a cleanup job
 */
export async function addCleanupJob(
  type: 'old-reviews' | 'expired-tokens' | 'temp-files',
  data: any = {},
  scheduleTime?: Date
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const jobOptions: any = {
      jobId: `cleanup-${type}-${Date.now()}`,
    };

    if (scheduleTime) {
      jobOptions.delay = scheduleTime.getTime() - Date.now();
    }

    const job = await cleanupQueue.add(
      `cleanup-${type}`,
      data,
      jobOptions
    );

    logger.info('Cleanup job added to queue', {
      jobId: job.id,
      type,
      scheduleTime: scheduleTime?.toISOString(),
    });

    return {
      success: true,
      jobId: job.id as string,
    };

  } catch (error) {
    logger.error('Failed to add cleanup job', {
      type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add job to queue',
    };
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  outreach: any;
  aiProcessing: any;
  notifications: any;
  cleanup: any;
}> {
  try {
    const [outreachStats, aiStats, notificationStats, cleanupStats] = await Promise.all([
      outreachQueue.getJobCounts(),
      aiProcessingQueue.getJobCounts(),
      notificationQueue.getJobCounts(),
      cleanupQueue.getJobCounts(),
    ]);

    return {
      outreach: outreachStats,
      aiProcessing: aiStats,
      notifications: notificationStats,
      cleanup: cleanupStats,
    };

  } catch (error) {
    logger.error('Failed to get queue statistics', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      outreach: {},
      aiProcessing: {},
      notifications: {},
      cleanup: {},
    };
  }
}

/**
 * Clear all completed jobs from queues
 */
export async function clearCompletedJobs(): Promise<void> {
  try {
    await Promise.all([
      outreachQueue.clean(0, 0, 'completed'),
      aiProcessingQueue.clean(0, 0, 'completed'),
      notificationQueue.clean(0, 0, 'completed'),
      cleanupQueue.clean(0, 0, 'completed'),
    ]);

    logger.info('Cleared completed jobs from all queues');

  } catch (error) {
    logger.error('Failed to clear completed jobs', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Clear all failed jobs from queues
 */
export async function clearFailedJobs(): Promise<void> {
  try {
    await Promise.all([
      outreachQueue.clean(0, 0, 'failed'),
      aiProcessingQueue.clean(0, 0, 'failed'),
      notificationQueue.clean(0, 0, 'failed'),
      cleanupQueue.clean(0, 0, 'failed'),
    ]);

    logger.info('Cleared failed jobs from all queues');

  } catch (error) {
    logger.error('Failed to clear failed jobs', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Shutdown all queues gracefully
 */
export async function shutdownQueues(): Promise<void> {
  try {
    logger.info('Shutting down queues...');

    await Promise.all([
      outreachQueue.close(),
      aiProcessingQueue.close(),
      notificationQueue.close(),
      cleanupQueue.close(),
    ]);

    await redisConnection.disconnect();

    logger.info('All queues shutdown successfully');

  } catch (error) {
    logger.error('Error during queue shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Initialize queues and setup event listeners
 */
export async function initializeQueues(): Promise<void> {
  try {
    logger.info('Initializing BullMQ queues...');

    // Setup event listeners
    setupQueueEventListeners();

    // Test Redis connection
    await redisConnection.ping();
    logger.info('Redis connection established successfully');

    // Schedule recurring cleanup job (daily at 2 AM)
    await cleanupQueue.add(
      'cleanup-old-reviews',
      { daysToKeep: 90 },
      {
        repeat: {
          pattern: '0 2 * * *', // Daily at 2 AM
        },
        jobId: 'recurring-cleanup-old-reviews',
      }
    );

    logger.info('BullMQ queues initialized successfully');

  } catch (error) {
    logger.error('Failed to initialize queues', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// Handle process termination
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down queues...');
  await shutdownQueues();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down queues...');
  await shutdownQueues();
  process.exit(0);
});