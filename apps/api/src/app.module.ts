import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ApiRateLimitGuard } from "./config/api-rate-limit.guard";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { WorkflowsModule } from "./modules/workflows/workflows.module";
import { ExecutionsModule } from "./modules/executions/executions.module";
import { NodesModule } from "./modules/nodes/nodes.module";
import { MarketModule } from "./modules/market/market.module";
import { AiModule } from "./modules/ai/ai.module";
import { AppsModule } from "./modules/apps/apps.module";
import { validateRuntimeEnvironment } from "./config/runtime-config";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // pnpm filter 脚本的 cwd 是 apps/api；同时兼容从仓库根目录直接启动。
      envFilePath: [".env", "../../.env"],
      validate: validateRuntimeEnvironment,
    }),
    DatabaseModule.forRoot(),
    AuthModule,
    WorkflowsModule,
    ExecutionsModule,
    NodesModule,
    MarketModule,
    AiModule,
    AppsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ApiRateLimitGuard }],
})
export class AppModule {}
