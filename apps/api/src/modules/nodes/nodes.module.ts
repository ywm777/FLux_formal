import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NodesController } from "./nodes.controller";
import { NodesService } from "./nodes.service";

@Module({
  imports: [AuthModule],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}
