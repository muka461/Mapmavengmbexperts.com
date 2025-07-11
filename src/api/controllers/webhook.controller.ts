import { Request, Response } from 'express';
import { reviewProcessor, IIncomingReview } from '../../services/review.processor';
import { logger } from '../../utils/logger';
import { config } from '../../config/env';
import crypto from 'crypto';

/**
 * Interface for GMB webhook payload
 */
interface IGmbWebhookPayload {
  eventType: string;
  eventTime: string;
  location: {
    name: string;
    locationId: string;
  };
  review?: {
    name: string;
    reviewId: string;
    reviewer: {
      profilePhotoUrl?: string;
      displayName: string;
    };
    starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
    comment: string;
    createTime: string;
    updateTime: string;
  };
}

/**
 * Webhook Controller
 * Handles incoming webhooks from various review platforms
 */
export class WebhookController {
  
  /**
   * Handle Google My Business webhook
   * This is the main entry point for processing GMB reviews
   */
  public async handleGmbWebhook(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Received GMB webhook', {
        headers: req.headers,
        bodySize: JSON.stringify(req.body).length,
        ip: req.ip,
      });

      // Verify webhook signature for security
      if (!this.verifyWebhookSignature(req)) {
        logger.warn('Invalid webhook signature', {
          signature: req.headers['x-webhook-signature'],
          ip: req.ip,
        });
        
        res.status(401).json({
          success: false,
          error: 'Invalid webhook signature',
        });
        return;
      }

      const payload = req.body as IGmbWebhookPayload;
      
      // Validate payload structure
      if (!this.validateGmbPayload(payload)) {
        logger.warn('Invalid GMB webhook payload structure', {
          payload,
          ip: req.ip,
        });
        
        res.status(400).json({
          success: false,
          error: 'Invalid payload structure',
        });
        return;
      }

      // Only process review events
      if (payload.eventType !== 'review.created' && payload.eventType !== 'review.updated') {
        logger.info('Ignoring non-review event', {
          eventType: payload.eventType,
          locationId: payload.location?.locationId,
        });
        
        res.status(200).json({
          success: true,
          message: 'Event acknowledged but not processed',
        });
        return;
      }

      // Transform GMB payload to our internal format
      const incomingReview = this.transformGmbPayload(payload);
      
      // Process the review
      const processingResult = await reviewProcessor.processIncomingReview(incomingReview);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('GMB webhook processing completed', {
        success: processingResult.success,
        reviewId: processingResult.reviewId,
        status: processingResult.status,
        totalProcessingTime: processingTime,
        gmbLocationId: incomingReview.gmbLocationId,
      });

      // Return response
      res.status(processingResult.success ? 200 : 500).json({
        success: processingResult.success,
        message: processingResult.message,
        reviewId: processingResult.reviewId,
        status: processingResult.status,
        processingTime: processingResult.processingTime,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('GMB webhook processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        payload: req.body,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to process webhook',
      });
    }
  }

  /**
   * Handle Facebook webhook (placeholder)
   */
  public async handleFacebookWebhook(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Received Facebook webhook', {
        headers: req.headers,
        bodySize: JSON.stringify(req.body).length,
        ip: req.ip,
      });

      // Placeholder for Facebook webhook verification and processing
      // Implementation would be similar to GMB but with Facebook-specific payload format

      res.status(200).json({
        success: true,
        message: 'Facebook webhook received (processing not yet implemented)',
      });

    } catch (error) {
      logger.error('Facebook webhook processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        payload: req.body,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Handle generic webhook for other platforms
   */
  public async handleGenericWebhook(req: Request, res: Response): Promise<void> {
    try {
      const platform = req.params.platform || 'unknown';
      
      logger.info('Received generic webhook', {
        platform,
        headers: req.headers,
        bodySize: JSON.stringify(req.body).length,
        ip: req.ip,
      });

      // Basic acknowledgment - specific implementation would depend on platform
      res.status(200).json({
        success: true,
        message: `${platform} webhook received`,
      });

    } catch (error) {
      logger.error('Generic webhook processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        platform: req.params.platform,
        payload: req.body,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Webhook health check endpoint
   */
  public async healthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      message: 'Webhook endpoint is healthy',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Verify webhook signature for security
   */
  private verifyWebhookSignature(req: Request): boolean {
    try {
      const signature = req.headers['x-webhook-signature'] as string;
      const body = JSON.stringify(req.body);
      
      if (!signature) {
        return false;
      }

      // Create expected signature
      const expectedSignature = crypto
        .createHmac('sha256', config.webhook.secret)
        .update(body)
        .digest('hex');

      // Compare signatures securely
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(`sha256=${expectedSignature}`)
      );

    } catch (error) {
      logger.error('Webhook signature verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Validate GMB webhook payload structure
   */
  private validateGmbPayload(payload: any): payload is IGmbWebhookPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    // Check required fields
    if (!payload.eventType || typeof payload.eventType !== 'string') {
      return false;
    }

    if (!payload.location || !payload.location.locationId) {
      return false;
    }

    // For review events, validate review data
    if (payload.eventType.includes('review') && !payload.review) {
      return false;
    }

    if (payload.review) {
      const review = payload.review;
      
      if (!review.reviewId || !review.reviewer?.displayName || !review.comment) {
        return false;
      }

      if (!['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].includes(review.starRating)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Transform GMB webhook payload to our internal format
   */
  private transformGmbPayload(payload: IGmbWebhookPayload): IIncomingReview {
    const review = payload.review!;
    
    // Convert GMB star rating to numeric
    const ratingMap: Record<string, number> = {
      'ONE': 1,
      'TWO': 2,
      'THREE': 3,
      'FOUR': 4,
      'FIVE': 5,
    };

    return {
      gmbLocationId: payload.location.locationId,
      reviewData: {
        authorName: review.reviewer.displayName,
        authorPhotoUrl: review.reviewer.profilePhotoUrl,
        rating: ratingMap[review.starRating],
        text: review.comment,
        reviewTime: review.createTime,
        reviewId: review.reviewId,
        source: 'GMB',
        platformSpecificData: {
          gmbName: review.name,
          updateTime: review.updateTime,
          eventType: payload.eventType,
          eventTime: payload.eventTime,
        },
      },
    };
  }

  /**
   * Manual review submission endpoint (for testing or manual entry)
   */
  public async submitManualReview(req: Request, res: Response): Promise<void> {
    try {
      const {
        gmbLocationId,
        authorName,
        rating,
        text,
        source = 'Manual',
        reviewId,
      } = req.body;

      // Validate required fields
      if (!gmbLocationId || !authorName || !rating || !text) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: gmbLocationId, authorName, rating, text',
        });
        return;
      }

      // Validate rating range
      if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        res.status(400).json({
          success: false,
          error: 'Rating must be an integer between 1 and 5',
        });
        return;
      }

      const incomingReview: IIncomingReview = {
        gmbLocationId,
        reviewData: {
          authorName,
          rating,
          text,
          reviewTime: new Date(),
          source,
          reviewId: reviewId || `manual-${Date.now()}`,
          platformSpecificData: {
            submittedBy: 'manual-entry',
            submittedAt: new Date().toISOString(),
          },
        },
      };

      // Process the review
      const processingResult = await reviewProcessor.processIncomingReview(incomingReview);

      logger.info('Manual review submitted and processed', {
        success: processingResult.success,
        reviewId: processingResult.reviewId,
        gmbLocationId,
        authorName,
        rating,
      });

      res.status(processingResult.success ? 200 : 500).json({
        success: processingResult.success,
        message: processingResult.message,
        reviewId: processingResult.reviewId,
        status: processingResult.status,
        processingTime: processingResult.processingTime,
      });

    } catch (error) {
      logger.error('Manual review submission failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        body: req.body,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to process manual review',
      });
    }
  }

  /**
   * Get webhook processing statistics
   */
  public async getWebhookStats(req: Request, res: Response): Promise<void> {
    try {
      const { clientId, days = 30 } = req.query;
      
      const stats = await reviewProcessor.getProcessingStats(
        clientId as string,
        parseInt(days as string)
      );

      res.status(200).json({
        success: true,
        data: stats,
        period: `${days} days`,
        generatedAt: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Failed to get webhook stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: req.query,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve statistics',
      });
    }
  }

  /**
   * Test webhook endpoint for development/debugging
   */
  public async testWebhook(req: Request, res: Response): Promise<void> {
    try {
      const testPayload: IGmbWebhookPayload = {
        eventType: 'review.created',
        eventTime: new Date().toISOString(),
        location: {
          name: 'Test Business Location',
          locationId: req.body.gmbLocationId || 'test-location-id',
        },
        review: {
          name: 'locations/test-location-id/reviews/test-review-id',
          reviewId: 'test-review-id',
          reviewer: {
            displayName: 'Test Customer',
            profilePhotoUrl: 'https://example.com/photo.jpg',
          },
          starRating: 'FOUR',
          comment: 'This is a test review for development and testing purposes.',
          createTime: new Date().toISOString(),
          updateTime: new Date().toISOString(),
        },
      };

      // Process test payload
      const incomingReview = this.transformGmbPayload(testPayload);
      const processingResult = await reviewProcessor.processIncomingReview(incomingReview);

      logger.info('Test webhook processed', {
        success: processingResult.success,
        reviewId: processingResult.reviewId,
      });

      res.status(200).json({
        success: true,
        message: 'Test webhook processed successfully',
        testPayload,
        processingResult,
      });

    } catch (error) {
      logger.error('Test webhook failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Test webhook processing failed',
      });
    }
  }
}

// Export singleton instance
export const webhookController = new WebhookController();