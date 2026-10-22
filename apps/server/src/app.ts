import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ENV } from './config/env.config.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { notFoundHandler } from './middlewares/not-found.middleware.js';
import { HealthController } from './controllers/health.controller.js';

const app: Express = express();

app.set('trust proxy', ENV.TRUST_PROXY);

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: [ENV.CLIENT_URL],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Root liveness check endpoint
app.get('/health', HealthController.checkLiveness);

// API Routes
app.use('/api/v1', apiRouter);

// 404 Handler for unmatched routes
app.use(notFoundHandler);

// Centralized Error Handler
app.use(errorHandler);

export default app;
