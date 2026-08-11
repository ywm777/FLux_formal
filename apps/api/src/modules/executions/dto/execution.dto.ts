import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import type { ExecutionNodeInputs } from "@flux/shared";

/** 启动已发布工作流或草稿测试运行。 */
export class StartExecutionDto {
  @IsString()
  workflowId!: string;

  @IsOptional()
  @IsObject()
  inputs?: ExecutionNodeInputs;
}

export class ApproveExecutionDto {
  @IsString()
  nodeId!: string;

  @IsIn(["approved", "rejected"])
  decision!: "approved" | "rejected";

  @IsOptional()
  @IsString()
  reviewer?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
