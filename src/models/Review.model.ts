import mongoose, { Document, Schema, Types } from 'mongoose';
import { IClient } from './Client.model';

/**
 * Interface for Original Review data
 */
export interface IOriginalReview {
  authorName: string;
  authorPhotoUrl?: string;
  rating: number;
  text: string;
  reviewTime: Date;
  reviewId?: string;
  platformSpecificData?: Record<string, any>;
}

/**
 * Interface for AI Analysis
 */
export interface IAiAnalysis {
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  confidence: number; // 0-1 confidence score
  rating_estimate: number; // 1-5 estimated rating
  summary: string;
  keywords: string[];
  topics: string[];
  urgency: 'Low' | 'Medium' | 'High';
  responseRequired: boolean;
  riskLevel: 'Low' | 'Medium' | 'High';
}

/**
 * Interface for Response Tracking
 */
export interface IResponseTracking {
  responsePosted: boolean;
  responseTime?: Date;
  timeTakenHours?: number;
  approvedBy?: string;
  editedResponse?: string;
  platformResponseId?: string;
}

/**
 * Interface for Review Document
 */
export interface IReview extends Document {
  client: Types.ObjectId | IClient;
  source: 'GMB' | 'Facebook' | 'Instagram' | 'Email' | 'TripAdvisor' | 'Yelp' | 'Other';
  originalReview: IOriginalReview;
  status: 'Received' | 'Processing' | 'AwaitingApproval' | 'Approved' | 'Responded' | 'Failed' | 'Ignored';
  aiAnalysis?: IAiAnalysis;
  suggestedResponse?: string;
  postedResponse?: string;
  responseTracking: IResponseTracking;
  notes?: string;
  flaggedForReview: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual fields
  id: string;
  timeSinceReceived: number; // in hours
}

/**
 * Original Review Schema
 */
const OriginalReviewSchema = new Schema<IOriginalReview>({
  authorName: {
    type: String,
    required: [true, 'Author name is required'],
    trim: true,
  },
  authorPhotoUrl: {
    type: String,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        return /^https?:\/\//.test(v);
      },
      message: 'Invalid URL format for author photo',
    },
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5'],
  },
  text: {
    type: String,
    required: [true, 'Review text is required'],
    trim: true,
    maxlength: [5000, 'Review text cannot exceed 5000 characters'],
  },
  reviewTime: {
    type: Date,
    required: [true, 'Review time is required'],
    index: true,
  },
  reviewId: {
    type: String,
    trim: true,
    sparse: true, // Allow multiple null values
    index: true,
  },
  platformSpecificData: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, { _id: false });

/**
 * AI Analysis Schema
 */
const AiAnalysisSchema = new Schema<IAiAnalysis>({
  sentiment: {
    type: String,
    enum: ['Positive', 'Negative', 'Neutral'],
    required: [true, 'Sentiment is required'],
  },
  confidence: {
    type: Number,
    required: [true, 'Confidence score is required'],
    min: [0, 'Confidence must be at least 0'],
    max: [1, 'Confidence cannot exceed 1'],
  },
  rating_estimate: {
    type: Number,
    required: [true, 'Rating estimate is required'],
    min: [1, 'Rating estimate must be at least 1'],
    max: [5, 'Rating estimate cannot exceed 5'],
  },
  summary: {
    type: String,
    required: [true, 'Summary is required'],
    trim: true,
    maxlength: [500, 'Summary cannot exceed 500 characters'],
  },
  keywords: [{
    type: String,
    trim: true,
  }],
  topics: [{
    type: String,
    trim: true,
  }],
  urgency: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium',
  },
  responseRequired: {
    type: Boolean,
    required: true,
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low',
  },
}, { _id: false });

/**
 * Response Tracking Schema
 */
const ResponseTrackingSchema = new Schema<IResponseTracking>({
  responsePosted: {
    type: Boolean,
    default: false,
  },
  responseTime: {
    type: Date,
  },
  timeTakenHours: {
    type: Number,
    min: 0,
  },
  approvedBy: {
    type: String,
    trim: true,
  },
  editedResponse: {
    type: String,
    trim: true,
  },
  platformResponseId: {
    type: String,
    trim: true,
  },
}, { _id: false });

/**
 * Review Schema
 */
const ReviewSchema = new Schema<IReview>({
  client: {
    type: Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client reference is required'],
    index: true,
  },
  source: {
    type: String,
    enum: ['GMB', 'Facebook', 'Instagram', 'Email', 'TripAdvisor', 'Yelp', 'Other'],
    required: [true, 'Review source is required'],
    index: true,
  },
  originalReview: {
    type: OriginalReviewSchema,
    required: [true, 'Original review data is required'],
  },
  status: {
    type: String,
    enum: ['Received', 'Processing', 'AwaitingApproval', 'Approved', 'Responded', 'Failed', 'Ignored'],
    default: 'Received',
    index: true,
  },
  aiAnalysis: {
    type: AiAnalysisSchema,
  },
  suggestedResponse: {
    type: String,
    trim: true,
    maxlength: [2000, 'Suggested response cannot exceed 2000 characters'],
  },
  postedResponse: {
    type: String,
    trim: true,
    maxlength: [2000, 'Posted response cannot exceed 2000 characters'],
  },
  responseTracking: {
    type: ResponseTrackingSchema,
    default: () => ({ responsePosted: false }),
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
  },
  flaggedForReview: {
    type: Boolean,
    default: false,
    index: true,
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Compound indexes for efficient queries
ReviewSchema.index({ client: 1, createdAt: -1 });
ReviewSchema.index({ client: 1, status: 1 });
ReviewSchema.index({ client: 1, 'originalReview.rating': 1 });
ReviewSchema.index({ client: 1, 'aiAnalysis.sentiment': 1 });
ReviewSchema.index({ 'originalReview.reviewId': 1, source: 1 }, { unique: true, sparse: true });
ReviewSchema.index({ flaggedForReview: 1, createdAt: -1 });
ReviewSchema.index({ 'responseTracking.responsePosted': 1 });

// Virtual for id field
ReviewSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Virtual for time since received
ReviewSchema.virtual('timeSinceReceived').get(function() {
  const now = new Date();
  const diffMs = now.getTime() - this.createdAt.getTime();
  return Math.round(diffMs / (1000 * 60 * 60)); // Convert to hours
});

// Pre-save middleware
ReviewSchema.pre('save', function(next) {
  // Calculate response time when status changes to 'Responded'
  if (this.isModified('status') && this.status === 'Responded' && !this.responseTracking.responseTime) {
    this.responseTracking.responseTime = new Date();
    this.responseTracking.timeTakenHours = this.timeSinceReceived;
  }
  
  // Auto-flag negative reviews for manual review
  if (this.aiAnalysis && this.aiAnalysis.sentiment === 'Negative' && this.aiAnalysis.riskLevel !== 'Low') {
    this.flaggedForReview = true;
  }
  
  next();
});

// Static methods
ReviewSchema.statics.findByClient = function(clientId: string | Types.ObjectId) {
  return this.find({ client: clientId }).populate('client').sort({ createdAt: -1 });
};

ReviewSchema.statics.findPendingResponse = function(clientId?: string | Types.ObjectId) {
  const query = { status: 'AwaitingApproval' };
  if (clientId) {
    Object.assign(query, { client: clientId });
  }
  return this.find(query).populate('client').sort({ createdAt: 1 });
};

ReviewSchema.statics.findBySentiment = function(sentiment: string, clientId?: string | Types.ObjectId) {
  const query = { 'aiAnalysis.sentiment': sentiment };
  if (clientId) {
    Object.assign(query, { client: clientId });
  }
  return this.find(query).populate('client').sort({ createdAt: -1 });
};

ReviewSchema.statics.findRecentReviews = function(clientId?: string | Types.ObjectId, days = 30) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  
  const query = { createdAt: { $gte: dateThreshold } };
  if (clientId) {
    Object.assign(query, { client: clientId });
  }
  
  return this.find(query).populate('client').sort({ createdAt: -1 });
};

ReviewSchema.statics.getReviewStats = function(clientId?: string | Types.ObjectId, days = 30) {
  const matchStage: any = {
    createdAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
  };
  
  if (clientId) {
    matchStage.client = new Types.ObjectId(clientId);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$originalReview.rating' },
        positiveReviews: {
          $sum: { $cond: [{ $eq: ['$aiAnalysis.sentiment', 'Positive'] }, 1, 0] }
        },
        negativeReviews: {
          $sum: { $cond: [{ $eq: ['$aiAnalysis.sentiment', 'Negative'] }, 1, 0] }
        },
        neutralReviews: {
          $sum: { $cond: [{ $eq: ['$aiAnalysis.sentiment', 'Neutral'] }, 1, 0] }
        },
        responseRate: {
          $avg: { $cond: ['$responseTracking.responsePosted', 1, 0] }
        },
        averageResponseTime: {
          $avg: '$responseTracking.timeTakenHours'
        }
      }
    }
  ]);
};

// Instance methods
ReviewSchema.methods.markAsResponded = function(response: string, platformResponseId?: string) {
  this.status = 'Responded';
  this.postedResponse = response;
  this.responseTracking.responsePosted = true;
  this.responseTracking.responseTime = new Date();
  this.responseTracking.timeTakenHours = this.timeSinceReceived;
  
  if (platformResponseId) {
    this.responseTracking.platformResponseId = platformResponseId;
  }
  
  return this.save();
};

ReviewSchema.methods.markAsApproved = function(approvedBy: string, editedResponse?: string) {
  this.status = 'Approved';
  this.responseTracking.approvedBy = approvedBy;
  
  if (editedResponse) {
    this.responseTracking.editedResponse = editedResponse;
  }
  
  return this.save();
};

ReviewSchema.methods.addTag = function(tag: string) {
  const normalizedTag = tag.toLowerCase().trim();
  if (!this.tags.includes(normalizedTag)) {
    this.tags.push(normalizedTag);
    return this.save();
  }
  return Promise.resolve(this);
};

ReviewSchema.methods.removeTag = function(tag: string) {
  const normalizedTag = tag.toLowerCase().trim();
  this.tags = this.tags.filter(t => t !== normalizedTag);
  return this.save();
};

ReviewSchema.methods.isPositive = function(): boolean {
  return this.aiAnalysis?.sentiment === 'Positive' || this.originalReview.rating >= 4;
};

ReviewSchema.methods.isNegative = function(): boolean {
  return this.aiAnalysis?.sentiment === 'Negative' || this.originalReview.rating <= 2;
};

ReviewSchema.methods.requiresImmedateAttention = function(): boolean {
  return this.aiAnalysis?.urgency === 'High' || 
         this.aiAnalysis?.riskLevel === 'High' ||
         (this.isNegative() && this.originalReview.rating === 1);
};

// Export the model
export const Review = mongoose.model<IReview>('Review', ReviewSchema);