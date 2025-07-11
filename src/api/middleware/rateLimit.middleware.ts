import rateLimit from 'express-rate-limit';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Rate Limit Middleware
 * Implements different rate limiting strategies for various endpoints
 */
export class RateLimitMiddleware {
  
  /**
   * Standard rate limit for general API endpoints
   */
  public standardRateLimit = rateLimit({
    windowMs: config.security.rateLimit.windowMs, // 15 minutes
    max: config.security.rateLimit.maxRequests, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
      error: 'Too many requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000),
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    },
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
      });
      
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000),
      });
    },
  });

  /**
   * Stricter rate limit for webhook endpoints
   */
  public webhookRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // Allow 50 webhook requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Webhook rate limit exceeded',
      message: 'Too many webhook requests from this IP, please try again later.',
      retryAfter: 60,
    },
    handler: (req, res) => {
      logger.warn('Webhook rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        bodySize: JSON.stringify(req.body).length,
      });
      
      res.status(429).json({
        success: false,
        error: 'Webhook rate limit exceeded',
        message: 'Too many webhook requests from this IP, please try again later.',
        retryAfter: 60,
      });
    },
  });

  /**
   * More lenient rate limit for authenticated users
   */
  public authenticatedRateLimit = rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.maxRequests * 2, // Double the limit for authenticated users
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use user ID for authenticated requests, fall back to IP
      return req.user?.id || req.ip;
    },
    message: {
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000),
    },
    handler: (req, res) => {
      logger.warn('Authenticated rate limit exceeded', {
        userId: req.user?.id,
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: 'Too many requests, please try again later.',
        retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000),
      });
    },
  });

  /**
   * Very strict rate limit for sensitive operations
   */
  public sensitiveOperationRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // Only 5 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Sensitive operation rate limit exceeded',
      message: 'Too many sensitive operation requests, please try again later.',
      retryAfter: 60,
    },
    handler: (req, res) => {
      logger.warn('Sensitive operation rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
      });
      
      res.status(429).json({
        success: false,
        error: 'Sensitive operation rate limit exceeded',
        message: 'Too many sensitive operation requests, please try again later.',
        retryAfter: 60,
      });
    },
  });

  /**
   * Rate limit for authentication endpoints
   */
  public authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 auth requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
    message: {
      error: 'Authentication rate limit exceeded',
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil((15 * 60 * 1000) / 1000),
    },
    handler: (req, res) => {
      logger.warn('Authentication rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
      });
      
      res.status(429).json({
        success: false,
        error: 'Authentication rate limit exceeded',
        message: 'Too many authentication attempts, please try again later.',
        retryAfter: Math.ceil((15 * 60 * 1000) / 1000),
      });
    },
  });

  /**
   * Dynamic rate limit based on user tier or subscription
   */
  public dynamicRateLimit = (req: any, res: any, next: any) => {
    const user = req.user;
    let maxRequests = config.security.rateLimit.maxRequests;
    
    // Adjust rate limit based on user tier
    if (user?.tier === 'premium') {
      maxRequests *= 5;
    } else if (user?.tier === 'professional') {
      maxRequests *= 3;
    } else if (user?.tier === 'basic') {
      maxRequests *= 2;
    }

    const dynamicLimiter = rateLimit({
      windowMs: config.security.rateLimit.windowMs,
      max: maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.user?.id || req.ip,
      message: {
        error: 'Rate limit exceeded',
        message: `Rate limit exceeded for ${user?.tier || 'free'} tier. Upgrade for higher limits.`,
        retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000),
        currentTier: user?.tier || 'free',
        currentLimit: maxRequests,
      },
      handler: (req, res) => {
        logger.warn('Dynamic rate limit exceeded', {
          userId: user?.id,
          userTier: user?.tier,
          ip: req.ip,
          path: req.path,
          currentLimit: maxRequests,
        });
        
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: `Rate limit exceeded for ${user?.tier || 'free'} tier. Upgrade for higher limits.`,
          retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000),
          currentTier: user?.tier || 'free',
          currentLimit: maxRequests,
        });
      },
    });

    return dynamicLimiter(req, res, next);
  };

  /**
   * Rate limit for file uploads
   */
  public uploadRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 uploads per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Upload rate limit exceeded',
      message: 'Too many upload requests, please try again later.',
      retryAfter: 60,
    },
    handler: (req, res) => {
      logger.warn('Upload rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
      });
      
      res.status(429).json({
        success: false,
        error: 'Upload rate limit exceeded',
        message: 'Too many upload requests, please try again later.',
        retryAfter: 60,
      });
    },
  });
}

// Export singleton instance
export const rateLimitMiddleware = new RateLimitMiddleware();