import { Module } from '@nestjs/common';
import { JofotaraController } from './jofotara.controller';
import { JofotaraService } from './jofotara.service';

@Module({
  controllers: [JofotaraController],
  providers:   [JofotaraService],
  exports:     [JofotaraService],
})
export class JofotaraModule {}
