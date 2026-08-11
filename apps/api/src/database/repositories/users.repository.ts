import type { AuthChannel } from "@flux/shared";

export interface UserRow {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  passwordHash?: string | null;
  /** 登录凭据变化时递增，使既有 access/refresh token 立即失效。 */
  authVersion: number;
  createdAt: string;
}

export interface IdentityRow {
  id: string;
  userId: string;
  channel: AuthChannel;
  externalId: string;
  verified: boolean;
}

export interface CreateUserInput {
  displayName: string;
  avatarUrl?: string;
  passwordHash?: string;
}

export interface AddIdentityInput {
  userId: string;
  channel: AuthChannel;
  externalId: string;
  verified?: boolean;
}

export interface UpdateUserProfileInput {
  displayName: string;
}

/** 用户与多渠道身份的持久化抽象（内存 / TypeORM 两种实现） */
export abstract class UsersRepository {
  abstract createUser(input: CreateUserInput): Promise<UserRow>;
  abstract findById(id: string): Promise<UserRow | null>;
  abstract updateProfile(
    id: string,
    input: UpdateUserProfileInput,
  ): Promise<UserRow | null>;
  abstract updatePasswordAndBumpAuthVersion(
    id: string,
    passwordHash: string,
  ): Promise<UserRow | null>;
  abstract bumpAuthVersion(id: string): Promise<UserRow | null>;
  abstract addIdentity(input: AddIdentityInput): Promise<IdentityRow>;
  abstract findByIdentity(
    channel: AuthChannel,
    externalId: string,
  ): Promise<UserRow | null>;
  abstract listIdentities(userId: string): Promise<IdentityRow[]>;
}
