import { Logger, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExecutionsRepository } from "../../database/repositories/executions.repository";
import { CancelRegistry } from "./cancel-registry.service";
import { ExecutionProcessor } from "./execution-processor.service";
import {
  BullExecutionQueue,
  ExecutionQueue,
  InMemoryExecutionQueue,
} from "./execution-queue";
import { ExecutionsController } from "./executions.controller";
import { ExecutionsService } from "./executions.service";

@Module({
  imports: [AuthModule],
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    ExecutionProcessor,
    CancelRegistry,
    {
      provide: ExecutionQueue,
      useFactory: (processor: ExecutionProcessor) => {
        const redisUrl = process.env.REDIS_URL;
        const logger = new Logger("ExecutionQueue");
        if (redisUrl) {
          logger.log("使用 BullMQ + Redis 执行队列");
          return new BullExecutionQueue(redisUrl, processor);
        }
        logger.warn("未配置 REDIS_URL，使用进程内执行队列");
        return new InMemoryExecutionQueue(processor);
      },
      inject: [ExecutionProcessor],
    },
  ],
})
export class ExecutionsModule {}
