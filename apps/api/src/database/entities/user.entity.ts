import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { UserIdentityEntity } from "./user-identity.entity";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  displayName!: string;

  @Column({ type: "varchar", length: 512, nullable: true })
  avatarUrl?: string | null;

  /** 邮箱登录的密码哈希（其他渠道为空） */
  @Column({ type: "varchar", length: 255, nullable: true })
  passwordHash?: string | null;

  @Column({ type: "int", default: 1 })
  authVersion!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @OneToMany(() => UserIdentityEntity, (identity) => identity.user)
  identities!: UserIdentityEntity[];
}
