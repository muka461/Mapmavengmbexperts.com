import twilio, { Twilio } from 'twilio';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { IClient } from '../models/Client.model';

/**
 * Interface for customer contact information
 */
export interface ICustomerContact {
  name: string;
  email?: string;
  phone?: string;
  preferredMethod?: 'email' | 'sms' | 'both';
}

/**
 * Interface for outreach result
 */
export interface IOutreachResult {
  success: boolean;
  method: 'email' | 'sms' | 'both';
  messageId?: string;
  error?: string;
}

/**
 * Interface for review request data
 */
export interface IReviewRequestData {
  clientName: string;
  customerName: string;
  reviewLinks: {
    gmb?: string;
    facebook?: string;
    primary: string;
  };
  businessType: string;
  location: string;
  personalizedMessage?: string;
}

/**
 * Outreach Service
 * Handles sending review requests via SMS and Email
 */
export class OutreachService {
  private twilioClient: Twilio;
  private emailTransporter: Transporter;

  constructor() {
    // Initialize Twilio client
    this.twilioClient = twilio(
      config.twilio.accountSid,
      config.twilio.authToken
    );

    // Initialize email transporter
    this.emailTransporter = nodemailer.createTransporter({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.auth,
    });
  }

  /**
   * Send review request to customer
   */
  public async sendReviewRequest(
    client: IClient,
    customer: ICustomerContact,
    reviewRequestData: IReviewRequestData
  ): Promise<IOutreachResult> {
    try {
      logger.info('Sending review request', {
        clientId: client.id,
        customerName: customer.name,
        method: customer.preferredMethod,
      });

      const method = customer.preferredMethod || 'email';
      
      switch (method) {
        case 'email':
          return await this.sendEmailReviewRequest(client, customer, reviewRequestData);
        
        case 'sms':
          return await this.sendSmsReviewRequest(client, customer, reviewRequestData);
        
        case 'both':
          return await this.sendBothReviewRequest(client, customer, reviewRequestData);
        
        default:
          return await this.sendEmailReviewRequest(client, customer, reviewRequestData);
      }

    } catch (error) {
      logger.error('Failed to send review request', {
        clientId: client.id,
        customerName: customer.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: customer.preferredMethod || 'email',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Send review request via email
   */
  private async sendEmailReviewRequest(
    client: IClient,
    customer: ICustomerContact,
    reviewRequestData: IReviewRequestData
  ): Promise<IOutreachResult> {
    try {
      if (!customer.email) {
        throw new Error('Customer email address is required');
      }

      const emailSubject = this.buildEmailSubject(reviewRequestData);
      const emailHtml = this.buildEmailHtml(reviewRequestData);
      const emailText = this.buildEmailText(reviewRequestData);

      const mailOptions = {
        from: `${config.email.from.name} <${config.email.from.email}>`,
        to: customer.email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
      };

      const result = await this.emailTransporter.sendMail(mailOptions);

      logger.info('Email review request sent successfully', {
        clientId: client.id,
        customerEmail: customer.email,
        messageId: result.messageId,
      });

      return {
        success: true,
        method: 'email',
        messageId: result.messageId,
      };

    } catch (error) {
      logger.error('Failed to send email review request', {
        clientId: client.id,
        customerEmail: customer.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: 'email',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Send review request via SMS
   */
  private async sendSmsReviewRequest(
    client: IClient,
    customer: ICustomerContact,
    reviewRequestData: IReviewRequestData
  ): Promise<IOutreachResult> {
    try {
      if (!customer.phone) {
        throw new Error('Customer phone number is required');
      }

      const smsMessage = this.buildSmsMessage(reviewRequestData);

      const message = await this.twilioClient.messages.create({
        body: smsMessage,
        from: config.twilio.phoneNumber,
        to: customer.phone,
      });

      logger.info('SMS review request sent successfully', {
        clientId: client.id,
        customerPhone: customer.phone,
        messageSid: message.sid,
      });

      return {
        success: true,
        method: 'sms',
        messageId: message.sid,
      };

    } catch (error) {
      logger.error('Failed to send SMS review request', {
        clientId: client.id,
        customerPhone: customer.phone,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: 'sms',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Send review request via both email and SMS
   */
  private async sendBothReviewRequest(
    client: IClient,
    customer: ICustomerContact,
    reviewRequestData: IReviewRequestData
  ): Promise<IOutreachResult> {
    const emailResult = await this.sendEmailReviewRequest(client, customer, reviewRequestData);
    const smsResult = await this.sendSmsReviewRequest(client, customer, reviewRequestData);

    // Return success if at least one method succeeded
    if (emailResult.success || smsResult.success) {
      return {
        success: true,
        method: 'both',
        messageId: `email:${emailResult.messageId},sms:${smsResult.messageId}`,
      };
    } else {
      return {
        success: false,
        method: 'both',
        error: `Email: ${emailResult.error}, SMS: ${smsResult.error}`,
      };
    }
  }

  /**
   * Build email subject for review request
   */
  private buildEmailSubject(data: IReviewRequestData): string {
    return `Thank you for choosing ${data.clientName}! Share your experience 🌟`;
  }

  /**
   * Build email HTML content for review request
   */
  private buildEmailHtml(data: IReviewRequestData): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Request</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; }
        .container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .content { padding: 30px 20px; }
        .cta-section { text-align: center; margin: 30px 0; }
        .review-button { display: inline-block; padding: 15px 30px; background: #28a745; color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; margin: 10px; box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3); transition: all 0.3s ease; }
        .review-button:hover { background: #218838; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(40, 167, 69, 0.4); }
        .secondary-button { background: #007bff; box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3); }
        .secondary-button:hover { background: #0056b3; box-shadow: 0 6px 20px rgba(0, 123, 255, 0.4); }
        .stars { font-size: 24px; color: #ffc107; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .personalized { background: #e8f5e8; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Thank You, ${data.customerName}! 🙏</h1>
            <p>We hope you had a great experience with ${data.clientName}</p>
        </div>
        
        <div class="content">
            <p>Hi ${data.customerName},</p>
            
            <p>Thank you for choosing <strong>${data.clientName}</strong> for your ${data.businessType.toLowerCase()} needs in ${data.location}. We truly appreciate your business!</p>
            
            ${data.personalizedMessage ? `
            <div class="personalized">
                <p><strong>A personal note from our team:</strong></p>
                <p><em>${data.personalizedMessage}</em></p>
            </div>
            ` : ''}
            
            <p>If you were happy with our service, we would be incredibly grateful if you could take a moment to share your experience online. Your feedback helps us improve and helps other customers make informed decisions.</p>
            
            <div class="cta-section">
                <p class="stars">⭐ ⭐ ⭐ ⭐ ⭐</p>
                <p><strong>Choose your preferred platform:</strong></p>
                
                <a href="${data.reviewLinks.primary}" class="review-button">
                    📍 Leave a Google Review
                </a>
                
                ${data.reviewLinks.facebook ? `
                <a href="${data.reviewLinks.facebook}" class="review-button secondary-button">
                    📘 Review on Facebook
                </a>
                ` : ''}
            </div>
            
            <p>Your review takes less than 2 minutes and means the world to us! If you experienced any issues, please don't hesitate to contact us directly so we can make things right.</p>
            
            <p>Thank you again for your trust in ${data.clientName}!</p>
            
            <p>Best regards,<br>
            The ${data.clientName} Team</p>
        </div>
        
        <div class="footer">
            <p>This review request was sent because you recently used our services.</p>
            <p>If you have any questions, please contact us directly.</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Build email plain text content for review request
   */
  private buildEmailText(data: IReviewRequestData): string {
    return `
Thank You, ${data.customerName}!

Hi ${data.customerName},

Thank you for choosing ${data.clientName} for your ${data.businessType.toLowerCase()} needs in ${data.location}. We truly appreciate your business!

${data.personalizedMessage ? `\nA personal note from our team:\n${data.personalizedMessage}\n` : ''}

If you were happy with our service, we would be incredibly grateful if you could take a moment to share your experience online. Your feedback helps us improve and helps other customers make informed decisions.

Please leave a review on Google: ${data.reviewLinks.primary}

${data.reviewLinks.facebook ? `Or review us on Facebook: ${data.reviewLinks.facebook}\n` : ''}

Your review takes less than 2 minutes and means the world to us! If you experienced any issues, please don't hesitate to contact us directly so we can make things right.

Thank you again for your trust in ${data.clientName}!

Best regards,
The ${data.clientName} Team

--
This review request was sent because you recently used our services.
If you have any questions, please contact us directly.
    `.trim();
  }

  /**
   * Build SMS message for review request
   */
  private buildSmsMessage(data: IReviewRequestData): string {
    return `Hi ${data.customerName}! Thank you for choosing ${data.clientName}. If you were happy with our service, we'd love a quick review: ${data.reviewLinks.primary} - It takes 2 minutes and helps us serve you better! 🌟`;
  }

  /**
   * Send WhatsApp review request (if enabled)
   */
  public async sendWhatsAppReviewRequest(
    client: IClient,
    customer: ICustomerContact,
    reviewRequestData: IReviewRequestData
  ): Promise<IOutreachResult> {
    try {
      if (!customer.phone) {
        throw new Error('Customer phone number is required for WhatsApp');
      }

      if (!config.twilio.whatsappNumber) {
        throw new Error('WhatsApp number not configured');
      }

      const whatsappMessage = this.buildWhatsAppMessage(reviewRequestData);

      const message = await this.twilioClient.messages.create({
        body: whatsappMessage,
        from: config.twilio.whatsappNumber,
        to: `whatsapp:${customer.phone}`,
      });

      logger.info('WhatsApp review request sent successfully', {
        clientId: client.id,
        customerPhone: customer.phone,
        messageSid: message.sid,
      });

      return {
        success: true,
        method: 'sms', // WhatsApp uses SMS method internally
        messageId: message.sid,
      };

    } catch (error) {
      logger.error('Failed to send WhatsApp review request', {
        clientId: client.id,
        customerPhone: customer.phone,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: 'sms',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Build WhatsApp message for review request
   */
  private buildWhatsAppMessage(data: IReviewRequestData): string {
    return `🙏 Hi ${data.customerName}! 

Thank you for choosing ${data.clientName}! We hope you had a great experience with our ${data.businessType.toLowerCase()} services in ${data.location}.

${data.personalizedMessage ? `\n💭 ${data.personalizedMessage}\n` : ''}

⭐ If you were satisfied with our service, we'd be grateful for a quick review:
${data.reviewLinks.primary}

Your feedback helps us improve and helps other customers! Takes just 2 minutes 😊

Thanks again! 
- The ${data.clientName} Team`;
  }

  /**
   * Test SMS service
   */
  public async testSmsService(testPhoneNumber: string): Promise<{ success: boolean; error?: string }> {
    try {
      const message = await this.twilioClient.messages.create({
        body: 'Test message from Reputation Guardian - SMS service is working correctly! 🎉',
        from: config.twilio.phoneNumber,
        to: testPhoneNumber,
      });

      logger.info('SMS test message sent successfully', {
        testPhoneNumber,
        messageSid: message.sid,
      });

      return { success: true };

    } catch (error) {
      logger.error('SMS test failed', {
        testPhoneNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'SMS test failed',
      };
    }
  }

  /**
   * Test email service
   */
  public async testEmailService(testEmail: string): Promise<{ success: boolean; error?: string }> {
    try {
      const mailOptions = {
        from: `${config.email.from.name} <${config.email.from.email}>`,
        to: testEmail,
        subject: 'Test Email from Reputation Guardian',
        text: 'This is a test email to verify the email service is working correctly.',
        html: `
          <h2>Email Service Test</h2>
          <p>This is a test email to verify the email service is working correctly.</p>
          <p><strong>✅ Email service is functioning properly!</strong></p>
          <p>Sent from Reputation Guardian</p>
        `,
      };

      const result = await this.emailTransporter.sendMail(mailOptions);

      logger.info('Test email sent successfully', {
        testEmail,
        messageId: result.messageId,
      });

      return { success: true };

    } catch (error) {
      logger.error('Email test failed', {
        testEmail,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Email test failed',
      };
    }
  }

  /**
   * Validate customer contact information
   */
  public validateCustomerContact(customer: ICustomerContact): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!customer.name || customer.name.trim().length === 0) {
      errors.push('Customer name is required');
    }

    if (!customer.email && !customer.phone) {
      errors.push('Either email or phone number must be provided');
    }

    if (customer.email && !this.isValidEmail(customer.email)) {
      errors.push('Invalid email format');
    }

    if (customer.phone && !this.isValidPhoneNumber(customer.phone)) {
      errors.push('Invalid phone number format');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Basic phone number validation - adjust as needed
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }
}

// Export singleton instance
export const outreachService = new OutreachService();