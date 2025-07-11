import { WebClient } from '@slack/web-api';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { IClient } from '../models/Client.model';

/**
 * Interface for notification data
 */
export interface INotificationData {
  reviewId: string;
  clientName: string;
  authorName: string;
  rating: number;
  reviewText: string;
  sentiment: string;
  suggestedResponse: string;
  reviewUrl: string;
  urgency: string;
  riskLevel: string;
}

/**
 * Interface for notification result
 */
export interface INotificationResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Notification Service
 * Handles all external notifications including Slack and Email
 */
export class NotificationService {
  private slackClient: WebClient;
  private emailTransporter: Transporter;

  constructor() {
    // Initialize Slack client
    this.slackClient = new WebClient(config.slack.botToken);

    // Initialize email transporter
    this.emailTransporter = nodemailer.createTransporter({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.auth,
    });
  }

  /**
   * Send Slack notification for review requiring approval
   */
  public async sendSlackNotification(
    client: IClient,
    notificationData: INotificationData
  ): Promise<INotificationResult> {
    try {
      const slackChannel = client.notificationSettings.slackWebhookUrl 
        ? this.extractSlackChannelFromWebhook(client.notificationSettings.slackWebhookUrl)
        : config.slack.defaultChannel;

      // Build Slack message blocks
      const messageBlocks = this.buildSlackMessageBlocks(notificationData);

      // Send the message
      const result = await this.slackClient.chat.postMessage({
        channel: slackChannel,
        text: `🚨 New Review Alert for ${client.name}`,
        blocks: messageBlocks,
        username: 'Reputation Guardian',
        icon_emoji: ':rotating_light:',
      });

      if (result.ok) {
        logger.info('Successfully sent Slack notification', {
          clientId: client.id,
          reviewId: notificationData.reviewId,
          channel: slackChannel,
          messageTs: result.ts,
        });

        return {
          success: true,
          messageId: result.ts,
        };
      } else {
        throw new Error(result.error || 'Unknown Slack API error');
      }

    } catch (error) {
      logger.error('Failed to send Slack notification', {
        clientId: client.id,
        reviewId: notificationData.reviewId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Send email notification for review requiring approval
   */
  public async sendEmailNotification(
    client: IClient,
    notificationData: INotificationData
  ): Promise<INotificationResult> {
    try {
      const recipients = client.notificationSettings.notificationEmails;
      
      if (!recipients || recipients.length === 0) {
        logger.warn('No email recipients configured for client', {
          clientId: client.id,
        });
        
        return {
          success: false,
          error: 'No email recipients configured',
        };
      }

      // Build email content
      const emailSubject = this.buildEmailSubject(notificationData);
      const emailHtml = this.buildEmailHtml(notificationData);
      const emailText = this.buildEmailText(notificationData);

      // Send the email
      const mailOptions = {
        from: `${config.email.from.name} <${config.email.from.email}>`,
        to: recipients.join(', '),
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
      };

      const result = await this.emailTransporter.sendMail(mailOptions);

      logger.info('Successfully sent email notification', {
        clientId: client.id,
        reviewId: notificationData.reviewId,
        recipients: recipients.length,
        messageId: result.messageId,
      });

      return {
        success: true,
        messageId: result.messageId,
      };

    } catch (error) {
      logger.error('Failed to send email notification', {
        clientId: client.id,
        reviewId: notificationData.reviewId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Build Slack message blocks for rich formatting
   */
  private buildSlackMessageBlocks(data: INotificationData): any[] {
    const urgencyEmoji = this.getUrgencyEmoji(data.urgency);
    const sentimentEmoji = this.getSentimentEmoji(data.sentiment);
    const ratingStars = '⭐'.repeat(data.rating) + '☆'.repeat(5 - data.rating);

    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${urgencyEmoji} Review Alert: ${data.clientName}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Author:* ${data.authorName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Rating:* ${ratingStars} (${data.rating}/5)`,
          },
          {
            type: 'mrkdwn',
            text: `*Sentiment:* ${sentimentEmoji} ${data.sentiment}`,
          },
          {
            type: 'mrkdwn',
            text: `*Risk Level:* ${this.getRiskLevelIcon(data.riskLevel)} ${data.riskLevel}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Review:*\n"${this.truncateText(data.reviewText, 500)}"`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Suggested Response:*\n"${this.truncateText(data.suggestedResponse, 500)}"`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '👀 Review & Approve',
            },
            style: 'primary',
            url: data.reviewUrl,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Quick Approve',
            },
            style: 'primary',
            value: `approve_${data.reviewId}`,
            action_id: 'quick_approve_review',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Reject',
            },
            style: 'danger',
            value: `reject_${data.reviewId}`,
            action_id: 'reject_review',
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Review ID: ${data.reviewId} | Urgency: ${data.urgency}`,
          },
        ],
      },
    ];
  }

  /**
   * Build email subject line
   */
  private buildEmailSubject(data: INotificationData): string {
    const urgencyPrefix = data.urgency === 'High' ? '🚨 URGENT' : 
                          data.urgency === 'Medium' ? '⚠️' : 'ℹ️';
    
    return `${urgencyPrefix} Review Alert: ${data.clientName} - ${data.rating}⭐ ${data.sentiment} Review`;
  }

  /**
   * Build email HTML content
   */
  private buildEmailHtml(data: INotificationData): string {
    const ratingStars = '⭐'.repeat(data.rating) + '☆'.repeat(5 - data.rating);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Alert</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
        .review-box { background: white; border-left: 4px solid #${this.getRiskColor(data.riskLevel)}; padding: 15px; margin: 15px 0; border-radius: 0 4px 4px 0; }
        .response-box { background: #e8f5e8; border-left: 4px solid #28a745; padding: 15px; margin: 15px 0; border-radius: 0 4px 4px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
        .button:hover { background: #0056b3; }
        .button.approve { background: #28a745; }
        .button.approve:hover { background: #1e7e34; }
        .meta { font-size: 14px; color: #666; margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${this.getUrgencyEmoji(data.urgency)} Review Alert</h1>
        <h2>${data.clientName}</h2>
    </div>
    
    <div class="content">
        <h3>Review Details</h3>
        <p><strong>Author:</strong> ${data.authorName}</p>
        <p><strong>Rating:</strong> ${ratingStars} (${data.rating}/5)</p>
        <p><strong>Sentiment:</strong> ${this.getSentimentEmoji(data.sentiment)} ${data.sentiment}</p>
        <p><strong>Risk Level:</strong> ${this.getRiskLevelIcon(data.riskLevel)} ${data.riskLevel}</p>
        
        <div class="review-box">
            <h4>Customer Review:</h4>
            <p><em>"${data.reviewText}"</em></p>
        </div>
        
        <div class="response-box">
            <h4>AI Suggested Response:</h4>
            <p><em>"${data.suggestedResponse}"</em></p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="${data.reviewUrl}" class="button approve">👀 Review & Approve</a>
        </div>
        
        <div class="meta">
            <p><strong>Review ID:</strong> ${data.reviewId}</p>
            <p><strong>Urgency Level:</strong> ${data.urgency}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Build email plain text content
   */
  private buildEmailText(data: INotificationData): string {
    return `
REVIEW ALERT: ${data.clientName}

Author: ${data.authorName}
Rating: ${data.rating}/5 stars
Sentiment: ${data.sentiment}
Risk Level: ${data.riskLevel}
Urgency: ${data.urgency}

Customer Review:
"${data.reviewText}"

AI Suggested Response:
"${data.suggestedResponse}"

Review & Approve: ${data.reviewUrl}

Review ID: ${data.reviewId}
Generated: ${new Date().toLocaleString()}

--
Reputation Guardian
Automated Review Management System
    `.trim();
  }

  /**
   * Helper methods for formatting
   */
  private getUrgencyEmoji(urgency: string): string {
    const emojiMap: Record<string, string> = {
      'High': '🚨',
      'Medium': '⚠️',
      'Low': 'ℹ️',
    };
    return emojiMap[urgency] || 'ℹ️';
  }

  private getSentimentEmoji(sentiment: string): string {
    const emojiMap: Record<string, string> = {
      'Positive': '😊',
      'Negative': '😞',
      'Neutral': '😐',
    };
    return emojiMap[sentiment] || '😐';
  }

  private getRiskLevelIcon(riskLevel: string): string {
    const iconMap: Record<string, string> = {
      'High': '🔴',
      'Medium': '🟡',
      'Low': '🟢',
    };
    return iconMap[riskLevel] || '🟢';
  }

  private getRiskColor(riskLevel: string): string {
    const colorMap: Record<string, string> = {
      'High': 'dc3545',
      'Medium': 'ffc107',
      'Low': '28a745',
    };
    return colorMap[riskLevel] || '28a745';
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  private extractSlackChannelFromWebhook(webhookUrl: string): string {
    // Extract channel from webhook URL if possible, otherwise use default
    return config.slack.defaultChannel;
  }

  /**
   * Test email configuration
   */
  public async testEmailConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.emailTransporter.verify();
      logger.info('Email connection test successful');
      return { success: true };
    } catch (error) {
      logger.error('Email connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Email connection test failed',
      };
    }
  }

  /**
   * Test Slack connection
   */
  public async testSlackConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.slackClient.auth.test();
      
      if (result.ok) {
        logger.info('Slack connection test successful', {
          team: result.team,
          user: result.user,
        });
        return { success: true };
      } else {
        throw new Error(result.error || 'Unknown Slack API error');
      }
    } catch (error) {
      logger.error('Slack connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Slack connection test failed',
      };
    }
  }

  /**
   * Send a test notification
   */
  public async sendTestNotification(
    client: IClient,
    type: 'slack' | 'email' | 'both' = 'both'
  ): Promise<{ slack?: INotificationResult; email?: INotificationResult }> {
    const testData: INotificationData = {
      reviewId: 'test-review-id',
      clientName: client.name,
      authorName: 'Test Customer',
      rating: 3,
      reviewText: 'This is a test review to verify the notification system is working correctly.',
      sentiment: 'Neutral',
      suggestedResponse: 'Thank you for your feedback. We appreciate you taking the time to share your experience.',
      reviewUrl: 'https://example.com/review/test',
      urgency: 'Medium',
      riskLevel: 'Low',
    };

    const results: { slack?: INotificationResult; email?: INotificationResult } = {};

    if (type === 'slack' || type === 'both') {
      results.slack = await this.sendSlackNotification(client, testData);
    }

    if (type === 'email' || type === 'both') {
      results.email = await this.sendEmailNotification(client, testData);
    }

    return results;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();