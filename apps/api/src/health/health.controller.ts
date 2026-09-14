import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(): Promise<{ status: 'ok'; database: 'connected' }> {
    await this.prisma.isHealthy();
    return { status: 'ok', database: 'connected' };
  }
}
