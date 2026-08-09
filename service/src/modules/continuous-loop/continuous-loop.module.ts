import { Module } from '@nestjs/common';
import { ContinuousLoopController } from './continuous-loop.controller';
import { ContinuousLoopService } from './continuous-loop.service';

@Module({
  controllers: [ContinuousLoopController],
  providers: [ContinuousLoopService],
  exports: [ContinuousLoopService],
})
export class ContinuousLoopModule {}
