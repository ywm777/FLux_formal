import { useState, type FormEvent } from "react";
import { Button, Field, Input, Surface } from "@flux/ui";
import { useAuthStore } from "../../store/authStore.js";
import { BrandMark } from "../../components/BrandMark.js";

type Tab = "login" | "register";

export function LoginView({ onCancel }: { onCancel?: () => void }) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);
    if (tab === "register" && password !== confirmPassword) {
      setValidationError("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      if (tab === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, displayName.trim() || undefined);
      }
    } catch {
      /* error 已写入 store */
    } finally {
      setSubmitting(false);
    }
  }

  const title = tab === "login" ? "登录云端空间" : "创建云端空间";
  const subtitle =
    tab === "login"
      ? "同步、协作和分享你的工作流。"
      : "创建可同步与协作的个人空间。";

  return (
    <div className="login-shell">
      <div className="login-ambient" aria-hidden="true" />

      <section className="login-story" aria-label="Flux 产品介绍">
        <div className="login-story-brand">
          <BrandMark size={32} />
          <span>Flux</span>
          <span className="login-story-divider" />
          <span className="login-story-product">无界工作流</span>
        </div>

        <div className="login-story-copy">
          <span className="login-eyebrow">个人自动化工作空间</span>
          <h1>
            让重复工作
            <br />
            自然流动
          </h1>
          <p>
            在一张无界画布上连接数据、AI 与业务规则，
            <br />
            从想法到可运行流程只需几分钟。
          </p>
        </div>

        <div className="login-flow-preview" aria-hidden="true">
          <FlowPreviewNode tone="trigger" label="每天 09:00" meta="定时触发" />
          <span className="login-flow-line" />
          <FlowPreviewNode tone="ai" label="提炼重点" meta="AI 分析" />
          <span className="login-flow-line" />
          <FlowPreviewNode tone="result" label="保存简报" meta="输出结果" />
        </div>

        <div className="login-proof-list">
          <ProofItem label="自动保存，随时继续" />
          <ProofItem label="运行状态与日志清晰可见" />
          <ProofItem label="个人使用，首期完全免费" />
        </div>
      </section>

      <Surface level="surface" className="login-card">
        {onCancel ? (
          <button
            type="button"
            className="login-cloud-back"
            aria-label="返回本地空间"
            title="返回本地空间"
            onClick={onCancel}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m9.8 3.5-4.5 4.5 4.5 4.5M5.8 8h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
            </svg>
          </button>
        ) : null}
        <div className="login-card-header">
          <BrandMark size={40} />
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>

        <div className="login-tabs" role="tablist" aria-label="账户操作">
          {(["login", "register"] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setValidationError(null);
              }}
              className={tab === key ? "is-active" : undefined}
            >
              {key === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} autoComplete="on" className="login-form">
          {tab === "register" && (
            <Field label="昵称（可选）" htmlFor="displayName">
              <Input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="如何称呼你"
                autoComplete="name"
              />
            </Field>
          )}

          <Field label="邮箱" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
            />
          </Field>

          <Field
            label="密码"
            htmlFor="password"
            hint={tab === "register" ? "至少 8 位" : undefined}
          >
            <div className="login-password-field">
              {showPassword ? (
                <Input
                  id="password"
                  type="text"
                  required
                  minLength={tab === "register" ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete={
                    tab === "login" ? "current-password" : "new-password"
                  }
                />
              ) : (
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={tab === "register" ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete={
                    tab === "login" ? "current-password" : "new-password"
                  }
                />
              )}
              <button
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                className="login-password-toggle"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          {tab === "register" && (
            <Field label="确认密码" htmlFor="confirmPassword">
              <div className="login-password-field">
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                />
              </div>
            </Field>
          )}

          {validationError || error ? (
            <div className="login-error" role="alert" aria-live="assertive">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M8 4.8v3.7m0 2.5v.1"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
              </svg>
              <span>{validationError ?? error}</span>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={submitting}
            className="login-submit"
          >
            {submitting
              ? "正在处理…"
              : tab === "login"
                ? "登录"
                : "注册并登录"}
          </Button>
        </form>

        <p className="login-terms">
          {tab === "login"
            ? "本地工作流不会在登录后自动上传。"
            : "注册后可按需将工作流保存到云端。"}
        </p>
      </Surface>
    </div>
  );
}

function FlowPreviewNode({
  tone,
  label,
  meta,
}: {
  tone: "trigger" | "ai" | "result";
  label: string;
  meta: string;
}) {
  return (
    <div className="login-flow-node" data-tone={tone}>
      <span className="login-flow-node-dot" />
      <strong>{label}</strong>
      <span>{meta}</span>
    </div>
  );
}

function ProofItem({ label }: { label: string }) {
  return (
    <span className="login-proof-item">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="m3.2 8.2 3 3L12.8 5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
      {label}
    </span>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.8 8s2.2-3.5 6.2-3.5S14.2 8 14.2 8s-2.2 3.5-6.2 3.5S1.8 8 1.8 8Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 2 14 14M6.1 4.8A6.9 6.9 0 0 1 8 4.5c4 0 6.2 3.5 6.2 3.5a9.3 9.3 0 0 1-2 2.2M9.8 11.2a7 7 0 0 1-1.8.3C4 11.5 1.8 8 1.8 8a9.3 9.3 0 0 1 2-2.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}
