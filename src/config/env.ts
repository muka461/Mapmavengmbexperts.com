import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables from .env file
dotenv.config();

// Define validation schema for environment variables
const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  API_BASE_URL: Joi.string().required(),
  
  // Database
  MONGODB_URI: Joi.string().required(),
  MONGODB_TEST_URI: Joi.string().required(),
  
  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),
  
  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  
  // OpenAI
  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_MODEL: Joi.string().default('gpt-4'),
  OPENAI_MAX_TOKENS: Joi.number().default(500),
  
  // Twilio
  TWILIO_ACCOUNT_SID: Joi.string().required(),
  TWILIO_AUTH_TOKEN: Joi.string().required(),
  TWILIO_PHONE_NUMBER: Joi.string().required(),
  TWILIO_WHATSAPP_NUMBER: Joi.string().optional(),
  
  // Email
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().required(),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  FROM_EMAIL: Joi.string().email().required(),
  FROM_NAME: Joi.string().default('Reputation Guardian'),
  
  // Slack
  SLACK_BOT_TOKEN: Joi.string().required(),
  SLACK_SIGNING_SECRET: Joi.string().required(),
  DEFAULT_SLACK_CHANNEL: Joi.string().default('#reputation-alerts'),
  
  // Google My Business
  GMB_CLIENT_ID: Joi.string().required(),
  GMB_CLIENT_SECRET: Joi.string().required(),
  GMB_REDIRECT_URI: Joi.string().required(),
  
  // Meta
  META_APP_ID: Joi.string().required(),
  META_APP_SECRET: Joi.string().required(),
  META_ACCESS_TOKEN: Joi.string().required(),
  
  // Security
  BCRYPT_SALT_ROUNDS: Joi.number().default(12),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FILE_PATH: Joi.string().default('logs/app.log'),
  
  // Webhooks
  WEBHOOK_SECRET: Joi.string().required(),
  
  // Review Requests
  REVIEW_REQUEST_DELAY_HOURS: Joi.number().default(24),
  REVIEW_REQUEST_RETRY_ATTEMPTS: Joi.number().default(3),
}).unknown();

// Validate environment variables
const { error, value: envVars } = envVarsSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  apiBaseUrl: envVars.API_BASE_URL,
  
  database: {
    uri: envVars.NODE_ENV === 'test' ? envVars.MONGODB_TEST_URI : envVars.MONGODB_URI,
  },
  
  redis: {
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
    db: envVars.REDIS_DB,
  },
  
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
  },
  
  openai: {
    apiKey: envVars.OPENAI_API_KEY,
    model: envVars.OPENAI_MODEL,
    maxTokens: envVars.OPENAI_MAX_TOKENS,
  },
  
  twilio: {
    accountSid: envVars.TWILIO_ACCOUNT_SID,
    authToken: envVars.TWILIO_AUTH_TOKEN,
    phoneNumber: envVars.TWILIO_PHONE_NUMBER,
    whatsappNumber: envVars.TWILIO_WHATSAPP_NUMBER,
  },
  
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      secure: envVars.SMTP_SECURE,
      auth: {
        user: envVars.SMTP_USER,
        pass: envVars.SMTP_PASS,
      },
    },
    from: {
      email: envVars.FROM_EMAIL,
      name: envVars.FROM_NAME,
    },
  },
  
  slack: {
    botToken: envVars.SLACK_BOT_TOKEN,
    signingSecret: envVars.SLACK_SIGNING_SECRET,
    defaultChannel: envVars.DEFAULT_SLACK_CHANNEL,
  },
  
  gmb: {
    clientId: envVars.GMB_CLIENT_ID,
    clientSecret: envVars.GMB_CLIENT_SECRET,
    redirectUri: envVars.GMB_REDIRECT_URI,
  },
  
  meta: {
    appId: envVars.META_APP_ID,
    appSecret: envVars.META_APP_SECRET,
    accessToken: envVars.META_ACCESS_TOKEN,
  },
  
  security: {
    bcryptSaltRounds: envVars.BCRYPT_SALT_ROUNDS,
    rateLimit: {
      windowMs: envVars.RATE_LIMIT_WINDOW_MS,
      maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
    },
  },
  
  logging: {
    level: envVars.LOG_LEVEL,
    filePath: envVars.LOG_FILE_PATH,
  },
  
  webhook: {
    secret: envVars.WEBHOOK_SECRET,
  },
  
  reviewRequest: {
    delayHours: envVars.REVIEW_REQUEST_DELAY_HOURS,
    retryAttempts: envVars.REVIEW_REQUEST_RETRY_ATTEMPTS,
  },
};