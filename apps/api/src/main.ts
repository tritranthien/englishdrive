import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseEnvironment } from './config/env.js';

async function bootstrap() {
  const env = parseEnvironment(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
