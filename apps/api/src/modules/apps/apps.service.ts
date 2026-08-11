import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface AppAuthorization {
  id: string;
  userId: string;
  appId: string;
  label: string;
  mechanism: "api_key" | "oauth2" | "webhook";
  createdAt: string;
}

@Injectable()
export class AppsService {
  private readonly store = new Map<string, AppAuthorization>();

  listAuthorizations(userId: string): AppAuthorization[] {
    return [...this.store.values()].filter((a) => a.userId === userId);
  }

  authorize(
    userId: string,
    input: {
      appId: string;
      label: string;
      mechanism: "api_key" | "oauth2" | "webhook";
    },
  ): AppAuthorization {
    const auth: AppAuthorization = {
      id: randomUUID(),
      userId,
      appId: input.appId,
      label: input.label,
      mechanism: input.mechanism,
      createdAt: new Date().toISOString(),
    };
    this.store.set(auth.id, auth);
    return auth;
  }

  revoke(userId: string, id: string): { ok: boolean } {
    const auth = this.store.get(id);
    if (!auth || auth.userId !== userId) {
      throw new NotFoundException("授权不存在");
    }
    this.store.delete(id);
    return { ok: true };
  }
}
