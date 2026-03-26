import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../auth/decorators/public.decorator';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Public()
  @Get('assets/:assetId')
  async getAsset(
    @Param('assetId') assetId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { mimeType, stream } =
      await this.uploadsService.getAssetStream(assetId);

    reply.header('Content-Type', mimeType);
    reply.header('Cache-Control', 'public, max-age=86400');

    return new StreamableFile(stream);
  }
}
