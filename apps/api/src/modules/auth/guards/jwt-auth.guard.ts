import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { UsersRepository } from "../../../database/repositories/users.repository";
import { TokenService } from "../token.service";

export interface AuthenticatedUser {
  id: string;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("缺少访问令牌");
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const payload = await this.tokens.verifyAccess(token);
      const user = await this.users.findById(payload.sub);
      if (!user || user.authVersion !== payload.authVersion) {
        throw new Error("账户会话已失效");
      }
      request.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("访问令牌无效或已过期");
    }
  }
}
