import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ExecutionsService } from "./executions.service";

/**
 * 执行与日志。
 * 将 WorkflowGraph 编译为 DAG 并经引擎运行（见 PRD 5.2）。
 * 首期为内存版引擎，后续接 BullMQ 队列与持久化。
 */
@Controller("executions")
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Post()
  start(@Body() body: { workflowId: string; graph: unknown }) {
    return this.executions.start(body.workflowId, body.graph);
  }

  @Get(":id/logs")
  logs(@Param("id") id: string) {
    return { executionId: id, logs: this.executions.getLogs(id) };
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.executions.cancel(id);
  }
}
