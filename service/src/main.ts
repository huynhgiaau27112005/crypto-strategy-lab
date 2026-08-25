import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { StructuredLogger } from './observability/logging/structured-logger.service';

async function bootstrap() {
  // bufferLogs: true holds Nest's bootstrap-time log lines until
  // useLogger() below installs StructuredLogger, so nothing before that
  // point falls back to the unstructured default console logger.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(StructuredLogger));
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
