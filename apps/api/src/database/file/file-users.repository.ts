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
import { FileDb } from "./file-db";

@Injectable()
export class FileUsersRepository extends UsersRepository {
  constructor(private readonly db: FileDb) {
    super();
  }

  async createUser(input: CreateUserInput): Promise<UserRow> {
    const user: UserRow = {
      id: randomUUID(),
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      passwordHash: input.passwordHash ?? null,
      authVersion: 1,
      createdAt: new Date().toISOString(),
    };
    this.db.mutate((s) => s.users.push(user));
    return { ...user };
  }

  async findById(id: string): Promise<UserRow | null> {
    const user = this.db.get().users.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  async updateProfile(
    id: string,
    input: UpdateUserProfileInput,
  ): Promise<UserRow | null> {
    let updated: UserRow | null = null;
    this.db.mutate((s) => {
      const user = s.users.find((u) => u.id === id);
      if (!user) return;
      user.displayName = input.displayName;
      updated = { ...user };
    });
    return updated;
  }

  async updatePasswordAndBumpAuthVersion(
    id: string,
    passwordHash: string,
  ): Promise<UserRow | null> {
    let updated: UserRow | null = null;
    this.db.mutate((s) => {
      const user = s.users.find((u) => u.id === id);
      if (!user) return;
      user.passwordHash = passwordHash;
      user.authVersion += 1;
      updated = { ...user };
    });
    return updated;
  }

  async bumpAuthVersion(id: string): Promise<UserRow | null> {
    let updated: UserRow | null = null;
    this.db.mutate((s) => {
      const user = s.users.find((u) => u.id === id);
      if (!user) return;
      user.authVersion += 1;
      updated = { ...user };
    });
    return updated;
  }

  async addIdentity(input: AddIdentityInput): Promise<IdentityRow> {
    const row: IdentityRow = {
      id: randomUUID(),
      userId: input.userId,
      channel: input.channel,
      externalId: input.externalId,
      verified: input.verified ?? false,
    };
    this.db.mutate((s) => s.identities.push(row));
    return { ...row };
  }

  async findByIdentity(
    channel: AuthChannel,
    externalId: string,
  ): Promise<UserRow | null> {
    const identity = this.db
      .get()
      .identities.find(
        (i) => i.channel === channel && i.externalId === externalId,
      );
    if (!identity) return null;
    return this.findById(identity.userId);
  }

  async listIdentities(userId: string): Promise<IdentityRow[]> {
    return this.db
      .get()
      .identities.filter((i) => i.userId === userId)
      .map((i) => ({ ...i }));
  }
}
