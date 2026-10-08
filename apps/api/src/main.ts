import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseEnvironment } from './config/env.js';
import { ApiKeysService } from './admin/api-keys.service.js';

async function bootstrap() {
  const env = parseEnvironment(process.env);
  const app = await NestFactory.create(AppModule);
  await app.get(ApiKeysService).load();
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
