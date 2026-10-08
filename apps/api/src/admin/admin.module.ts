import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AdminController } from './admin.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminService } from './admin.service.js';

@Module({
  controllers: [AdminController],
  providers: [AdminAuthService, AdminService],
})
export class AdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.set({
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        });
        next();
      })
      .forRoutes(AdminController);
  }
}
