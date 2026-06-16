import { Body, Controller, Post } from "@nestjs/common";

/**
 * 多渠道登录占位（微信 / 手机号 / 邮箱）。
 * 真实实现见 PRD 6.2：返回 access + refresh token。
 */
@Controller("auth")
export class AuthController {
  @Post("wechat")
  wechat(@Body() body: { code: string }) {
    return { todo: "wechat-oauth", received: body };
  }

  @Post("sms")
  sms(@Body() body: { phone: string; code: string }) {
    return { todo: "sms-login", received: body };
  }

  @Post("email")
  email(@Body() body: { email: string; password: string }) {
    return { todo: "email-login", received: { email: body.email } };
  }

  @Post("refresh")
  refresh(@Body() body: { refreshToken: string }) {
    return { todo: "refresh-token", received: Boolean(body.refreshToken) };
  }
}
