import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser, RequestWithUser } from "../guards/jwt-auth.guard";

/** 从已通过 JwtAuthGuard 的请求中取出当前用户 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new Error("CurrentUser 需配合 JwtAuthGuard 使用");
    }
    return request.user;
  },
);
