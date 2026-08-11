import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";
import { AiService } from "./ai.service";
import { AiConnectionsService } from "./ai-connections.service";
import { AiCompletionDto, CreateAiConnectionDto } from "./dto/ai.dto";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly connections: AiConnectionsService,
  ) {}

  @Get("connections")
  listConnections(@CurrentUser() user: AuthenticatedUser) {
    return this.connections.list(user.id);
  }

  @Post("connections")
  createConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateAiConnectionDto,
  ) {
    return this.connections.create(user.id, body);
  }

  @Delete("connections/:id")
  removeConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.connections.remove(user.id, id);
  }

  @Post("connections/:id/test")
  @HttpCode(HttpStatus.OK)
  testConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.connections.test(user.id, id);
  }

  /** AI Proxy：可指定用户连接；未指定时使用该用户最早创建的连接。 */
  @Post("completions")
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AiCompletionDto,
  ) {
    return this.ai.complete(user.id, body);
  }
}
