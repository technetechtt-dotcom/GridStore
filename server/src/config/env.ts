import { config } from 'dotenv';

config();

export const env = {
  port: Number(process.env.PORT ?? '4000'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET ?? 'gridstore-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
};
