import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "邮箱格式不正确" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "密码至少 8 位" })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: "昵称不能超过 40 个字符" })
  displayName?: string;
}

export class EmailLoginDto {
  @IsEmail({}, { message: "邮箱格式不正确" })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class WeChatLoginDto {
  @IsString()
  @MinLength(1)
  code!: string;
}

export class SmsLoginDto {
  @IsString()
  @MinLength(1)
  phone!: string;

  @IsString()
  @MinLength(1)
  code!: string;
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(1, { message: "昵称不能为空" })
  @MaxLength(40, { message: "昵称不能超过 40 个字符" })
  displayName!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "新密码至少 8 位" })
  @MaxLength(128)
  newPassword!: string;
}
