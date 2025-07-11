import axios, { AxiosResponse } from 'axios';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { IClient } from '../models/Client.model';

/**
 * Interface for GMB API response when posting a reply
 */
export interface IGmbReplyResponse {
  success: boolean;
  platformResponseId?: string;
  error?: string;
}

/**
 * Interface for GMB review data
 */
export interface IGmbReview {
  name: string;
  reviewId: string;
  reviewer: {
    profilePhotoUrl?: string;
    displayName: string;
  };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}

/**
 * Google My Business Service
 * Handles all interactions with the Google My Business API
 */
export class GmbService {
  private baseUrl: string = 'https://mybusiness.googleapis.com/v4';
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = config.gmb.clientId;
    this.clientSecret = config.gmb.clientSecret;
    this.redirectUri = config.gmb.redirectUri;
  }

  /**
   * Post a reply to a Google My Business review
   */
  public async postReply(
    client: IClient,
    reviewId: string,
    responseText: string
  ): Promise<IGmbReplyResponse> {
    try {
      // Check if client has valid GMB API keys
      if (!client.hasValidApiKeys('gmb')) {
        logger.error('Client does not have valid GMB API keys', {
          clientId: client.id,
          gmbLocationId: client.gmbLocationId,
        });
        
        return {
          success: false,
          error: 'Invalid or expired GMB API credentials',
        };
      }

      const accessToken = client.getApiKey('gmb')?.accessToken;
      const locationName = `locations/${client.gmbLocationId}`;
      const reviewName = `${locationName}/reviews/${reviewId}`;
      
      logger.info('Posting reply to GMB review', {
        clientId: client.id,
        reviewId,
        responseLength: responseText.length,
      });

      // Prepare the reply payload
      const replyPayload = {
        comment: responseText,
      };

      // Make the API request to post the reply
      const response: AxiosResponse = await axios.put(
        `${this.baseUrl}/${reviewName}/reply`,
        replyPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      if (response.status === 200) {
        logger.info('Successfully posted reply to GMB review', {
          clientId: client.id,
          reviewId,
          responseId: response.data?.name,
        });

        return {
          success: true,
          platformResponseId: response.data?.name || `${reviewName}/reply`,
        };
      } else {
        logger.error('Unexpected response status when posting GMB reply', {
          clientId: client.id,
          reviewId,
          status: response.status,
          statusText: response.statusText,
        });

        return {
          success: false,
          error: `Unexpected response status: ${response.status}`,
        };
      }

    } catch (error) {
      logger.error('Failed to post reply to GMB review', {
        clientId: client.id,
        reviewId,
        error: error instanceof Error ? error.message : 'Unknown error',
        // Include additional error details if available
        ...(axios.isAxiosError(error) && {
          responseStatus: error.response?.status,
          responseData: error.response?.data,
        }),
      });

      // Handle specific error cases
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return {
            success: false,
            error: 'Authentication failed - GMB access token may be expired',
          };
        } else if (error.response?.status === 403) {
          return {
            success: false,
            error: 'Permission denied - insufficient GMB API permissions',
          };
        } else if (error.response?.status === 404) {
          return {
            success: false,
            error: 'Review not found - review may have been deleted',
          };
        } else if (error.response?.status === 429) {
          return {
            success: false,
            error: 'Rate limit exceeded - too many API requests',
          };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Get reviews for a GMB location
   */
  public async getReviews(
    client: IClient,
    pageSize: number = 50,
    pageToken?: string
  ): Promise<{ reviews: IGmbReview[]; nextPageToken?: string; success: boolean; error?: string }> {
    try {
      if (!client.hasValidApiKeys('gmb')) {
        return {
          success: false,
          error: 'Invalid or expired GMB API credentials',
          reviews: [],
        };
      }

      const accessToken = client.getApiKey('gmb')?.accessToken;
      const locationName = `locations/${client.gmbLocationId}`;
      
      const params = new URLSearchParams({
        pageSize: pageSize.toString(),
        ...(pageToken && { pageToken }),
      });

      const response: AxiosResponse = await axios.get(
        `${this.baseUrl}/${locationName}/reviews?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      logger.info('Successfully fetched GMB reviews', {
        clientId: client.id,
        reviewCount: response.data?.reviews?.length || 0,
        hasNextPage: !!response.data?.nextPageToken,
      });

      return {
        success: true,
        reviews: response.data?.reviews || [],
        nextPageToken: response.data?.nextPageToken,
      };

    } catch (error) {
      logger.error('Failed to fetch GMB reviews', {
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        reviews: [],
      };
    }
  }

  /**
   * Get a specific review by ID
   */
  public async getReview(
    client: IClient,
    reviewId: string
  ): Promise<{ review?: IGmbReview; success: boolean; error?: string }> {
    try {
      if (!client.hasValidApiKeys('gmb')) {
        return {
          success: false,
          error: 'Invalid or expired GMB API credentials',
        };
      }

      const accessToken = client.getApiKey('gmb')?.accessToken;
      const locationName = `locations/${client.gmbLocationId}`;
      const reviewName = `${locationName}/reviews/${reviewId}`;

      const response: AxiosResponse = await axios.get(
        `${this.baseUrl}/${reviewName}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      return {
        success: true,
        review: response.data,
      };

    } catch (error) {
      logger.error('Failed to fetch GMB review', {
        clientId: client.id,
        reviewId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Convert GMB star rating to numeric value
   */
  public static convertStarRatingToNumber(starRating: string): number {
    const ratingMap: Record<string, number> = {
      'ONE': 1,
      'TWO': 2,
      'THREE': 3,
      'FOUR': 4,
      'FIVE': 5,
    };

    return ratingMap[starRating] || 0;
  }

  /**
   * Convert numeric rating to GMB star rating
   */
  public static convertNumberToStarRating(rating: number): string {
    const ratingMap: Record<number, string> = {
      1: 'ONE',
      2: 'TWO',
      3: 'THREE',
      4: 'FOUR',
      5: 'FIVE',
    };

    return ratingMap[rating] || 'FIVE';
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshAccessToken(client: IClient): Promise<{ success: boolean; error?: string }> {
    try {
      const apiKeys = client.getApiKey('gmb');
      if (!apiKeys?.refreshToken) {
        return {
          success: false,
          error: 'No refresh token available',
        };
      }

      const tokenPayload = {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: apiKeys.refreshToken,
        grant_type: 'refresh_token',
      };

      const response: AxiosResponse = await axios.post(
        'https://oauth2.googleapis.com/token',
        tokenPayload,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        }
      );

      if (response.data?.access_token) {
        // Update client with new access token
        const newExpiryTime = new Date();
        newExpiryTime.setSeconds(newExpiryTime.getSeconds() + (response.data.expires_in || 3600));

        client.apiKeys.gmb = {
          ...client.apiKeys.gmb,
          accessToken: response.data.access_token,
          expiresAt: newExpiryTime,
        };

        await client.save();

        logger.info('Successfully refreshed GMB access token', {
          clientId: client.id,
          expiresAt: newExpiryTime,
        });

        return { success: true };
      } else {
        return {
          success: false,
          error: 'No access token in response',
        };
      }

    } catch (error) {
      logger.error('Failed to refresh GMB access token', {
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Test GMB API connection for a client
   */
  public async testConnection(client: IClient): Promise<{ success: boolean; error?: string }> {
    try {
      if (!client.hasValidApiKeys('gmb')) {
        return {
          success: false,
          error: 'Invalid or expired GMB API credentials',
        };
      }

      // Try to fetch location information as a test
      const accessToken = client.getApiKey('gmb')?.accessToken;
      const locationName = `locations/${client.gmbLocationId}`;

      const response: AxiosResponse = await axios.get(
        `${this.baseUrl}/${locationName}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // Shorter timeout for test
        }
      );

      if (response.status === 200) {
        logger.info('GMB API connection test successful', {
          clientId: client.id,
          locationName: response.data?.name,
        });

        return { success: true };
      } else {
        return {
          success: false,
          error: `Unexpected response status: ${response.status}`,
        };
      }

    } catch (error) {
      logger.error('GMB API connection test failed', {
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Build OAuth URL for GMB authorization
   */
  public buildAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/business.manage',
      access_type: 'offline',
      prompt: 'consent',
      ...(state && { state }),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /**
   * Exchange authorization code for access token
   */
  public async exchangeCodeForToken(
    authCode: string
  ): Promise<{ success: boolean; tokens?: any; error?: string }> {
    try {
      const tokenPayload = {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: authCode,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      };

      const response: AxiosResponse = await axios.post(
        'https://oauth2.googleapis.com/token',
        tokenPayload,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        }
      );

      if (response.data?.access_token) {
        const expiryTime = new Date();
        expiryTime.setSeconds(expiryTime.getSeconds() + (response.data.expires_in || 3600));

        return {
          success: true,
          tokens: {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: expiryTime,
          },
        };
      } else {
        return {
          success: false,
          error: 'No access token in response',
        };
      }

    } catch (error) {
      logger.error('Failed to exchange authorization code for token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token exchange failed',
      };
    }
  }
}

// Export singleton instance
export const gmbService = new GmbService();