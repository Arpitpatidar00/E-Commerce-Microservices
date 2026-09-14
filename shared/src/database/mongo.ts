import mongoose from 'mongoose';
import pino from 'pino';

const logger = pino({ level: 'info' });

export const connectMongo = async (mongoUri: string, serviceName: string) => {
  try {
    await mongoose.connect(mongoUri);
    logger.info(`MongoDB Connected for ${serviceName}: ${mongoUri}`);
    return mongoose.connection;
  } catch (error) {
    logger.error(error, `Error connecting to MongoDB for ${serviceName}`);
    process.exit(1);
  }
};
