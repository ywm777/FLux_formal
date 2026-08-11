import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";
import { AppsService } from "./apps.service";

@Controller("apps")
@UseGuards(JwtAuthGuard)
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  @Get("authorizations")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.apps.listAuthorizations(user.id);
  }

  @Post("authorizations")
  authorize(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: { appId: string; label: string; mechanism: "api_key" | "oauth2" | "webhook" },
  ) {
    return this.apps.authorize(user.id, body);
  }

  @Delete("authorizations/:id")
  revoke(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.apps.revoke(user.id, id);
  }
}
