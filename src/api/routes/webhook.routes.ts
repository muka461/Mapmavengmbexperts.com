import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';
import { webhookValidationMiddleware } from '../middleware/webhookValidation.middleware';

const router = Router();

/**
 * Webhook Routes
 * Handles incoming webhooks from various review platforms
 */

// Health check endpoint
router.get('/health', webhookController.healthCheck.bind(webhookController));

// Google My Business webhook endpoint
router.post(
  '/gmb',
  rateLimitMiddleware.webhookRateLimit,
  webhookValidationMiddleware.validateWebhookBody,
  webhookController.handleGmbWebhook.bind(webhookController)
);

// Facebook webhook endpoint
router.post(
  '/facebook',
  rateLimitMiddleware.webhookRateLimit,
  webhookValidationMiddleware.validateWebhookBody,
  webhookController.handleFacebookWebhook.bind(webhookController)
);

// Generic webhook endpoint for other platforms
router.post(
  '/:platform',
  rateLimitMiddleware.webhookRateLimit,
  webhookValidationMiddleware.validateWebhookBody,
  webhookController.handleGenericWebhook.bind(webhookController)
);

// Manual review submission endpoint
router.post(
  '/manual/submit',
  rateLimitMiddleware.standardRateLimit,
  webhookController.submitManualReview.bind(webhookController)
);

// Webhook statistics endpoint
router.get(
  '/stats',
  rateLimitMiddleware.standardRateLimit,
  webhookController.getWebhookStats.bind(webhookController)
);

// Test webhook endpoint (for development/debugging)
router.post(
  '/test',
  rateLimitMiddleware.standardRateLimit,
  webhookController.testWebhook.bind(webhookController)
);

export default router;