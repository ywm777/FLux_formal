import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";
import type { CancelMode } from "./cancel-registry.service";
import { ExecutionsService } from "./executions.service";
import {
  ApproveExecutionDto,
  StartExecutionDto,
} from "./dto/execution.dto";

/**
 * 执行与日志。POST 入队，worker 异步运行引擎并持久化；
 * 客户端通过 GET 轮询执行详情与日志。
 */
@UseGuards(JwtAuthGuard)
@Controller("executions")
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Post()
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartExecutionDto,
  ) {
    return this.executions.start(user.id, body.workflowId, body.inputs);
  }

  @Post("test")
  startDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartExecutionDto,
  ) {
    return this.executions.startDraft(user.id, body.workflowId, body.inputs);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.executions.listByOwner(user.id);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.executions.get(user.id, id);
  }

  @Get(":id/logs")
  async logs(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { executionId: id, logs: await this.executions.getLogs(user.id, id) };
  }

  @Post(":id/cancel")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query("mode") mode?: CancelMode,
  ) {
    return this.executions.cancel(user.id, id, mode ?? "terminate");
  }

  @Post(":id/resume")
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.executions.resume(user.id, id);
  }

  @Post(":id/approval")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: ApproveExecutionDto,
  ) {
    return this.executions.approve(user.id, id, body);
  }
}
