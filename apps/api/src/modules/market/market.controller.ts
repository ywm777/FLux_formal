import {
  Body,
  Controller,
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
import { MarketService } from "./market.service";

@Controller("market")
export class MarketController {
  constructor(private readonly market: MarketService) {}

  /** 公开工作流市场列表 */
  @Get()
  list() {
    return this.market.listPublic();
  }

  @UseGuards(JwtAuthGuard)
  @Post("fork/:id")
  fork(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.market.fork(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/visibility")
  setVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: { visibility: "private" | "public" },
  ) {
    return this.market.setVisibility(user.id, id, body.visibility);
  }
}
