import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  type ChannelAdapter,
  SMS_ADAPTER,
  WECHAT_ADAPTER,
} from "./channels/channel-adapter";
import { CurrentUser } from "./decorators/current-user.decorator";
import {
  EmailLoginDto,
  ChangePasswordDto,
  RefreshDto,
  RegisterDto,
  SmsLoginDto,
  UpdateProfileDto,
  WeChatLoginDto,
} from "./dto/auth.dto";
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from "./guards/jwt-auth.guard";

/**
 * 多渠道登录。首期邮箱必通；微信/手机走 mock 适配器，
 * 生产替换为微信开放平台扫码 / 短信服务商。
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(WECHAT_ADAPTER) private readonly wechat: ChannelAdapter,
    @Inject(SMS_ADAPTER) private readonly sms: ChannelAdapter,
  ) {}

  @Post("register")
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Post("email")
  email(@Body() body: EmailLoginDto) {
    return this.auth.loginEmail(body);
  }

  @Post("wechat")
  async wechat_(@Body() body: WeChatLoginDto) {
    const { externalId, displayName } = await this.wechat.verify({
      code: body.code,
    });
    return this.auth.loginByChannel("wechat", externalId, displayName);
  }

  @Post("sms")
  async sms_(@Body() body: SmsLoginDto) {
    const { externalId, displayName } = await this.sms.verify({
      phone: body.phone,
      code: body.code,
    });
    return this.auth.loginByChannel("phone", externalId, displayName);
  }

  @Post("refresh")
  refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("password")
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sessions/revoke-other")
  revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.revokeOtherSessions(user.id);
  }
}
