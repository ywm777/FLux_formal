import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { mockAuthChannelsEnabled } from "../auth-runtime-config";

export interface ChannelVerifyResult {
  /** 渠道侧唯一标识：微信 openid / 手机号 */
  externalId: string;
  displayName?: string;
}

/**
 * 第三方渠道登录适配器接口。
 * 首期仅邮箱必通；微信/手机为预留适配器，开发环境用 mock 实现，
 * 生产替换为真实的微信开放平台扫码 / 短信服务商。
 */
export abstract class ChannelAdapter {
  abstract verify(
    payload: Record<string, unknown>,
  ): Promise<ChannelVerifyResult>;
}

/** 微信扫码登录适配器（mock：直接用 code 派生 openid） */
export class MockWeChatAdapter extends ChannelAdapter {
  async verify(payload: Record<string, unknown>): Promise<ChannelVerifyResult> {
    const code = String(payload.code ?? "").trim();
    if (!code) throw new UnauthorizedException("缺少微信授权 code");
    return { externalId: `wx_${code}`, displayName: "微信用户" };
  }
}

/** 短信验证码登录适配器（mock：开发环境固定验证码） */
export class MockSmsAdapter extends ChannelAdapter {
  constructor(private readonly devCode = process.env.SMS_DEV_CODE ?? "000000") {
    super();
  }

  async verify(payload: Record<string, unknown>): Promise<ChannelVerifyResult> {
    const phone = String(payload.phone ?? "").trim();
    const code = String(payload.code ?? "").trim();
    if (!phone) throw new UnauthorizedException("缺少手机号");
    if (code !== this.devCode) {
      throw new UnauthorizedException("验证码错误");
    }
    return { externalId: phone, displayName: `用户${phone.slice(-4)}` };
  }
}

class UnavailableChannelAdapter extends ChannelAdapter {
  constructor(private readonly channelLabel: string) {
    super();
  }

  async verify(): Promise<ChannelVerifyResult> {
    throw new ServiceUnavailableException(
      `${this.channelLabel}登录尚未配置，请使用邮箱登录`,
    );
  }
}

export function createWeChatAdapter(): ChannelAdapter {
  return mockAuthChannelsEnabled()
    ? new MockWeChatAdapter()
    : new UnavailableChannelAdapter("微信");
}

export function createSmsAdapter(): ChannelAdapter {
  return mockAuthChannelsEnabled()
    ? new MockSmsAdapter()
    : new UnavailableChannelAdapter("短信验证码");
}

export const WECHAT_ADAPTER = Symbol("WECHAT_ADAPTER");
export const SMS_ADAPTER = Symbol("SMS_ADAPTER");
