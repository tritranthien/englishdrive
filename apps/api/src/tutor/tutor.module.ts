import { Module } from '@nestjs/common';
import { TutorPolicyService } from './tutor-policy.service.js';

@Module({
  providers: [TutorPolicyService],
  exports: [TutorPolicyService],
})
export class TutorModule {}
