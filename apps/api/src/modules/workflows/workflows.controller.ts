import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { safeParseGraph } from "@flux/workflow-schema";

/** 工作流 CRUD + 发布占位（内存实现，后续接 PostgreSQL） */
@Controller("workflows")
export class WorkflowsController {
  private readonly store = new Map<string, unknown>();

  @Get()
  list() {
    return [...this.store.values()];
  }

  @Post()
  create(@Body() body: unknown) {
    const parsed = safeParseGraph(body);
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues };
    }
    this.store.set(parsed.data.id, parsed.data);
    return { ok: true, data: parsed.data };
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = safeParseGraph(body);
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues };
    }
    const next = { ...parsed.data, version: parsed.data.version + 1 };
    this.store.set(id, next);
    return { ok: true, data: next };
  }

  @Post(":id/publish")
  publish(@Param("id") id: string) {
    return { ok: true, id, status: "published" };
  }
}
