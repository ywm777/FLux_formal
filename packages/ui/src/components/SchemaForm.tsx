import { Field, Input, Select, Textarea } from "./Input.js";

export type FieldSchema =
  | {
      type: "string";
      label: string;
      placeholder?: string;
      multiline?: boolean;
      hint?: string;
    }
  | { type: "number"; label: string; min?: number; max?: number; hint?: string }
  | { type: "boolean"; label: string; hint?: string }
  | {
      type: "enum";
      label: string;
      options: { value: string; label: string }[];
      hint?: string;
    }
  | { type: "code"; label: string; language?: string; hint?: string };

export interface FormSchema {
  fields: Record<string, FieldSchema>;
}

export type FormValue = Record<string, unknown>;

export interface SchemaFormProps {
  schema: FormSchema;
  value: FormValue;
  onChange: (next: FormValue) => void;
}

/** 由 schema 自动渲染配置表单（string/number/bool/enum/code） */
export function SchemaForm({ schema, value, onChange }: SchemaFormProps) {
  function set(key: string, fieldValue: unknown) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
    >
      {Object.entries(schema.fields).map(([key, field]) => {
        const current = value[key];
        if (field.type === "boolean") {
          return (
            <label
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                fontSize: "var(--text-md)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(current)}
                onChange={(e) => set(key, e.target.checked)}
              />
              {field.label}
            </label>
          );
        }

        return (
          <Field key={key} label={field.label} htmlFor={key} hint={field.hint}>
            {field.type === "enum" ? (
              <Select
                id={key}
                value={String(current ?? "")}
                onChange={(e) => set(key, e.target.value)}
              >
                <option value="" disabled>
                  请选择…
                </option>
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            ) : field.type === "number" ? (
              <Input
                id={key}
                type="number"
                min={field.min}
                max={field.max}
                value={current === undefined ? "" : String(current)}
                onChange={(e) =>
                  set(key, e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
            ) : field.type === "code" ? (
              <Textarea
                id={key}
                value={String(current ?? "")}
                onChange={(e) => set(key, e.target.value)}
                spellCheck={false}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-base)",
                  minHeight: 140,
                }}
              />
            ) : field.multiline ? (
              <Textarea
                id={key}
                value={String(current ?? "")}
                placeholder={field.placeholder}
                onChange={(e) => set(key, e.target.value)}
              />
            ) : (
              <Input
                id={key}
                value={String(current ?? "")}
                placeholder={field.placeholder}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
