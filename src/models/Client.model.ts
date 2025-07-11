import mongoose, { Document, Schema } from 'mongoose';

/**
 * Interface for Industry Profile
 */
export interface IIndustryProfile {
  country: 'UK' | 'Kenya' | 'USA';
  region: string; // e.g., 'Wales', 'Florida', 'Nairobi'
  primaryIndustry: string; // e.g., 'Construction', 'Tourism', 'Healthcare'
  subIndustry: string; // e.g., 'Residential Builders', 'Boutique Hotels', 'Dentists'
}

/**
 * Interface for API Keys
 */
export interface IApiKeys {
  gmb?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
  };
  meta?: {
    accessToken?: string;
    pageId?: string;
  };
  twilio?: {
    accountSid?: string;
    authToken?: string;
  };
}

/**
 * Interface for Notification Settings
 */
export interface INotificationSettings {
  slackWebhookUrl?: string;
  notificationEmails: string[];
  enableSlackNotifications: boolean;
  enableEmailNotifications: boolean;
  enableSMSNotifications: boolean;
  notificationTypes: {
    newReview: boolean;
    negativeReview: boolean;
    responseRequired: boolean;
    reviewPosted: boolean;
  };
}

/**
 * Interface for Review Links
 */
export interface IReviewLinks {
  gmb?: string;
  facebook?: string;
  instagram?: string;
  custom?: string[];
}

/**
 * Interface for Client Document
 */
export interface IClient extends Document {
  name: string;
  gmbLocationId: string;
  brandVoiceDescription: string;
  industryProfile: IIndustryProfile;
  apiKeys: IApiKeys;
  notificationSettings: INotificationSettings;
  reviewLinks: IReviewLinks;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt?: Date;
  
  // Virtual fields
  id: string;
}

/**
 * Industry Profile Schema
 */
const IndustryProfileSchema = new Schema<IIndustryProfile>({
  country: {
    type: String,
    enum: ['UK', 'Kenya', 'USA'],
    required: [true, 'Country is required'],
  },
  region: {
    type: String,
    required: [true, 'Region is required'],
    trim: true,
  },
  primaryIndustry: {
    type: String,
    required: [true, 'Primary industry is required'],
    trim: true,
  },
  subIndustry: {
    type: String,
    required: [true, 'Sub-industry is required'],
    trim: true,
  },
}, { _id: false });

/**
 * API Keys Schema
 */
const ApiKeysSchema = new Schema<IApiKeys>({
  gmb: {
    accessToken: { type: String, select: false }, // Exclude from queries by default
    refreshToken: { type: String, select: false },
    expiresAt: { type: Date },
  },
  meta: {
    accessToken: { type: String, select: false },
    pageId: { type: String },
  },
  twilio: {
    accountSid: { type: String, select: false },
    authToken: { type: String, select: false },
  },
}, { _id: false });

/**
 * Notification Settings Schema
 */
const NotificationSettingsSchema = new Schema<INotificationSettings>({
  slackWebhookUrl: {
    type: String,
    validate: {
      validator: function(v: string) {
        if (!v) return true; // Allow empty string
        return /^https:\/\/hooks\.slack\.com\/services\//.test(v);
      },
      message: 'Invalid Slack webhook URL format',
    },
  },
  notificationEmails: [{
    type: String,
    validate: {
      validator: function(v: string) {
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Invalid email format',
    },
  }],
  enableSlackNotifications: {
    type: Boolean,
    default: true,
  },
  enableEmailNotifications: {
    type: Boolean,
    default: true,
  },
  enableSMSNotifications: {
    type: Boolean,
    default: false,
  },
  notificationTypes: {
    newReview: { type: Boolean, default: true },
    negativeReview: { type: Boolean, default: true },
    responseRequired: { type: Boolean, default: true },
    reviewPosted: { type: Boolean, default: false },
  },
}, { _id: false });

/**
 * Review Links Schema
 */
const ReviewLinksSchema = new Schema<IReviewLinks>({
  gmb: {
    type: String,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        return /^https:\/\/(www\.)?google\.com\//.test(v);
      },
      message: 'Invalid Google My Business review link',
    },
  },
  facebook: {
    type: String,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        return /^https:\/\/(www\.)?facebook\.com\//.test(v);
      },
      message: 'Invalid Facebook review link',
    },
  },
  instagram: {
    type: String,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        return /^https:\/\/(www\.)?instagram\.com\//.test(v);
      },
      message: 'Invalid Instagram profile link',
    },
  },
  custom: [{
    type: String,
    validate: {
      validator: function(v: string) {
        return /^https?:\/\//.test(v);
      },
      message: 'Invalid URL format for custom review link',
    },
  }],
}, { _id: false });

/**
 * Client Schema
 */
const ClientSchema = new Schema<IClient>({
  name: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true,
    maxlength: [100, 'Client name cannot exceed 100 characters'],
  },
  gmbLocationId: {
    type: String,
    required: [true, 'Google My Business location ID is required'],
    unique: true,
    trim: true,
    index: true,
  },
  brandVoiceDescription: {
    type: String,
    required: [true, 'Brand voice description is required'],
    trim: true,
    maxlength: [500, 'Brand voice description cannot exceed 500 characters'],
  },
  industryProfile: {
    type: IndustryProfileSchema,
    required: [true, 'Industry profile is required'],
  },
  apiKeys: {
    type: ApiKeysSchema,
    default: () => ({}),
  },
  notificationSettings: {
    type: NotificationSettingsSchema,
    default: () => ({
      notificationEmails: [],
      enableSlackNotifications: true,
      enableEmailNotifications: true,
      enableSMSNotifications: false,
      notificationTypes: {
        newReview: true,
        negativeReview: true,
        responseRequired: true,
        reviewPosted: false,
      },
    }),
  },
  reviewLinks: {
    type: ReviewLinksSchema,
    default: () => ({}),
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  lastActivityAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
ClientSchema.index({ 'industryProfile.country': 1, 'industryProfile.primaryIndustry': 1 });
ClientSchema.index({ isActive: 1, createdAt: -1 });
ClientSchema.index({ lastActivityAt: -1 });

// Virtual for id field
ClientSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Pre-save middleware to update lastActivityAt
ClientSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastActivityAt = new Date();
  }
  next();
});

// Static methods
ClientSchema.statics.findByGmbLocationId = function(gmbLocationId: string) {
  return this.findOne({ gmbLocationId, isActive: true });
};

ClientSchema.statics.findActiveClients = function() {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

ClientSchema.statics.findByIndustry = function(primaryIndustry: string) {
  return this.find({ 
    'industryProfile.primaryIndustry': primaryIndustry,
    isActive: true 
  });
};

// Instance methods
ClientSchema.methods.updateLastActivity = function() {
  this.lastActivityAt = new Date();
  return this.save();
};

ClientSchema.methods.getApiKey = function(service: string) {
  return this.apiKeys?.[service as keyof IApiKeys];
};

ClientSchema.methods.hasValidApiKeys = function(service: string): boolean {
  const apiKey = this.getApiKey(service);
  if (!apiKey) return false;
  
  // Check if access token exists and is not expired
  if (service === 'gmb') {
    return !!(apiKey.accessToken && (!apiKey.expiresAt || apiKey.expiresAt > new Date()));
  }
  
  return !!apiKey.accessToken;
};

// Export the model
export const Client = mongoose.model<IClient>('Client', ClientSchema);