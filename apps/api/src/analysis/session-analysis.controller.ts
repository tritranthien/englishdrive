import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { SessionAnalysisService } from './session-analysis.service.js';

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionAnalysisController {
  constructor(private readonly analysis: SessionAnalysisService) {}

  @Get(':id/analysis')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.analysis.findForUser(request.user.id, id);
  }

  @Post(':id/analysis/retry')
  retry(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.analysis.retry(request.user.id, id);
  }
}
