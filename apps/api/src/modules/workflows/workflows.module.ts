import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowSharesController } from "./workflow-shares.controller";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [AuthModule],
  controllers: [WorkflowsController, WorkflowSharesController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
