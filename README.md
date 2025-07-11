# Reputation Guardian - AI-Powered Reputation Management SaaS

A complete, production-ready multi-tenant SaaS application that automates the entire reputation management cycle for businesses. Built with Node.js, TypeScript, MongoDB, and AI integration.

## 🚀 Features

### Core Functionality
- **AI-Powered Review Analysis**: Sentiment analysis and intelligent response generation using OpenAI
- **Multi-Tenant Architecture**: Support for multiple clients with industry-specific configurations
- **Automated Response System**: Auto-responds to positive reviews, requires approval for negative ones
- **Multi-Platform Integration**: Google My Business, Facebook, Instagram support
- **Proactive Review Solicitation**: Automated review requests via Email/SMS with configurable delays
- **Real-Time Notifications**: Slack and email alerts for reviews requiring attention

### Advanced Features
- **Industry-Specific AI Responses**: Dynamic prompts based on business type and location
- **Brand Voice Customization**: Personalized response tone for each client
- **Human-in-the-Loop Workflow**: Manual approval system for sensitive reviews
- **Background Job Processing**: BullMQ-powered queue system for scalable operations
- **Comprehensive Logging**: Winston-based logging with multiple transports
- **Rate Limiting**: Configurable rate limits for API protection
- **Webhook Security**: Signature verification and payload validation

## 🏗️ Architecture

```
src/
├── api/
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Security and validation
│   └── routes/          # API route definitions
├── config/              # Environment and database config
├── models/              # MongoDB schemas (Client, Review)
├── services/            # Core business logic
│   ├── ai.service.ts         # OpenAI integration
│   ├── gmb.service.ts        # Google My Business API
│   ├── meta.service.ts       # Facebook/Instagram API
│   ├── notification.service.ts # Slack & Email alerts
│   ├── outreach.service.ts   # SMS/Email review requests
│   └── review.processor.ts   # Main review processing logic
├── jobs/                # Background job system
├── utils/               # Utility functions
└── server.ts            # Application entry point
```

## 🛠️ Technology Stack

- **Backend**: Node.js with Express.js and TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Queue System**: BullMQ with Redis
- **AI Integration**: OpenAI API for sentiment analysis and response generation
- **Communication**: Twilio (SMS/WhatsApp), Nodemailer (Email), Slack API
- **Security**: Helmet, CORS, Rate Limiting, Webhook Signature Verification
- **Logging**: Winston with multiple transports

## 📋 Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 4.4
- Redis >= 6.0
- OpenAI API key
- Twilio account (for SMS)
- Slack workspace (for notifications)
- Google My Business API access
- Meta (Facebook) API access

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd reputation-guardian

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

### 2. Environment Configuration

Edit `.env` file with your API keys and configuration:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/reputation-guardian

# Redis (for background jobs)
REDIS_HOST=localhost
REDIS_PORT=6379

# OpenAI API
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4

# Twilio (SMS/WhatsApp)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token

# Google My Business
GMB_CLIENT_ID=your-gmb-client-id
GMB_CLIENT_SECRET=your-gmb-client-secret

# Meta (Facebook/Instagram)
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret
```

### 3. Database Setup

Ensure MongoDB is running and accessible. The application will automatically create the necessary collections and indexes.

### 4. Start the Application

```bash
# Development mode
npm run dev

# Production build and start
npm run build
npm start
```

## 📊 Database Schema

### Client Model
```typescript
{
  name: string;                    // Business name
  gmbLocationId: string;           // Google My Business location ID
  brandVoiceDescription: string;   // AI response tone guidelines
  industryProfile: {
    country: 'UK' | 'Kenya' | 'USA';
    region: string;                // e.g., 'Wales', 'Florida'
    primaryIndustry: string;       // e.g., 'Construction'
    subIndustry: string;           // e.g., 'Residential Builders'
  };
  apiKeys: {                       // Platform API credentials
    gmb: { accessToken, refreshToken, expiresAt };
    meta: { accessToken, pageId };
  };
  notificationSettings: {
    slackWebhookUrl?: string;
    notificationEmails: string[];
    enableSlackNotifications: boolean;
    enableEmailNotifications: boolean;
  };
  reviewLinks: {
    gmb?: string;
    facebook?: string;
  };
}
```

### Review Model
```typescript
{
  client: ObjectId;                // Reference to Client
  source: 'GMB' | 'Facebook' | 'Email';
  originalReview: {
    authorName: string;
    rating: number;               // 1-5 stars
    text: string;
    reviewTime: Date;
    reviewId?: string;
  };
  status: 'Received' | 'Processing' | 'AwaitingApproval' | 'Responded';
  aiAnalysis: {
    sentiment: 'Positive' | 'Negative' | 'Neutral';
    confidence: number;           // 0-1
    summary: string;
    urgency: 'Low' | 'Medium' | 'High';
    riskLevel: 'Low' | 'Medium' | 'High';
  };
  suggestedResponse?: string;     // AI-generated response
  postedResponse?: string;        // Final posted response
  responseTracking: {
    responsePosted: boolean;
    responseTime?: Date;
    timeTakenHours?: number;
  };
}
```

## 🔗 API Endpoints

### Webhook Endpoints
```
POST /api/webhooks/gmb          # Google My Business webhook
POST /api/webhooks/facebook     # Facebook webhook
POST /api/webhooks/manual/submit # Manual review submission
GET  /api/webhooks/health       # Webhook health check
```

### Review Processing Flow

1. **Webhook Reception**: Reviews received via platform webhooks
2. **Client Identification**: Match review to client via location ID
3. **AI Analysis**: OpenAI performs sentiment analysis and generates response
4. **Automatic Processing**:
   - **Positive Reviews**: Auto-respond immediately
   - **Negative Reviews**: Send to approval queue with notifications
5. **Human Approval**: Review and approve/edit responses via notifications
6. **Response Posting**: Post approved responses back to platforms

## 🤖 AI Integration

### Dynamic Prompt Generation

The AI service builds industry-specific prompts that include:

```typescript
// Example prompt structure for a construction company
`You are a professional reputation manager for a business.

Business Context:
Industry: Construction
Specialization: Residential Builders
Location: Wales, UK
Brand Voice: Friendly but professional

Customer Review to Respond To:
Author: John Smith
Rating: 4/5 stars
Text: "Great work on our new roof, very professional team"

Your Task:
Write a personalized, empathetic, and professional response...`
```

### Response Customization

- **Industry-Specific Language**: Construction vs. Healthcare vs. Tourism
- **Location Context**: Regional terminology and cultural considerations
- **Brand Voice**: Formal vs. Casual vs. Technical tone
- **Sentiment-Based Guidelines**: Different approaches for positive/negative reviews

## 🔄 Background Jobs

The application uses BullMQ for background processing:

### Job Types
- **Review Request Outreach**: Delayed email/SMS review solicitation
- **AI Processing**: Sentiment analysis and response generation
- **Notifications**: Slack and email alerts
- **Cleanup**: Data maintenance and token refresh

### Queue Configuration
```typescript
// Add delayed review request (24 hours default)
await addReviewRequestJob(clientId, customerData, 24);

// Process immediately for urgent notifications
await addNotificationJob('slack', notificationData, 10);
```

## 📧 Notification System

### Slack Integration
Rich message blocks with:
- Review details and sentiment analysis
- Quick action buttons (Approve/Reject)
- Urgency indicators and risk levels

### Email Notifications
HTML-formatted emails with:
- Review content and AI analysis
- Suggested response preview
- Direct links to approval interface
- Mobile-responsive design

## 🔒 Security Features

- **Webhook Signature Verification**: HMAC-SHA256 validation
- **Rate Limiting**: Configurable per-endpoint limits
- **Input Sanitization**: XSS and injection prevention
- **CORS Configuration**: Restricted origin access
- **Helmet Security**: Security headers and CSP
- **API Key Encryption**: Sensitive credentials protection

## 🚀 Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables for Production
```env
NODE_ENV=production
MONGODB_URI=mongodb://your-production-db
REDIS_HOST=your-production-redis
# ... other production configs
```

## 📊 Monitoring & Logging

### Winston Logging
- **Console**: Development logging with colors
- **File**: Structured JSON logs for production
- **Error**: Separate error log file
- **HTTP**: Request/response logging

### Health Checks
```bash
# Application health
GET /health

# Database connectivity
GET /api/health/database

# External services status
GET /api/health/services
```

## 🧪 Testing

### Manual Testing Endpoints
```bash
# Test webhook processing
POST /api/webhooks/test

# Manual review submission
POST /api/webhooks/manual/submit
{
  "gmbLocationId": "test-location",
  "authorName": "Test Customer",
  "rating": 4,
  "text": "Great service!"
}
```

## 🔧 Configuration

### Industry Profiles
Add new industries by extending the AI service:

```typescript
// In ai.service.ts
private getIndustrySpecificGuidance(industry: string): string {
  const industryGuidance = {
    'YourIndustry': 'Focus on specific aspects...',
    // ... existing industries
  };
}
```

### Brand Voice Customization
Configure per-client response styles:
- Professional and formal
- Friendly and casual
- Technical and detailed
- Warm and personal

## 📈 Scaling Considerations

- **Database Indexing**: Optimized for query patterns
- **Redis Clustering**: Scale background job processing
- **API Rate Limiting**: Protect against abuse
- **Horizontal Scaling**: Stateless application design
- **CDN Integration**: Static asset delivery
- **Load Balancing**: Multiple application instances

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:
- Check the documentation
- Review the logs for error details
- Ensure all environment variables are configured
- Verify external service connectivity

---

**Reputation Guardian** - Automating reputation management with AI-powered intelligence.
