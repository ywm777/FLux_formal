import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { AuthChannel, AuthResult, User } from "@flux/shared";
import {
  IdentityRow,
  UserRow,
  UsersRepository,
} from "../../database/repositories/users.repository";
import { TokenService } from "./token.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: TokenService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResult> {
    const email = this.normalizeEmail(input.email);
    const existing = await this.users.findByIdentity("email", email);
    if (existing) throw new ConflictException("该邮箱已注册");
    const passwordHash = await bcrypt.hash(input.password, 10);
    const requestedName = input.displayName?.trim();
    const user = await this.users.createUser({
      displayName: requestedName || email.split("@")[0],
      passwordHash,
    });
    await this.users.addIdentity({
      userId: user.id,
      channel: "email",
      externalId: email,
      verified: false,
    });
    return this.buildResult(user.id);
  }

  async loginEmail(input: {
    email: string;
    password: string;
  }): Promise<AuthResult> {
    const user = await this.users.findByIdentity(
      "email",
      this.normalizeEmail(input.email),
    );
    if (!user?.passwordHash) {
      throw new UnauthorizedException("邮箱或密码错误");
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("邮箱或密码错误");
    return this.buildResult(user.id);
  }

  /** 渠道登录（微信/手机）：首次登录自动建号 */
  async loginByChannel(
    channel: AuthChannel,
    externalId: string,
    displayName?: string,
  ): Promise<AuthResult> {
    let user = await this.users.findByIdentity(channel, externalId);
    if (!user) {
      user = await this.users.createUser({
        displayName: displayName ?? `${channel}_user`,
      });
      await this.users.addIdentity({
        userId: user.id,
        channel,
        externalId,
        verified: true,
      });
    }
    return this.buildResult(user.id);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let sub: string;
    let authVersion: number;
    try {
      ({ sub, authVersion } = await this.tokens.verifyRefresh(refreshToken));
    } catch {
      throw new UnauthorizedException("refresh token 无效或已过期");
    }
    const user = await this.users.findById(sub);
    if (!user || user.authVersion !== authVersion) {
      throw new UnauthorizedException("账户会话已失效，请重新登录");
    }
    return this.buildResult(user.id);
  }

  async me(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException("用户不存在");
    const identities = await this.users.listIdentities(userId);
    return this.toPublicUser(user, identities);
  }

  async updateProfile(
    userId: string,
    input: { displayName: string },
  ): Promise<User> {
    const displayName = input.displayName.trim();
    if (!displayName) throw new BadRequestException("昵称不能为空");
    const user = await this.users.updateProfile(userId, { displayName });
    if (!user) throw new UnauthorizedException("用户不存在");
    const identities = await this.users.listIdentities(userId);
    return this.toPublicUser(user, identities);
  }

  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user?.passwordHash) {
      throw new BadRequestException("当前账户未设置邮箱密码");
    }
    const currentMatches = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );
    if (!currentMatches) throw new UnauthorizedException("当前密码错误");
    const unchanged = await bcrypt.compare(input.newPassword, user.passwordHash);
    if (unchanged) throw new BadRequestException("新密码不能与当前密码相同");

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    const updated = await this.users.updatePasswordAndBumpAuthVersion(
      userId,
      passwordHash,
    );
    if (!updated) throw new UnauthorizedException("用户不存在");
    return this.buildResult(userId);
  }

  async revokeOtherSessions(userId: string): Promise<AuthResult> {
    const user = await this.users.bumpAuthVersion(userId);
    if (!user) throw new UnauthorizedException("用户不存在");
    return this.buildResult(userId);
  }

  private async buildResult(userId: string): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException("用户不存在");
    const identities = await this.users.listIdentities(userId);
    const tokens = await this.tokens.issue(userId, user.authVersion);
    return { user: this.toPublicUser(user, identities), tokens };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toPublicUser(user: UserRow, identities: IdentityRow[]): User {
    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? undefined,
      identities: identities.map((identity) => ({
        channel: identity.channel,
        externalId: identity.externalId,
        verified: identity.verified,
      })),
      createdAt: user.createdAt,
    };
  }
}
