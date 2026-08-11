import { ConflictException, Injectable } from "@nestjs/common";
import {
  builtinNodes,
  catalogNodes,
  type NodeDefinition,
} from "@flux/node-sdk";

export interface PublicNodeDefinition {
  id: string;
  name: string;
  category: string;
  icon: string;
  version: string;
  carrier: string;
  ports: NodeDefinition["ports"];
  configSchema: NodeDefinition["configSchema"];
  ownerId?: string;
  custom?: boolean;
}

interface CustomNodeRecord extends PublicNodeDefinition {
  ownerId: string;
  source?: string;
}

@Injectable()
export class NodesService {
  private readonly custom = new Map<string, CustomNodeRecord>();

  listPublic(): PublicNodeDefinition[] {
    const builtins: PublicNodeDefinition[] = catalogNodes.map((n) => ({
      id: n.id,
      name: n.name,
      category: n.category,
      icon: n.icon,
      version: n.version,
      carrier: n.carrier,
      ports: n.ports,
      configSchema: n.configSchema,
      custom: false,
    }));
    const customs = [...this.custom.values()].map(({ source: _s, ...rest }) => ({
      ...rest,
      custom: true,
    }));
    return [...builtins, ...customs];
  }

  registerCustom(
    ownerId: string,
    input: {
      id: string;
      name: string;
      category?: string;
      carrier?: string;
      configSchema?: unknown;
      source?: string;
    },
  ): PublicNodeDefinition {
    if (builtinNodes.some((n) => n.id === input.id) || this.custom.has(input.id)) {
      throw new ConflictException("节点 ID 已存在");
    }
    const record: CustomNodeRecord = {
      id: input.id,
      name: input.name,
      category: input.category ?? "自定义",
      icon: "box",
      version: "0.1.0",
      carrier: input.carrier ?? "code",
      ports: {
        inputs: [{ id: "in", name: "输入" }],
        outputs: [{ id: "out", name: "输出" }],
      },
      configSchema: (input.configSchema as NodeDefinition["configSchema"]) ?? {
        type: "object",
        properties: {},
      },
      ownerId,
      source: input.source,
      custom: true,
    };
    this.custom.set(record.id, record);
    return record;
  }
}
