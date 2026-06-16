import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { AuthModule } from "./modules/auth/auth.module";
import { WorkflowsModule } from "./modules/workflows/workflows.module";
import { ExecutionsModule } from "./modules/executions/executions.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    WorkflowsModule,
    ExecutionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
