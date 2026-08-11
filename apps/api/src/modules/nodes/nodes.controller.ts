import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { builtinNodes } from "@flux/node-sdk";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";
import { NodesService } from "./nodes.service";

@Controller("nodes")
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  /** 内置 + 用户自定义节点注册表（不含 execute 函数） */
  @Get("registry")
  registry() {
    return this.nodes.listPublic();
  }

  @UseGuards(JwtAuthGuard)
  @Post("custom")
  uploadCustom(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      id: string;
      name: string;
      category?: string;
      carrier?: string;
      configSchema?: unknown;
      source?: string;
    },
  ) {
    return this.nodes.registerCustom(user.id, body);
  }
}

/** 供 ExecutionsModule 复用内置节点列表 */
export { builtinNodes };