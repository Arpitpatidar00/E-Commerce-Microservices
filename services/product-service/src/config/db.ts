import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ level: 'info' });

export const redisClient = new Redis(process.env.REDIS_URI || 'redis://localhost:6379');

redisClient.on('connect', () => {
  logger.info('Redis Connected');
});

redisClient.on('error', (err) => {
  logger.error(err, 'Redis Error');
});
