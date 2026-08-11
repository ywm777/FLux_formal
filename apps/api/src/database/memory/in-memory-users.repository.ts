import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AuthChannel } from "@flux/shared";
import {
  AddIdentityInput,
  CreateUserInput,
  IdentityRow,
  UpdateUserProfileInput,
  UserRow,
  UsersRepository,
} from "../repositories/users.repository";

@Injectable()
export class InMemoryUsersRepository extends UsersRepository {
  private readonly users = new Map<string, UserRow>();
  private readonly identities = new Map<string, IdentityRow>();

  async createUser(input: CreateUserInput): Promise<UserRow> {
    const user: UserRow = {
      id: randomUUID(),
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      passwordHash: input.passwordHash ?? null,
      authVersion: 1,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async findById(id: string): Promise<UserRow | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async updateProfile(
    id: string,
    input: UpdateUserProfileInput,
  ): Promise<UserRow | null> {
    const user = this.users.get(id);
    if (!user) return null;
    user.displayName = input.displayName;
    return { ...user };
  }

  async updatePasswordAndBumpAuthVersion(
    id: string,
    passwordHash: string,
  ): Promise<UserRow | null> {
    const user = this.users.get(id);
    if (!user) return null;
    user.passwordHash = passwordHash;
    user.authVersion += 1;
    return { ...user };
  }

  async bumpAuthVersion(id: string): Promise<UserRow | null> {
    const user = this.users.get(id);
    if (!user) return null;
    user.authVersion += 1;
    return { ...user };
  }

  async addIdentity(input: AddIdentityInput): Promise<IdentityRow> {
    const row: IdentityRow = {
      id: randomUUID(),
      userId: input.userId,
      channel: input.channel,
      externalId: input.externalId,
      verified: input.verified ?? false,
    };
    this.identities.set(row.id, row);
    return { ...row };
  }

  async findByIdentity(
    channel: AuthChannel,
    externalId: string,
  ): Promise<UserRow | null> {
    for (const identity of this.identities.values()) {
      if (identity.channel === channel && identity.externalId === externalId) {
        return this.findById(identity.userId);
      }
    }
    return null;
  }

  async listIdentities(userId: string): Promise<IdentityRow[]> {
    return [...this.identities.values()]
      .filter((identity) => identity.userId === userId)
      .map((identity) => ({ ...identity }));
  }
}
