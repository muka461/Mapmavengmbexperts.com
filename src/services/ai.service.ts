import OpenAI from 'openai';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { IClient } from '../models/Client.model';
import { IAiAnalysis } from '../models/Review.model';

/**
 * Interface for review data passed to AI service
 */
export interface IReviewData {
  authorName: string;
  rating: number;
  text: string;
  reviewTime: Date;
  source: string;
}

/**
 * Interface for AI analysis result
 */
export interface IAiAnalysisResult {
  analysis: IAiAnalysis;
  suggestedResponse: string;
  processingTime: number;
}

/**
 * AI Service for sentiment analysis and response generation
 * This is the core intellectual property of the application
 */
export class AiService {
  private openai: OpenAI;
  private defaultModel: string;
  private maxTokens: number;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.defaultModel = config.openai.model;
    this.maxTokens = config.openai.maxTokens;
  }

  /**
   * Main function to analyze review and generate response
   * This is the core function that performs sentiment analysis and generates responses
   */
  public async analyzeAndRespond(
    reviewData: IReviewData,
    client: IClient
  ): Promise<IAiAnalysisResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`Starting AI analysis for review from ${reviewData.authorName}`, {
        clientId: client.id,
        source: reviewData.source,
        rating: reviewData.rating,
      });

      // Step 1: Perform sentiment analysis
      const analysis = await this.performSentimentAnalysis(reviewData, client);
      
      // Step 2: Generate response using dynamic prompt building
      const suggestedResponse = await this.generateResponse(reviewData, client, analysis);
      
      const processingTime = Date.now() - startTime;
      
      logger.info(`AI analysis completed successfully`, {
        clientId: client.id,
        processingTime,
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
      });

      return {
        analysis,
        suggestedResponse,
        processingTime,
      };

    } catch (error) {
      logger.error('AI analysis failed', {
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        reviewData: { authorName: reviewData.authorName, rating: reviewData.rating },
      });
      throw error;
    }
  }

  /**
   * Perform sentiment analysis on the review
   */
  private async performSentimentAnalysis(
    reviewData: IReviewData,
    client: IClient
  ): Promise<IAiAnalysis> {
    const analysisPrompt = this.buildAnalysisPrompt(reviewData, client);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert sentiment analysis AI specialized in customer reviews for businesses. You must respond only with valid JSON format.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        max_tokens: 800,
        temperature: 0.3, // Lower temperature for more consistent analysis
      });

      const analysisText = response.choices[0]?.message?.content;
      if (!analysisText) {
        throw new Error('No analysis content received from OpenAI');
      }

      // Parse the JSON response
      const parsedAnalysis = JSON.parse(analysisText);
      
      // Validate and normalize the response
      return this.validateAndNormalizeAnalysis(parsedAnalysis, reviewData);

    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error('Failed to parse AI analysis JSON response', { error: error.message });
        // Fallback analysis based on rating
        return this.createFallbackAnalysis(reviewData);
      }
      throw error;
    }
  }

  /**
   * Generate response using dynamic prompt building - THE CORE IP OF THE APPLICATION
   */
  private async generateResponse(
    reviewData: IReviewData,
    client: IClient,
    analysis: IAiAnalysis
  ): Promise<string> {
    // This is the most important part - dynamic prompt generation
    const responsePrompt = this.buildResponsePrompt(reviewData, client, analysis);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: this.getSystemPromptForResponseGeneration(client)
          },
          {
            role: 'user',
            content: responsePrompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7, // Higher temperature for more creative responses
      });

      const generatedResponse = response.choices[0]?.message?.content;
      if (!generatedResponse) {
        throw new Error('No response content received from OpenAI');
      }

      return generatedResponse.trim();

    } catch (error) {
      logger.error('Failed to generate AI response', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Build analysis prompt for sentiment analysis
   */
  private buildAnalysisPrompt(reviewData: IReviewData, client: IClient): string {
    return `Analyze the following customer review for sentiment and key characteristics:

Business Context:
- Industry: ${client.industryProfile.primaryIndustry}
- Specialization: ${client.industryProfile.subIndustry}
- Location: ${client.industryProfile.region}, ${client.industryProfile.country}

Review Details:
- Author: ${reviewData.authorName}
- Rating: ${reviewData.rating}/5 stars
- Platform: ${reviewData.source}
- Text: "${reviewData.text}"

Provide analysis in this exact JSON format:
{
  "sentiment": "Positive|Negative|Neutral",
  "confidence": 0.95,
  "rating_estimate": 4,
  "summary": "Brief summary of main points",
  "keywords": ["keyword1", "keyword2"],
  "topics": ["topic1", "topic2"],
  "urgency": "Low|Medium|High",
  "responseRequired": true,
  "riskLevel": "Low|Medium|High"
}

Consider:
- Overall tone and language used
- Specific complaints or praise
- Industry-specific concerns
- Potential business impact
- Need for immediate attention`;
  }

  /**
   * Build response prompt - THE CORE INTELLECTUAL PROPERTY
   * This is the most important function in the entire application
   */
  private buildResponsePrompt(
    reviewData: IReviewData,
    client: IClient,
    analysis: IAiAnalysis
  ): string {
    // Dynamic prompt building based on client data and review analysis
    const promptTemplate = `You are a professional reputation manager for a business.

Business Context:
Industry: ${client.industryProfile.primaryIndustry}
Specialization: ${client.industryProfile.subIndustry}
Location: ${client.industryProfile.region}, ${client.industryProfile.country}
Brand Voice: ${client.brandVoiceDescription}

Customer Review to Respond To:
Author: ${reviewData.authorName}
Rating: ${reviewData.rating}/5 stars
Platform: ${reviewData.source}
Review Date: ${reviewData.reviewTime.toLocaleDateString()}
Text: "${reviewData.text}"

AI Analysis Results:
Sentiment: ${analysis.sentiment}
Summary: ${analysis.summary}
Key Topics: ${analysis.topics.join(', ')}
Urgency Level: ${analysis.urgency}

Your Task:
Write a personalized, empathetic, and professional response to this review. 

${this.getResponseGuidelines(analysis, client)}

IMPORTANT REQUIREMENTS:
1. Acknowledge specific points mentioned by the customer
2. Use the brand voice described: "${client.brandVoiceDescription}"
3. Include industry-specific language appropriate for ${client.industryProfile.primaryIndustry}
4. DO NOT use generic templates
5. Keep response under 200 words
6. Be authentic and human-like
7. ${analysis.sentiment === 'Negative' ? 'Apologize sincerely and suggest offline resolution' : 'Thank them warmly and mention something specific about their experience'}

Write the response now:`;

    return promptTemplate;
  }

  /**
   * Get system prompt for response generation based on client industry
   */
  private getSystemPromptForResponseGeneration(client: IClient): string {
    const industrySpecificGuidance = this.getIndustrySpecificGuidance(client.industryProfile.primaryIndustry);
    
    return `You are an expert customer service representative and reputation manager specializing in ${client.industryProfile.primaryIndustry}. 

${industrySpecificGuidance}

Your writing style should reflect: ${client.brandVoiceDescription}

Always prioritize:
- Authenticity over templates
- Specific acknowledgment over generic responses
- Problem resolution over defensiveness
- Customer satisfaction over company protection

Remember: You represent ${client.name} located in ${client.industryProfile.region}, ${client.industryProfile.country}.`;
  }

  /**
   * Get response guidelines based on sentiment and analysis
   */
  private getResponseGuidelines(analysis: IAiAnalysis, client: IClient): string {
    switch (analysis.sentiment) {
      case 'Positive':
        return `POSITIVE REVIEW GUIDELINES:
- Express genuine gratitude
- Mention specific aspects they praised
- Invite them to return or recommend to others
- ${this.getIndustrySpecificPositiveResponse(client.industryProfile.primaryIndustry)}`;

      case 'Negative':
        return `NEGATIVE REVIEW GUIDELINES:
- Apologize sincerely for their experience
- Address their specific concerns
- Offer a way to resolve the issue offline (phone/email)
- Show commitment to improvement
- ${this.getIndustrySpecificNegativeResponse(client.industryProfile.primaryIndustry)}
- Include direct contact information if appropriate`;

      case 'Neutral':
        return `NEUTRAL REVIEW GUIDELINES:
- Thank them for their feedback
- Address any areas for improvement mentioned
- Highlight positive aspects of their experience
- Encourage future engagement`;

      default:
        return 'Respond professionally and appropriately to the customer\'s feedback.';
    }
  }

  /**
   * Get industry-specific guidance for response generation
   */
  private getIndustrySpecificGuidance(industry: string): string {
    const industryGuidance: Record<string, string> = {
      'Construction': 'Focus on craftsmanship, safety, timelines, and quality materials. Emphasize reliability and attention to detail.',
      'Healthcare': 'Prioritize patient care, comfort, professionalism, and medical outcomes. Be empathetic and reassuring.',
      'Tourism': 'Highlight experiences, customer service, local knowledge, and memorable moments. Be enthusiastic and welcoming.',
      'Restaurant': 'Focus on food quality, service, ambiance, and overall dining experience. Be warm and inviting.',
      'Retail': 'Emphasize product quality, customer service, value, and shopping experience. Be helpful and accommodating.',
      'Automotive': 'Focus on technical expertise, reliability, fair pricing, and customer service. Be trustworthy and knowledgeable.',
      'Education': 'Emphasize learning outcomes, student support, teaching quality, and academic excellence. Be supportive and encouraging.',
      'Technology': 'Focus on innovation, problem-solving, technical support, and user experience. Be knowledgeable and solution-oriented.',
    };

    return industryGuidance[industry] || 'Respond professionally while considering the specific nature of your business and industry standards.';
  }

  /**
   * Get industry-specific positive response guidance
   */
  private getIndustrySpecificPositiveResponse(industry: string): string {
    const responses: Record<string, string> = {
      'Construction': 'Mention pride in craftsmanship and quality work delivered',
      'Healthcare': 'Express gratitude for trusting you with their care',
      'Tourism': 'Invite them to explore more experiences with you',
      'Restaurant': 'Invite them back to try seasonal specials or new menu items',
      'Retail': 'Mention new arrivals or upcoming sales they might enjoy',
      'Automotive': 'Remind them about regular maintenance or future service needs',
      'Education': 'Encourage continued learning and growth',
      'Technology': 'Mention ongoing support and future updates/features',
    };

    return responses[industry] || 'Encourage continued relationship and future business';
  }

  /**
   * Get industry-specific negative response guidance
   */
  private getIndustrySpecificNegativeResponse(industry: string): string {
    const responses: Record<string, string> = {
      'Construction': 'Offer to inspect the work and make any necessary corrections',
      'Healthcare': 'Emphasize commitment to patient care and offer to discuss concerns privately',
      'Tourism': 'Offer to make their next experience exceptional',
      'Restaurant': 'Invite them back for a complimentary meal to make things right',
      'Retail': 'Offer exchange, refund, or store credit as appropriate',
      'Automotive': 'Offer free re-inspection or warranty coverage if applicable',
      'Education': 'Offer additional support or resources to address their concerns',
      'Technology': 'Provide direct technical support contact for immediate assistance',
    };

    return responses[industry] || 'Offer concrete steps to resolve their concerns';
  }

  /**
   * Validate and normalize AI analysis response
   */
  private validateAndNormalizeAnalysis(parsedAnalysis: any, reviewData: IReviewData): IAiAnalysis {
    // Ensure all required fields exist with defaults
    return {
      sentiment: this.validateSentiment(parsedAnalysis.sentiment) || this.inferSentimentFromRating(reviewData.rating),
      confidence: this.validateConfidence(parsedAnalysis.confidence) || 0.7,
      rating_estimate: this.validateRating(parsedAnalysis.rating_estimate) || reviewData.rating,
      summary: parsedAnalysis.summary || 'Customer feedback received',
      keywords: Array.isArray(parsedAnalysis.keywords) ? parsedAnalysis.keywords : [],
      topics: Array.isArray(parsedAnalysis.topics) ? parsedAnalysis.topics : [],
      urgency: this.validateUrgency(parsedAnalysis.urgency) || this.inferUrgencyFromRating(reviewData.rating),
      responseRequired: Boolean(parsedAnalysis.responseRequired ?? true),
      riskLevel: this.validateRiskLevel(parsedAnalysis.riskLevel) || this.inferRiskFromRating(reviewData.rating),
    };
  }

  /**
   * Create fallback analysis when AI parsing fails
   */
  private createFallbackAnalysis(reviewData: IReviewData): IAiAnalysis {
    return {
      sentiment: this.inferSentimentFromRating(reviewData.rating),
      confidence: 0.5, // Lower confidence for fallback
      rating_estimate: reviewData.rating,
      summary: 'Analysis fallback - based on rating only',
      keywords: [],
      topics: [],
      urgency: this.inferUrgencyFromRating(reviewData.rating),
      responseRequired: true,
      riskLevel: this.inferRiskFromRating(reviewData.rating),
    };
  }

  // Validation helper methods
  private validateSentiment(sentiment: any): 'Positive' | 'Negative' | 'Neutral' | null {
    return ['Positive', 'Negative', 'Neutral'].includes(sentiment) ? sentiment : null;
  }

  private validateConfidence(confidence: any): number | null {
    const num = Number(confidence);
    return !isNaN(num) && num >= 0 && num <= 1 ? num : null;
  }

  private validateRating(rating: any): number | null {
    const num = Number(rating);
    return !isNaN(num) && num >= 1 && num <= 5 ? num : null;
  }

  private validateUrgency(urgency: any): 'Low' | 'Medium' | 'High' | null {
    return ['Low', 'Medium', 'High'].includes(urgency) ? urgency : null;
  }

  private validateRiskLevel(riskLevel: any): 'Low' | 'Medium' | 'High' | null {
    return ['Low', 'Medium', 'High'].includes(riskLevel) ? riskLevel : null;
  }

  // Inference helper methods
  private inferSentimentFromRating(rating: number): 'Positive' | 'Negative' | 'Neutral' {
    if (rating >= 4) return 'Positive';
    if (rating <= 2) return 'Negative';
    return 'Neutral';
  }

  private inferUrgencyFromRating(rating: number): 'Low' | 'Medium' | 'High' {
    if (rating === 1) return 'High';
    if (rating === 2) return 'Medium';
    return 'Low';
  }

  private inferRiskFromRating(rating: number): 'Low' | 'Medium' | 'High' {
    if (rating === 1) return 'High';
    if (rating === 2) return 'Medium';
    return 'Low';
  }

  /**
   * Test the AI service with sample data
   */
  public async testConnection(): Promise<boolean> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'Test connection. Respond with "OK".' }],
        max_tokens: 10,
      });

      return response.choices[0]?.message?.content?.includes('OK') || false;
    } catch (error) {
      logger.error('AI service test connection failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }
}

// Export singleton instance
export const aiService = new AiService();