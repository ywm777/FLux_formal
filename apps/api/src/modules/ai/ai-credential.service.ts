import { Injectable, Logger } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

@Injectable()
export class AiCredentialService {
  private readonly logger = new Logger(AiCredentialService.name);
  private readonly key: Buffer;

  constructor() {
    const configured = process.env.AI_CREDENTIAL_ENCRYPTION_KEY?.trim();
    if (!configured && process.env.NODE_ENV === "production") {
      throw new Error("生产环境必须配置 AI_CREDENTIAL_ENCRYPTION_KEY");
    }
    if (!configured) {
      this.logger.warn(
        "未配置 AI_CREDENTIAL_ENCRYPTION_KEY，正在使用仅适合本地开发的派生密钥",
      );
    }
    const material =
      configured ??
      process.env.JWT_ACCESS_SECRET ??
      "flux-local-development-ai-credential-key";
    this.key = createHash("sha256").update(material, "utf8").digest();
  }

  encrypt(value: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(payload: string, context: string): string {
    const [version, ivPart, tagPart, encryptedPart] = payload.split(".");
    if (
      version !== VERSION ||
      !ivPart ||
      !tagPart ||
      encryptedPart === undefined
    ) {
      throw new Error("AI 凭证密文格式无效");
    }
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(ivPart, "base64url"),
      );
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedPart, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("AI 凭证无法解密，请重新创建连接");
    }
  }
}
