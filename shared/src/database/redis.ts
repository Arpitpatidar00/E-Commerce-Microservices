import Redis from 'ioredis';
import { getConfig } from '../config';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    const config = getConfig();
    redisClient = new Redis(config.REDIS_URI);
    
    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }
  return redisClient;
};

export const closeRedisConnection = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};
