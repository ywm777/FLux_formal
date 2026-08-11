import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  type AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";
import { WorkflowsService } from "./workflows.service";

@Controller("workflow-shares")
export class WorkflowSharesController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get(":shareId")
  get(@Param("shareId") shareId: string) {
    return this.workflows.getShared(shareId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":shareId/copy")
  copy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("shareId") shareId: string,
  ) {
    return this.workflows.copyShared(user.id, shareId);
  }
}
