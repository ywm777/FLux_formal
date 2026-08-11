import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";
import {
  WorkflowsService,
} from "./workflows.service";
import {
  CreateWorkflowDto,
  ToggleFavoriteDto,
  UpdateWorkflowDto,
} from "./dto/workflow.dto";

@UseGuards(JwtAuthGuard)
@Controller("workflows")
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workflows.listByOwner(user.id);
  }

  @Get("published")
  listPublished(@CurrentUser() user: AuthenticatedUser) {
    return this.workflows.listPublished(user.id);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.workflows.getOwned(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateWorkflowDto,
  ) {
    return this.workflows.create(user.id, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: UpdateWorkflowDto,
  ) {
    return this.workflows.update(user.id, id, body);
  }

  @Post(":id/publish")
  publish(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.workflows.publish(user.id, id);
  }

  @Get(":id/share")
  getShare(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.workflows.getShare(user.id, id);
  }

  @Post(":id/share")
  enableShare(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.workflows.enableShare(user.id, id);
  }

  @Delete(":id/share")
  disableShare(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.workflows.disableShare(user.id, id);
  }

  @Post(":id/favorite")
  favorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: ToggleFavoriteDto,
  ) {
    return this.workflows.toggleFavorite(user.id, id, body.isFavorite);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.workflows.remove(user.id, id);
  }
}
