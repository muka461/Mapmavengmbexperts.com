import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

/**
 * Webhook Validation Middleware
 * Validates incoming webhook requests
 */
export class WebhookValidationMiddleware {
  
  /**
   * Validate webhook body
   */
  public validateWebhookBody = (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if body exists
      if (!req.body) {
        logger.warn('Webhook received without body', {
          ip: req.ip,
          path: req.path,
          method: req.method,
        });
        
        res.status(400).json({
          success: false,
          error: 'Request body is required',
        });
        return;
      }

      // Check if body is empty object
      if (typeof req.body === 'object' && Object.keys(req.body).length === 0) {
        logger.warn('Webhook received with empty body', {
          ip: req.ip,
          path: req.path,
          method: req.method,
        });
        
        res.status(400).json({
          success: false,
          error: 'Request body cannot be empty',
        });
        return;
      }

      // Check body size (limit to 1MB)
      const bodySize = JSON.stringify(req.body).length;
      const maxSize = 1024 * 1024; // 1MB

      if (bodySize > maxSize) {
        logger.warn('Webhook body size exceeds limit', {
          ip: req.ip,
          path: req.path,
          bodySize,
          maxSize,
        });
        
        res.status(413).json({
          success: false,
          error: 'Request body too large',
          maxSize: `${maxSize / 1024 / 1024}MB`,
        });
        return;
      }

      // Validate Content-Type header
      const contentType = req.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Invalid Content-Type for webhook', {
          ip: req.ip,
          path: req.path,
          contentType,
        });
        
        res.status(400).json({
          success: false,
          error: 'Content-Type must be application/json',
        });
        return;
      }

      // Add webhook metadata to request
      req.webhookMetadata = {
        receivedAt: new Date(),
        bodySize,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      };

      next();

    } catch (error) {
      logger.error('Webhook validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: 'Webhook validation failed',
      });
    }
  };

  /**
   * Validate GMB webhook specific requirements
   */
  public validateGmbWebhook = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const body = req.body;

      // Check for required GMB fields
      if (!body.eventType) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: eventType',
        });
        return;
      }

      if (!body.location || !body.location.locationId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: location.locationId',
        });
        return;
      }

      // For review events, validate review data
      if (body.eventType.includes('review')) {
        if (!body.review) {
          res.status(400).json({
            success: false,
            error: 'Missing review data for review event',
          });
          return;
        }

        const review = body.review;
        if (!review.reviewId || !review.reviewer?.displayName || !review.comment) {
          res.status(400).json({
            success: false,
            error: 'Invalid review data structure',
          });
          return;
        }

        if (!['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].includes(review.starRating)) {
          res.status(400).json({
            success: false,
            error: 'Invalid star rating value',
          });
          return;
        }
      }

      next();

    } catch (error) {
      logger.error('GMB webhook validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: 'GMB webhook validation failed',
      });
    }
  };

  /**
   * Validate Facebook webhook specific requirements
   */
  public validateFacebookWebhook = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const body = req.body;

      // Basic Facebook webhook validation
      if (!body.object) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: object',
        });
        return;
      }

      if (!body.entry || !Array.isArray(body.entry)) {
        res.status(400).json({
          success: false,
          error: 'Missing or invalid entry array',
        });
        return;
      }

      next();

    } catch (error) {
      logger.error('Facebook webhook validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: 'Facebook webhook validation failed',
      });
    }
  };

  /**
   * Validate User-Agent header
   */
  public validateUserAgent = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const userAgent = req.get('User-Agent');
      
      if (!userAgent) {
        logger.warn('Webhook received without User-Agent header', {
          ip: req.ip,
          path: req.path,
        });
        
        res.status(400).json({
          success: false,
          error: 'User-Agent header is required',
        });
        return;
      }

      // Check if User-Agent seems legitimate (basic check)
      if (userAgent.length < 10 || userAgent.includes('bot') || userAgent.includes('curl')) {
        logger.warn('Suspicious User-Agent detected', {
          ip: req.ip,
          path: req.path,
          userAgent,
        });
        
        // Don't block but log the suspicious activity
        // In production, you might want to implement more sophisticated bot detection
      }

      next();

    } catch (error) {
      logger.error('User-Agent validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: 'User-Agent validation failed',
      });
    }
  };

  /**
   * Validate webhook timing (reject very old requests)
   */
  public validateTimestamp = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const timestamp = req.get('X-Timestamp') || req.body.timestamp;
      
      if (timestamp) {
        const webhookTime = new Date(timestamp);
        const now = new Date();
        const timeDiff = now.getTime() - webhookTime.getTime();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        if (timeDiff > maxAge) {
          logger.warn('Webhook timestamp too old', {
            ip: req.ip,
            path: req.path,
            timestamp,
            timeDiff,
            maxAge,
          });
          
          res.status(400).json({
            success: false,
            error: 'Webhook timestamp too old',
            maxAge: `${maxAge / 1000} seconds`,
          });
          return;
        }
      }

      next();

    } catch (error) {
      logger.error('Timestamp validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: 'Timestamp validation failed',
      });
    }
  };

  /**
   * Sanitize webhook data to prevent XSS and injection attacks
   */
  public sanitizeWebhookData = (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Basic sanitization function
      const sanitizeValue = (value: any): any => {
        if (typeof value === 'string') {
          // Remove potentially dangerous characters
          return value
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
        }
        if (Array.isArray(value)) {
          return value.map(sanitizeValue);
        }
        if (typeof value === 'object' && value !== null) {
          const sanitized: any = {};
          for (const [key, val] of Object.entries(value)) {
            sanitized[key] = sanitizeValue(val);
          }
          return sanitized;
        }
        return value;
      };

      // Sanitize the request body
      req.body = sanitizeValue(req.body);

      next();

    } catch (error) {
      logger.error('Webhook data sanitization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        path: req.path,
      });

      res.status(500).json({
        success: false,
        error: 'Webhook data sanitization failed',
      });
    }
  };
}

// Extend Express Request interface to include webhook metadata
declare global {
  namespace Express {
    interface Request {
      webhookMetadata?: {
        receivedAt: Date;
        bodySize: number;
        ip: string;
        userAgent?: string;
      };
      user?: {
        id: string;
        tier?: string;
      };
    }
  }
}

// Export singleton instance
export const webhookValidationMiddleware = new WebhookValidationMiddleware();