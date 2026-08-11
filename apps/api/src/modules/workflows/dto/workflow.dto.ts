import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

/** 请求 DTO；graph 的详细结构由 workflow-schema 在 service 层统一校验。 */
export class CreateWorkflowDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsDefined()
  graph!: unknown;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  graph?: unknown;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ToggleFavoriteDto {
  @IsBoolean()
  isFavorite!: boolean;
}
