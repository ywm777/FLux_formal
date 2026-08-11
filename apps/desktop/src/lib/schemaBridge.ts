import type { JSONSchema } from "@flux/node-sdk";
import type { FieldSchema, FormSchema } from "@flux/ui";

/** 将节点 SDK 的 JSONSchema 转为 UI SchemaForm 的 FormSchema */
export function toFormSchema(schema: JSONSchema | undefined): FormSchema {
  const fields: Record<string, FieldSchema> = {};
  const properties = schema?.properties ?? {};

  for (const [key, prop] of Object.entries(properties)) {
    const label = prop.title ?? key;
    const hint = prop.description;

    if (prop.enum && prop.enum.length > 0) {
      fields[key] = {
        type: "enum",
        label,
        hint,
        options: prop.enum.map((value) => ({
          value: String(value),
          label: String(value),
        })),
      };
      continue;
    }

    switch (prop.type) {
      case "number":
        fields[key] = { type: "number", label, hint };
        break;
      case "boolean":
        fields[key] = { type: "boolean", label, hint };
        break;
      case "object":
      case "array":
        fields[key] = { type: "code", label, language: "json", hint };
        break;
      case "string":
      default:
        if (prop.format === "code") {
          fields[key] = { type: "code", label, hint };
        } else if (prop.format === "textarea") {
          fields[key] = { type: "string", label, hint, multiline: true };
        } else {
          fields[key] = { type: "string", label, hint };
        }
    }
  }

  return { fields };
}

/** 用 schema 默认值初始化配置 */
export function defaultsFromSchema(
  schema: JSONSchema | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema?.properties ?? {})) {
    if (prop.default !== undefined) out[key] = prop.default;
  }
  return out;
}
