import { Client, IClient } from '../models/Client.model';
import { Review, IReview } from '../models/Review.model';
import { aiService, IReviewData } from './ai.service';
import { gmbService } from './gmb.service';
import { notificationService } from './notification.service';
import { logger } from '../utils/logger';

/**
 * Interface for incoming review payload
 */
export interface IIncomingReview {
  gmbLocationId: string;
  reviewData: {
    authorName: string;
    authorPhotoUrl?: string;
    rating: number;
    text: string;
    reviewTime: string | Date;
    reviewId?: string;
    source: string;
    platformSpecificData?: Record<string, any>;
  };
}

/**
 * Interface for processing result
 */
export interface IProcessingResult {
  success: boolean;
  reviewId: string;
  status: string;
  message: string;
  processingTime: number;
  aiAnalysis?: any;
  suggestedResponse?: string;
}

/**
 * Review Processor Service
 * This is the master orchestrator that handles the entire review processing cycle
 */
export class ReviewProcessor {
  
  /**
   * Master function to process incoming reviews
   * This handles the entire workflow from ingestion to response or approval
   */
  public async processIncomingReview(
    incomingReview: IIncomingReview
  ): Promise<IProcessingResult> {
    const startTime = Date.now();
    let review: IReview | null = null;

    try {
      logger.info('Starting review processing', {
        gmbLocationId: incomingReview.gmbLocationId,
        authorName: incomingReview.reviewData.authorName,
        rating: incomingReview.reviewData.rating,
        source: incomingReview.reviewData.source,
      });

      // Step 1: Find the client by GMB location ID
      const client = await this.findClientByGmbLocationId(incomingReview.gmbLocationId);
      if (!client) {
        throw new Error(`Client not found for GMB location ID: ${incomingReview.gmbLocationId}`);
      }

      // Step 2: Check for duplicate reviews
      const existingReview = await this.checkForDuplicateReview(incomingReview);
      if (existingReview) {
        logger.warn('Duplicate review detected, skipping processing', {
          existingReviewId: existingReview.id,
          reviewId: incomingReview.reviewData.reviewId,
        });
        
        return {
          success: true,
          reviewId: existingReview.id,
          status: 'Duplicate',
          message: 'Review already exists in the system',
          processingTime: Date.now() - startTime,
        };
      }

      // Step 3: Create and save the initial review record
      review = await this.createReviewRecord(incomingReview, client);

      // Step 4: Perform AI analysis and generate response
      const aiResult = await this.performAiAnalysis(review, client);

      // Step 5: Update review with AI analysis results
      await this.updateReviewWithAiResults(review, aiResult);

      // Step 6: Handle the response based on sentiment
      const responseResult = await this.handleResponse(review, client, aiResult);

      const processingTime = Date.now() - startTime;
      
      logger.info('Review processing completed successfully', {
        reviewId: review.id,
        clientId: client.id,
        sentiment: aiResult.analysis.sentiment,
        status: review.status,
        processingTime,
      });

      return {
        success: true,
        reviewId: review.id,
        status: review.status,
        message: responseResult.message,
        processingTime,
        aiAnalysis: aiResult.analysis,
        suggestedResponse: aiResult.suggestedResponse,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      
      logger.error('Review processing failed', {
        error: errorMessage,
        gmbLocationId: incomingReview.gmbLocationId,
        reviewId: review?.id,
        processingTime,
      });

      // Update review status to failed if review was created
      if (review) {
        try {
          review.status = 'Failed';
          review.notes = `Processing failed: ${errorMessage}`;
          await review.save();
        } catch (saveError) {
          logger.error('Failed to update review status to failed', { 
            reviewId: review.id,
            error: saveError instanceof Error ? saveError.message : 'Unknown save error'
          });
        }
      }

      return {
        success: false,
        reviewId: review?.id || 'unknown',
        status: 'Failed',
        message: errorMessage,
        processingTime,
      };
    }
  }

  /**
   * Find client by GMB location ID
   */
  private async findClientByGmbLocationId(gmbLocationId: string): Promise<IClient | null> {
    try {
      return await Client.findByGmbLocationId(gmbLocationId);
    } catch (error) {
      logger.error('Failed to find client by GMB location ID', {
        gmbLocationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Check for duplicate reviews
   */
  private async checkForDuplicateReview(
    incomingReview: IIncomingReview
  ): Promise<IReview | null> {
    if (!incomingReview.reviewData.reviewId) {
      return null; // Can't check for duplicates without review ID
    }

    try {
      return await Review.findOne({
        'originalReview.reviewId': incomingReview.reviewData.reviewId,
        source: incomingReview.reviewData.source,
      });
    } catch (error) {
      logger.error('Failed to check for duplicate review', {
        reviewId: incomingReview.reviewData.reviewId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Create initial review record
   */
  private async createReviewRecord(
    incomingReview: IIncomingReview,
    client: IClient
  ): Promise<IReview> {
    try {
      const review = new Review({
        client: client._id,
        source: incomingReview.reviewData.source,
        originalReview: {
          authorName: incomingReview.reviewData.authorName,
          authorPhotoUrl: incomingReview.reviewData.authorPhotoUrl,
          rating: incomingReview.reviewData.rating,
          text: incomingReview.reviewData.text,
          reviewTime: new Date(incomingReview.reviewData.reviewTime),
          reviewId: incomingReview.reviewData.reviewId,
          platformSpecificData: incomingReview.reviewData.platformSpecificData || {},
        },
        status: 'Processing',
        responseTracking: {
          responsePosted: false,
        },
        flaggedForReview: false,
        tags: [],
      });

      return await review.save();
    } catch (error) {
      logger.error('Failed to create review record', {
        error: error instanceof Error ? error.message : 'Unknown error',
        clientId: client.id,
      });
      throw error;
    }
  }

  /**
   * Perform AI analysis on the review
   */
  private async performAiAnalysis(review: IReview, client: IClient) {
    const reviewData: IReviewData = {
      authorName: review.originalReview.authorName,
      rating: review.originalReview.rating,
      text: review.originalReview.text,
      reviewTime: review.originalReview.reviewTime,
      source: review.source,
    };

    try {
      return await aiService.analyzeAndRespond(reviewData, client);
    } catch (error) {
      logger.error('AI analysis failed for review', {
        reviewId: review.id,
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update review with AI analysis results
   */
  private async updateReviewWithAiResults(
    review: IReview,
    aiResult: any
  ): Promise<void> {
    try {
      review.aiAnalysis = aiResult.analysis;
      review.suggestedResponse = aiResult.suggestedResponse;
      
      // Auto-flag high-risk reviews
      if (aiResult.analysis.riskLevel === 'High' || aiResult.analysis.urgency === 'High') {
        review.flaggedForReview = true;
        review.tags.push('high-risk', 'urgent');
      }

      await review.save();
    } catch (error) {
      logger.error('Failed to update review with AI results', {
        reviewId: review.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Handle response based on sentiment analysis
   * Core business logic: Positive reviews auto-respond, negative/neutral require approval
   */
  private async handleResponse(
    review: IReview,
    client: IClient,
    aiResult: any
  ): Promise<{ message: string; action: string }> {
    const sentiment = aiResult.analysis.sentiment;
    
    try {
      if (sentiment === 'Positive' && aiResult.analysis.riskLevel === 'Low') {
        // Auto-respond to positive, low-risk reviews
        return await this.autoRespondToPositiveReview(review, client, aiResult.suggestedResponse);
      } else {
        // Send for human approval for negative/neutral/high-risk reviews
        return await this.sendForApproval(review, client, aiResult);
      }
    } catch (error) {
      logger.error('Failed to handle response', {
        reviewId: review.id,
        sentiment,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Auto-respond to positive reviews
   */
  private async autoRespondToPositiveReview(
    review: IReview,
    client: IClient,
    suggestedResponse: string
  ): Promise<{ message: string; action: string }> {
    try {
      // Post response to GMB
      const responseResult = await gmbService.postReply(
        client,
        review.originalReview.reviewId || '',
        suggestedResponse
      );

      if (responseResult.success) {
        // Update review status
        await review.markAsResponded(
          suggestedResponse,
          responseResult.platformResponseId
        );

        logger.info('Auto-responded to positive review', {
          reviewId: review.id,
          clientId: client.id,
        });

        return {
          message: 'Positive review auto-responded successfully',
          action: 'auto_responded',
        };
      } else {
        // If posting failed, send for approval
        review.status = 'AwaitingApproval';
        review.notes = `Auto-response failed: ${responseResult.error}`;
        await review.save();

        await this.sendNotificationForApproval(review, client);

        return {
          message: 'Auto-response failed, sent for manual approval',
          action: 'sent_for_approval',
        };
      }
    } catch (error) {
      logger.error('Failed to auto-respond to positive review', {
        reviewId: review.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Fallback to manual approval
      review.status = 'AwaitingApproval';
      review.notes = `Auto-response error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      await review.save();

      await this.sendNotificationForApproval(review, client);

      return {
        message: 'Auto-response error, sent for manual approval',
        action: 'sent_for_approval',
      };
    }
  }

  /**
   * Send review for human approval
   */
  private async sendForApproval(
    review: IReview,
    client: IClient,
    aiResult: any
  ): Promise<{ message: string; action: string }> {
    try {
      // Update review status
      review.status = 'AwaitingApproval';
      await review.save();

      // Send notifications
      await this.sendNotificationForApproval(review, client);

      logger.info('Review sent for approval', {
        reviewId: review.id,
        clientId: client.id,
        sentiment: aiResult.analysis.sentiment,
        riskLevel: aiResult.analysis.riskLevel,
      });

      return {
        message: 'Review sent for human approval',
        action: 'sent_for_approval',
      };
    } catch (error) {
      logger.error('Failed to send review for approval', {
        reviewId: review.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Send notifications for reviews requiring approval
   */
  private async sendNotificationForApproval(
    review: IReview,
    client: IClient
  ): Promise<void> {
    try {
      const notificationData = {
        reviewId: review.id,
        clientName: client.name,
        authorName: review.originalReview.authorName,
        rating: review.originalReview.rating,
        reviewText: review.originalReview.text,
        sentiment: review.aiAnalysis?.sentiment || 'Unknown',
        suggestedResponse: review.suggestedResponse || '',
        reviewUrl: this.buildReviewManagementUrl(review.id),
        urgency: review.aiAnalysis?.urgency || 'Medium',
        riskLevel: review.aiAnalysis?.riskLevel || 'Low',
      };

      // Send Slack notification if enabled
      if (client.notificationSettings.enableSlackNotifications) {
        await notificationService.sendSlackNotification(client, notificationData);
      }

      // Send email notifications if enabled
      if (client.notificationSettings.enableEmailNotifications) {
        await notificationService.sendEmailNotification(client, notificationData);
      }

      logger.info('Approval notifications sent', {
        reviewId: review.id,
        clientId: client.id,
        slackEnabled: client.notificationSettings.enableSlackNotifications,
        emailEnabled: client.notificationSettings.enableEmailNotifications,
      });

    } catch (error) {
      logger.error('Failed to send approval notifications', {
        reviewId: review.id,
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw here - notification failure shouldn't stop processing
    }
  }

  /**
   * Build URL for review management interface
   */
  private buildReviewManagementUrl(reviewId: string): string {
    // This would be the URL to your review management dashboard
    return `${process.env.API_BASE_URL || 'http://localhost:3000'}/dashboard/reviews/${reviewId}`;
  }

  /**
   * Process approved review response
   * This would be called when a human approves a response
   */
  public async processApprovedResponse(
    reviewId: string,
    approvedResponse: string,
    approvedBy: string,
    editedResponse?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const review = await Review.findById(reviewId).populate('client');
      if (!review) {
        throw new Error('Review not found');
      }

      const client = review.client as IClient;
      const responseToPost = editedResponse || approvedResponse;

      // Post the approved response
      const responseResult = await gmbService.postReply(
        client,
        review.originalReview.reviewId || '',
        responseToPost
      );

      if (responseResult.success) {
        // Mark as approved and responded
        await review.markAsApproved(approvedBy, editedResponse);
        await review.markAsResponded(responseToPost, responseResult.platformResponseId);

        logger.info('Approved response posted successfully', {
          reviewId: review.id,
          clientId: client.id,
          approvedBy,
        });

        return {
          success: true,
          message: 'Response posted successfully',
        };
      } else {
        throw new Error(`Failed to post response: ${responseResult.error}`);
      }

    } catch (error) {
      logger.error('Failed to process approved response', {
        reviewId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get review processing statistics
   */
  public async getProcessingStats(clientId?: string, days = 30): Promise<any> {
    try {
      const stats = await Review.getReviewStats(clientId, days);
      
      // Add additional processing-specific stats
      const processingStats = await Review.aggregate([
        {
          $match: {
            ...(clientId && { client: clientId }),
            createdAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: null,
            autoResponded: {
              $sum: { $cond: [{ $eq: ['$status', 'Responded'] }, 1, 0] }
            },
            awaitingApproval: {
              $sum: { $cond: [{ $eq: ['$status', 'AwaitingApproval'] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$status', 'Failed'] }, 1, 0] }
            },
            flaggedForReview: {
              $sum: { $cond: ['$flaggedForReview', 1, 0] }
            }
          }
        }
      ]);

      return {
        ...stats[0],
        ...processingStats[0],
      };

    } catch (error) {
      logger.error('Failed to get processing stats', {
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

// Export singleton instance
export const reviewProcessor = new ReviewProcessor();