import { createClient } from 'redis';

let redisClient: any = null;

export const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://redis:6379'
    });

    redisClient.on('error', (err: any) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });

    redisClient.on('ready', () => {
      console.log('Redis client ready');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
};

export const getRedisClient = () => redisClient;

// Cache keys for different data types
export const CACHE_KEYS = {
  DEVICES: 'devices:all',
  DEVICE: (id: string) => `device:${id}`,
  PLAYLISTS: 'playlists:all',
  PLAYLIST: (id: string) => `playlist:${id}`,
  SCHEDULES: 'schedules:all',
  MEDIA: 'media:all',
  SCREENSHOTS: (deviceId: string) => `screenshots:${deviceId}`,
};

// Cache TTL in seconds
export const CACHE_TTL = {
  DEVICES: 60, // 1 minute
  PLAYLISTS: 300, // 5 minutes
  SCHEDULES: 300, // 5 minutes
  MEDIA: 600, // 10 minutes
  SCREENSHOTS: 30, // 30 seconds
};

// Cache middleware for Express routes
export const cacheMiddleware = (key: string, ttl: number = 300) => {
  return async (req: any, res: any, next: any) => {
    if (!redisClient || !redisClient.isReady) {
      return next();
    }

    try {
      // Generate cache key with query params for uniqueness
      const queryString = JSON.stringify(req.query);
      const cacheKey = `${key}:${Buffer.from(queryString).toString('base64')}`;
      
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        console.log(`Cache hit for ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      // Store original res.json
      const originalJson = res.json;
      
      // Override res.json to cache the response
      res.json = function(data: any) {
        if (res.statusCode === 200) {
          redisClient.setEx(cacheKey, ttl, JSON.stringify(data))
            .catch((err: any) => console.error('Cache set error:', err));
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

// Invalidate cache patterns
export const invalidateCache = async (pattern: string) => {
  if (!redisClient || !redisClient.isReady) {
    return;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`Invalidated ${keys.length} cache keys matching ${pattern}`);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
};
