import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { AI_PROVIDERS, type AiProvider } from "../../../database/repositories/ai-connections.repository";

export class CreateAiConnectionDto {
  @IsString()
  @Length(1, 120)
  label!: string;

  @IsIn(AI_PROVIDERS)
  provider!: AiProvider;

  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  baseUrl!: string;

  @IsString()
  @Length(1, 200)
  defaultModel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  apiKey?: string;
}

export class AiCompletionDto {
  @IsOptional()
  @IsUUID()
  connectionId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  model?: string;

  @IsString()
  @Length(1, 200_000)
  prompt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_768)
  maxTokens?: number;
}
