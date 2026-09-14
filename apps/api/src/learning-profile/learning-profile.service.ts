import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateLearningProfileInput } from './learning-profile.schemas.js';

@Injectable()
export class LearningProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(userId: string) {
    const profile = await this.prisma.learningProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Learning profile not found');
    }

    return profile;
  }

  async updateForUser(userId: string, input: UpdateLearningProfileInput) {
    const profile = await this.prisma.learningProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException('Learning profile not found');
    }

    return this.prisma.learningProfile.update({
      where: { userId },
      data: input,
    });
  }
}
