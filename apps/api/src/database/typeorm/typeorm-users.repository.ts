import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import type { AuthChannel } from "@flux/shared";
import { UserEntity } from "../entities/user.entity";
import { UserIdentityEntity } from "../entities/user-identity.entity";
import {
  AddIdentityInput,
  CreateUserInput,
  IdentityRow,
  UpdateUserProfileInput,
  UserRow,
  UsersRepository,
} from "../repositories/users.repository";

function toUserRow(entity: UserEntity): UserRow {
  return {
    id: entity.id,
    displayName: entity.displayName,
    avatarUrl: entity.avatarUrl ?? null,
    passwordHash: entity.passwordHash ?? null,
    authVersion: entity.authVersion,
    createdAt: entity.createdAt.toISOString(),
  };
}

@Injectable()
export class TypeOrmUsersRepository extends UsersRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  private get users() {
    return this.dataSource.getRepository(UserEntity);
  }

  private get identities() {
    return this.dataSource.getRepository(UserIdentityEntity);
  }

  async createUser(input: CreateUserInput): Promise<UserRow> {
    const entity = this.users.create({
      id: randomUUID(),
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      passwordHash: input.passwordHash ?? null,
      authVersion: 1,
    });
    await this.users.save(entity);
    return toUserRow(entity);
  }

  async findById(id: string): Promise<UserRow | null> {
    const entity = await this.users.findOne({ where: { id } });
    return entity ? toUserRow(entity) : null;
  }

  async updateProfile(
    id: string,
    input: UpdateUserProfileInput,
  ): Promise<UserRow | null> {
    const entity = await this.users.findOne({ where: { id } });
    if (!entity) return null;
    entity.displayName = input.displayName;
    return toUserRow(await this.users.save(entity));
  }

  async updatePasswordAndBumpAuthVersion(
    id: string,
    passwordHash: string,
  ): Promise<UserRow | null> {
    const entity = await this.users.findOne({ where: { id } });
    if (!entity) return null;
    entity.passwordHash = passwordHash;
    entity.authVersion += 1;
    return toUserRow(await this.users.save(entity));
  }

  async bumpAuthVersion(id: string): Promise<UserRow | null> {
    const entity = await this.users.findOne({ where: { id } });
    if (!entity) return null;
    entity.authVersion += 1;
    return toUserRow(await this.users.save(entity));
  }

  async addIdentity(input: AddIdentityInput): Promise<IdentityRow> {
    const entity = this.identities.create({
      id: randomUUID(),
      userId: input.userId,
      channel: input.channel,
      externalId: input.externalId,
      verified: input.verified ?? false,
    });
    await this.identities.save(entity);
    return {
      id: entity.id,
      userId: entity.userId,
      channel: entity.channel,
      externalId: entity.externalId,
      verified: entity.verified,
    };
  }

  async findByIdentity(
    channel: AuthChannel,
    externalId: string,
  ): Promise<UserRow | null> {
    const identity = await this.identities.findOne({
      where: { channel, externalId },
    });
    if (!identity) return null;
    return this.findById(identity.userId);
  }

  async listIdentities(userId: string): Promise<IdentityRow[]> {
    const rows = await this.identities.find({ where: { userId } });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      channel: row.channel,
      externalId: row.externalId,
      verified: row.verified,
    }));
  }
}
