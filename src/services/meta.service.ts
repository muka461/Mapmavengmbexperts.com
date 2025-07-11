import axios, { AxiosResponse } from 'axios';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { IClient } from '../models/Client.model';

/**
 * Interface for Meta API response when posting a reply
 */
export interface IMetaReplyResponse {
  success: boolean;
  platformResponseId?: string;
  error?: string;
}

/**
 * Interface for Meta review/post data
 */
export interface IMetaPost {
  id: string;
  message?: string;
  created_time: string;
  from: {
    name: string;
    id: string;
  };
  comments?: {
    data: IMetaComment[];
  };
}

/**
 * Interface for Meta comment data
 */
export interface IMetaComment {
  id: string;
  message: string;
  created_time: string;
  from: {
    name: string;
    id: string;
  };
  attachment?: {
    media?: {
      image: {
        src: string;
      };
    };
  };
}

/**
 * Meta (Facebook/Instagram) Service
 * Handles all interactions with Facebook and Instagram APIs
 */
export class MetaService {
  private baseUrl: string = 'https://graph.facebook.com';
  private apiVersion: string = 'v18.0';

  /**
   * Post a reply to a Facebook post or comment
   */
  public async postReply(
    client: IClient,
    postId: string,
    responseText: string,
    parentCommentId?: string
  ): Promise<IMetaReplyResponse> {
    try {
      // Check if client has valid Meta API keys
      if (!client.hasValidApiKeys('meta')) {
        logger.error('Client does not have valid Meta API keys', {
          clientId: client.id,
        });
        
        return {
          success: false,
          error: 'Invalid or expired Meta API credentials',
        };
      }

      const apiKeys = client.getApiKey('meta');
      const accessToken = apiKeys?.accessToken;
      const pageId = apiKeys?.pageId;

      if (!pageId) {
        return {
          success: false,
          error: 'Meta Page ID not configured',
        };
      }

      logger.info('Posting reply to Meta post', {
        clientId: client.id,
        postId,
        parentCommentId,
        responseLength: responseText.length,
      });

      // Determine the endpoint based on whether it's a reply to a comment or post
      let endpoint: string;
      if (parentCommentId) {
        // Reply to a comment
        endpoint = `${this.baseUrl}/${this.apiVersion}/${parentCommentId}/comments`;
      } else {
        // Comment on a post
        endpoint = `${this.baseUrl}/${this.apiVersion}/${postId}/comments`;
      }

      // Prepare the reply payload
      const replyPayload = {
        message: responseText,
        access_token: accessToken,
      };

      // Make the API request to post the reply
      const response: AxiosResponse = await axios.post(endpoint, replyPayload, {
        timeout: 30000, // 30 second timeout
      });

      if (response.status === 200 && response.data?.id) {
        logger.info('Successfully posted reply to Meta post', {
          clientId: client.id,
          postId,
          commentId: response.data.id,
        });

        return {
          success: true,
          platformResponseId: response.data.id,
        };
      } else {
        logger.error('Unexpected response when posting Meta reply', {
          clientId: client.id,
          postId,
          status: response.status,
          data: response.data,
        });

        return {
          success: false,
          error: `Unexpected response: ${response.status}`,
        };
      }

    } catch (error) {
      logger.error('Failed to post reply to Meta post', {
        clientId: client.id,
        postId,
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
            error: 'Authentication failed - Meta access token may be expired',
          };
        } else if (error.response?.status === 403) {
          return {
            success: false,
            error: 'Permission denied - insufficient Meta API permissions',
          };
        } else if (error.response?.status === 404) {
          return {
            success: false,
            error: 'Post not found - post may have been deleted',
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
   * Get posts and comments from a Facebook page
   */
  public async getPagePosts(
    client: IClient,
    limit: number = 25,
    since?: string,
    until?: string
  ): Promise<{ posts: IMetaPost[]; success: boolean; error?: string }> {
    try {
      if (!client.hasValidApiKeys('meta')) {
        return {
          success: false,
          error: 'Invalid or expired Meta API credentials',
          posts: [],
        };
      }

      const apiKeys = client.getApiKey('meta');
      const accessToken = apiKeys?.accessToken;
      const pageId = apiKeys?.pageId;

      if (!pageId) {
        return {
          success: false,
          error: 'Meta Page ID not configured',
          posts: [],
        };
      }

      const params = new URLSearchParams({
        access_token: accessToken!,
        fields: 'id,message,created_time,from,comments{message,created_time,from,attachment}',
        limit: limit.toString(),
        ...(since && { since }),
        ...(until && { until }),
      });

      const response: AxiosResponse = await axios.get(
        `${this.baseUrl}/${this.apiVersion}/${pageId}/posts?${params}`,
        {
          timeout: 30000,
        }
      );

      logger.info('Successfully fetched Meta page posts', {
        clientId: client.id,
        pageId,
        postCount: response.data?.data?.length || 0,
      });

      return {
        success: true,
        posts: response.data?.data || [],
      };

    } catch (error) {
      logger.error('Failed to fetch Meta page posts', {
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        posts: [],
      };
    }
  }

  /**
   * Get comments for a specific Facebook post
   */
  public async getPostComments(
    client: IClient,
    postId: string,
    limit: number = 25
  ): Promise<{ comments: IMetaComment[]; success: boolean; error?: string }> {
    try {
      if (!client.hasValidApiKeys('meta')) {
        return {
          success: false,
          error: 'Invalid or expired Meta API credentials',
          comments: [],
        };
      }

      const apiKeys = client.getApiKey('meta');
      const accessToken = apiKeys?.accessToken;

      const params = new URLSearchParams({
        access_token: accessToken!,
        fields: 'id,message,created_time,from,attachment',
        limit: limit.toString(),
      });

      const response: AxiosResponse = await axios.get(
        `${this.baseUrl}/${this.apiVersion}/${postId}/comments?${params}`,
        {
          timeout: 30000,
        }
      );

      return {
        success: true,
        comments: response.data?.data || [],
      };

    } catch (error) {
      logger.error('Failed to fetch Meta post comments', {
        clientId: client.id,
        postId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        comments: [],
      };
    }
  }

  /**
   * Get page information
   */
  public async getPageInfo(
    client: IClient
  ): Promise<{ pageInfo?: any; success: boolean; error?: string }> {
    try {
      if (!client.hasValidApiKeys('meta')) {
        return {
          success: false,
          error: 'Invalid or expired Meta API credentials',
        };
      }

      const apiKeys = client.getApiKey('meta');
      const accessToken = apiKeys?.accessToken;
      const pageId = apiKeys?.pageId;

      if (!pageId) {
        return {
          success: false,
          error: 'Meta Page ID not configured',
        };
      }

      const params = new URLSearchParams({
        access_token: accessToken!,
        fields: 'id,name,category,location,phone,website,about,rating_count,overall_star_rating',
      });

      const response: AxiosResponse = await axios.get(
        `${this.baseUrl}/${this.apiVersion}/${pageId}?${params}`,
        {
          timeout: 30000,
        }
      );

      return {
        success: true,
        pageInfo: response.data,
      };

    } catch (error) {
      logger.error('Failed to fetch Meta page info', {
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
   * Test Meta API connection for a client
   */
  public async testConnection(client: IClient): Promise<{ success: boolean; error?: string }> {
    try {
      if (!client.hasValidApiKeys('meta')) {
        return {
          success: false,
          error: 'Invalid or expired Meta API credentials',
        };
      }

      // Try to fetch page information as a test
      const pageInfoResult = await this.getPageInfo(client);

      if (pageInfoResult.success) {
        logger.info('Meta API connection test successful', {
          clientId: client.id,
          pageName: pageInfoResult.pageInfo?.name,
        });

        return { success: true };
      } else {
        return {
          success: false,
          error: pageInfoResult.error || 'Connection test failed',
        };
      }

    } catch (error) {
      logger.error('Meta API connection test failed', {
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
   * Validate Meta webhook (Facebook specific)
   */
  public validateWebhookToken(
    mode: string,
    token: string,
    challenge: string
  ): { valid: boolean; challenge?: string } {
    const verifyToken = config.meta.appSecret; // Use app secret as verify token
    
    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('Meta webhook token validated successfully');
      return {
        valid: true,
        challenge,
      };
    } else {
      logger.warn('Meta webhook token validation failed', {
        mode,
        receivedToken: token,
      });
      return {
        valid: false,
      };
    }
  }

  /**
   * Process Meta webhook payload
   */
  public processWebhookPayload(payload: any): {
    success: boolean;
    events: any[];
    error?: string;
  } {
    try {
      if (!payload.object || payload.object !== 'page') {
        return {
          success: false,
          events: [],
          error: 'Invalid webhook object type',
        };
      }

      const events: any[] = [];

      if (payload.entry && Array.isArray(payload.entry)) {
        for (const entry of payload.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'feed' && change.value) {
                // Process feed changes (posts, comments, etc.)
                events.push({
                  type: 'feed_change',
                  pageId: entry.id,
                  timestamp: entry.time,
                  change: change.value,
                });
              } else if (change.field === 'ratings' && change.value) {
                // Process rating changes
                events.push({
                  type: 'rating_change',
                  pageId: entry.id,
                  timestamp: entry.time,
                  change: change.value,
                });
              }
            }
          }

          if (entry.messaging) {
            // Process messaging events
            for (const message of entry.messaging) {
              events.push({
                type: 'message',
                pageId: entry.id,
                timestamp: entry.time,
                message,
              });
            }
          }
        }
      }

      logger.info('Meta webhook payload processed', {
        eventCount: events.length,
        events: events.map(e => ({ type: e.type, pageId: e.pageId })),
      });

      return {
        success: true,
        events,
      };

    } catch (error) {
      logger.error('Failed to process Meta webhook payload', {
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
      });

      return {
        success: false,
        events: [],
        error: error instanceof Error ? error.message : 'Payload processing failed',
      };
    }
  }

  /**
   * Get long-lived access token
   */
  public async getLongLivedToken(
    shortLivedToken: string
  ): Promise<{ success: boolean; accessToken?: string; expiresIn?: number; error?: string }> {
    try {
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        fb_exchange_token: shortLivedToken,
      });

      const response: AxiosResponse = await axios.get(
        `${this.baseUrl}/oauth/access_token?${params}`,
        {
          timeout: 30000,
        }
      );

      if (response.data?.access_token) {
        logger.info('Successfully obtained long-lived Meta access token', {
          expiresIn: response.data.expires_in,
        });

        return {
          success: true,
          accessToken: response.data.access_token,
          expiresIn: response.data.expires_in,
        };
      } else {
        return {
          success: false,
          error: 'No access token in response',
        };
      }

    } catch (error) {
      logger.error('Failed to get long-lived Meta access token', {
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
export const metaService = new MetaService();