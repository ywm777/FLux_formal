import { Injectable, Logger } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import type { AuthTokens } from "@flux/shared";
import { resolveAuthTokenRuntimeConfig } from "./auth-runtime-config";

export interface AccessPayload {
  sub: string;
  type: "access";
  authVersion: number;
}

export interface RefreshPayload {
  sub: string;
  type: "refresh";
  authVersion: number;
}

/** access / refresh 双令牌签发与校验（无状态 JWT） */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly runtime = resolveAuthTokenRuntimeConfig();

  constructor(private readonly jwt: JwtService) {
    if (this.runtime.generatedDevelopmentSecrets) {
      this.logger.warn(
        "未配置完整 JWT 密钥，已生成仅在本进程有效的开发密钥；重启后现有会话会失效",
      );
    }
  }

  async issue(userId: string, authVersion: number): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, type: "access", authVersion } satisfies AccessPayload,
      {
        secret: this.runtime.accessSecret,
        expiresIn: this.runtime.accessTtlSeconds,
      } as JwtSignOptions,
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: "refresh", authVersion } satisfies RefreshPayload,
      {
        secret: this.runtime.refreshSecret,
        expiresIn: this.runtime.refreshTtlSeconds,
      } as JwtSignOptions,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: this.runtime.accessTtlSeconds,
    };
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
      secret: this.runtime.accessSecret,
    });
    if (payload.type !== "access") throw new Error("非 access 令牌");
    return payload;
  }

  async verifyRefresh(token: string): Promise<RefreshPayload> {
    const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
      secret: this.runtime.refreshSecret,
    });
    if (payload.type !== "refresh") throw new Error("非 refresh 令牌");
    return payload;
  }
}
