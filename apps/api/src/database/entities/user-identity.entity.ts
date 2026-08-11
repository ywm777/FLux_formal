import { Column, Entity, Index, ManyToOne, PrimaryColumn } from "typeorm";
import type { AuthChannel } from "@flux/shared";
import { UserEntity } from "./user.entity";

@Entity({ name: "user_identities" })
@Index(["channel", "externalId"], { unique: true })
export class UserIdentityEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 16 })
  channel!: AuthChannel;

  /** 渠道侧唯一标识：openid / 手机号 / 邮箱 */
  @Column({ type: "varchar", length: 320 })
  externalId!: string;

  @Column({ type: "boolean", default: false })
  verified!: boolean;

  @ManyToOne(() => UserEntity, (user) => user.identities, {
    onDelete: "CASCADE",
  })
  user!: UserEntity;
}
