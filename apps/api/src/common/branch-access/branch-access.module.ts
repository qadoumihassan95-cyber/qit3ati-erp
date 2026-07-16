import { Global, Module } from '@nestjs/common';
import { BranchAccessService } from './branch-access.service';

/**
 * Global — every feature module can inject BranchAccessService
 * without having to add it to their own imports/providers list.
 * This keeps the enforcement pattern consistent across the codebase.
 */
@Global()
@Module({
  providers: [BranchAccessService],
  exports:   [BranchAccessService],
})
export class BranchAccessModule {}
