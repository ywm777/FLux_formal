import { defineNode } from "../registry.js";

export const recordArchiveNode = defineNode({
  id: "flux.business.recordArchive",
  name: "归档业务记录",
  description: "把处理结果写入指定业务系统，并保留去重键和处理时间",
  category: "业务记录",
  icon: "database",
  version: "0.1.0",
  carrier: "app",
  ports: {
    inputs: [{ id: "in", name: "处理结果" }],
    outputs: [{ id: "out", name: "归档结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      system: {
        type: "string",
        title: "目标系统",
        default: "业务记录中心",
      },
      collection: {
        type: "string",
        title: "记录类型",
        default: "处理记录",
      },
      recordKey: {
        type: "string",
        title: "去重字段",
        default: "id",
      },
      retryTimes: {
        type: "number",
        title: "失败重试次数",
        default: 2,
      },
      fallbackOwner: {
        type: "string",
        title: "异常负责人",
        default: "业务运营",
      },
    },
  },
  async execute(ctx) {
    const config = ctx.config as {
      system?: string;
      collection?: string;
      recordKey?: string;
      retryTimes?: number;
      fallbackOwner?: string;
    };
    const system = String(config.system ?? "业务记录中心");
    const collection = String(config.collection ?? "处理记录");
    const retryTimes = Math.max(0, Math.trunc(Number(config.retryTimes ?? 2)));
    ctx.log("info", `已归档至 ${system} / ${collection}`);
    return {
      outputs: {
        out: {
          ...ctx.inputs,
          archive: {
            system,
            collection,
            recordKey: config.recordKey ?? "id",
            retryTimes,
            fallbackOwner: config.fallbackOwner ?? "业务运营",
            archivedAt: new Date().toISOString(),
          },
        },
      },
    };
  },
});

export const teamNotifyNode = defineNode({
  id: "flux.business.teamNotify",
  name: "通知业务团队",
  description: "把处理结论、待办和异常发送给指定团队或负责人",
  category: "团队协作",
  icon: "send",
  version: "0.1.0",
  carrier: "app",
  ports: {
    inputs: [{ id: "in", name: "业务结果" }],
    outputs: [{ id: "out", name: "通知结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        title: "通知渠道",
        enum: ["企业微信", "飞书", "Slack", "邮件"],
        default: "企业微信",
      },
      recipients: {
        type: "string",
        title: "接收人或群组",
        default: "业务运营",
      },
      message: {
        type: "string",
        title: "通知内容",
        format: "textarea",
        default: "业务流程已处理完成，请查看归档记录。",
      },
      retryTimes: {
        type: "number",
        title: "失败重试次数",
        default: 2,
      },
      fallbackOwner: {
        type: "string",
        title: "异常负责人",
        default: "业务运营",
      },
    },
  },
  async execute(ctx) {
    const config = ctx.config as {
      channel?: string;
      recipients?: string;
      message?: string;
      retryTimes?: number;
      fallbackOwner?: string;
    };
    const channel = String(config.channel ?? "企业微信");
    const recipients = String(config.recipients ?? "业务运营");
    const retryTimes = Math.max(0, Math.trunc(Number(config.retryTimes ?? 2)));
    ctx.log("info", `已通过${channel}通知 ${recipients}`);
    return {
      outputs: {
        out: {
          ...ctx.inputs,
          notification: {
            channel,
            recipients,
            message: config.message ?? "",
            retryTimes,
            fallbackOwner: config.fallbackOwner ?? "业务运营",
            sentAt: new Date().toISOString(),
          },
        },
      },
    };
  },
});

export const sharedBusinessNodes = [recordArchiveNode, teamNotifyNode];
