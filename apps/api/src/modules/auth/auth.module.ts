import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import {
  createSmsAdapter,
  createWeChatAdapter,
  SMS_ADAPTER,
  WECHAT_ADAPTER,
} from "./channels/channel-adapter";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    { provide: WECHAT_ADAPTER, useFactory: createWeChatAdapter },
    { provide: SMS_ADAPTER, useFactory: createSmsAdapter },
  ],
  exports: [AuthService, TokenService, JwtAuthGuard],
})
export class AuthModule {}
