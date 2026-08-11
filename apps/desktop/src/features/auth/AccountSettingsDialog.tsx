import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button, Field, Input } from "@flux/ui";
import type { AuthChannel } from "@flux/shared";
import { formatProductErrorMessage } from "../../lib/productError.js";
import { useAuthStore } from "../../store/authStore.js";

interface AccountSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type AccountTab = "profile" | "security";
type Notice = { tone: "success" | "error"; message: string } | null;

const CHANNEL_LABELS: Record<AuthChannel, string> = {
  email: "邮箱",
  phone: "手机号",
  wechat: "微信",
};

export function AccountSettingsDialog({
  open,
  onClose,
}: AccountSettingsDialogProps) {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const changePassword = useAuthStore((state) => state.changePassword);
  const revokeOtherSessions = useAuthStore(
    (state) => state.revokeOtherSessions,
  );
  const [tab, setTab] = useState<AccountTab>("profile");
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busy = profileBusy || passwordBusy || sessionsBusy;
  const busyRef = useRef(busy);

  const email = useMemo(
    () =>
      user?.identities.find((identity) => identity.channel === "email")
        ?.externalId ?? "未绑定邮箱",
    [user],
  );
  const initial = (user?.displayName || email || "F").charAt(0).toUpperCase();

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    setDisplayName(user?.displayName ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNotice(null);
    setTab("profile");
  }, [open, user?.displayName]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    requestAnimationFrame(() => closeRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open || !user) return null;

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setNotice({ tone: "error", message: "昵称不能为空" });
      return;
    }
    setProfileBusy(true);
    setNotice(null);
    try {
      await updateProfile(name);
      setDisplayName(name);
      setNotice({ tone: "success", message: "个人资料已保存" });
    } catch (error) {
      setNotice({
        tone: "error",
        message: formatProductErrorMessage(error, "保存资料失败"),
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setNotice({ tone: "error", message: "新密码至少需要 8 位" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ tone: "error", message: "两次输入的新密码不一致" });
      return;
    }
    setPasswordBusy(true);
    setNotice(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice({ tone: "success", message: "密码已更新，旧会话已失效" });
    } catch (error) {
      setNotice({
        tone: "error",
        message: formatProductErrorMessage(error, "修改密码失败"),
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function revokeSessions() {
    setSessionsBusy(true);
    setNotice(null);
    try {
      await revokeOtherSessions();
      setNotice({ tone: "success", message: "其他设备已退出登录" });
    } catch (error) {
      setNotice({
        tone: "error",
        message: formatProductErrorMessage(error, "会话处理失败"),
      });
    } finally {
      setSessionsBusy(false);
    }
  }

  return (
    <div
      className="account-settings-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="account-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
      >
        <header className="account-settings-header">
          <div className="account-settings-avatar" aria-hidden="true">
            {initial}
          </div>
          <div className="account-settings-heading">
            <h2 id="account-settings-title">账户设置</h2>
            <span>{email}</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="account-settings-close"
            aria-label="关闭账户设置"
            title="关闭"
            disabled={busy}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="account-settings-layout">
          <nav className="account-settings-tabs" aria-label="账户设置分类">
            <button
              type="button"
              className={tab === "profile" ? "is-active" : undefined}
              aria-current={tab === "profile" ? "page" : undefined}
              onClick={() => {
                setTab("profile");
                setNotice(null);
              }}
            >
              <ProfileIcon />
              个人资料
            </button>
            <button
              type="button"
              className={tab === "security" ? "is-active" : undefined}
              aria-current={tab === "security" ? "page" : undefined}
              onClick={() => {
                setTab("security");
                setNotice(null);
              }}
            >
              <ShieldIcon />
              登录与安全
            </button>
          </nav>

          <div className="account-settings-content">
            {tab === "profile" ? (
              <form className="account-settings-section" onSubmit={submitProfile}>
                <div className="account-settings-section-title">
                  <h3>个人资料</h3>
                </div>

                <Field label="昵称" htmlFor="account-display-name">
                  <Input
                    id="account-display-name"
                    value={displayName}
                    maxLength={40}
                    autoComplete="name"
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </Field>

                <dl className="account-settings-details">
                  <div>
                    <dt>登录邮箱</dt>
                    <dd>{email}</dd>
                  </div>
                  <div>
                    <dt>加入时间</dt>
                    <dd>{formatAccountDate(user.createdAt)}</dd>
                  </div>
                </dl>

                <NoticeLine notice={notice} />

                <div className="account-settings-actions">
                  <Button
                    type="submit"
                    disabled={profileBusy || displayName.trim() === user.displayName}
                  >
                    {profileBusy ? "正在保存" : "保存资料"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="account-settings-section">
                <section aria-labelledby="account-identities-title">
                  <div className="account-settings-section-title">
                    <h3 id="account-identities-title">登录方式</h3>
                  </div>
                  <div className="account-identity-list">
                    {user.identities.map((identity) => (
                      <div
                        className="account-identity-row"
                        key={`${identity.channel}:${identity.externalId}`}
                      >
                        <span className="account-identity-icon" aria-hidden="true">
                          {CHANNEL_LABELS[identity.channel].charAt(0)}
                        </span>
                        <span className="account-identity-copy">
                          <strong>{CHANNEL_LABELS[identity.channel]}</strong>
                          <span>{identity.externalId}</span>
                        </span>
                        <span className="account-identity-state">已绑定</span>
                      </div>
                    ))}
                  </div>
                </section>

                {user.identities.some((identity) => identity.channel === "email") && (
                  <form
                    className="account-password-form"
                    aria-labelledby="account-password-title"
                    onSubmit={submitPassword}
                  >
                    <div className="account-settings-section-title">
                      <h3 id="account-password-title">修改密码</h3>
                    </div>
                    <Field label="当前密码" htmlFor="account-current-password">
                      <PasswordInput
                        id="account-current-password"
                        value={currentPassword}
                        autoComplete="current-password"
                        onChange={setCurrentPassword}
                      />
                    </Field>
                    <div className="account-password-grid">
                      <Field
                        label="新密码"
                        htmlFor="account-new-password"
                        hint="至少 8 位"
                      >
                        <PasswordInput
                          id="account-new-password"
                          value={newPassword}
                          autoComplete="new-password"
                          onChange={setNewPassword}
                        />
                      </Field>
                      <Field label="确认新密码" htmlFor="account-confirm-password">
                        <PasswordInput
                          id="account-confirm-password"
                          value={confirmPassword}
                          autoComplete="new-password"
                          onChange={setConfirmPassword}
                        />
                      </Field>
                    </div>
                    <div className="account-settings-actions">
                      <Button
                        type="submit"
                        disabled={
                          passwordBusy ||
                          !currentPassword ||
                          !newPassword ||
                          !confirmPassword
                        }
                      >
                        {passwordBusy ? "正在更新" : "更新密码"}
                      </Button>
                    </div>
                  </form>
                )}

                <section
                  className="account-session-section"
                  aria-labelledby="account-session-title"
                >
                  <div>
                    <h3 id="account-session-title">设备会话</h3>
                    <span>保留当前设备，退出其他已登录设备</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={sessionsBusy}
                    onClick={() => void revokeSessions()}
                  >
                    {sessionsBusy ? "正在处理" : "退出其他设备"}
                  </Button>
                </section>

                <NoticeLine notice={notice} />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  autoComplete,
  onChange,
}: {
  id: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="account-password-input">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        required
        maxLength={128}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-label={visible ? "隐藏密码" : "显示密码"}
        aria-pressed={visible}
        title={visible ? "隐藏密码" : "显示密码"}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      className="account-settings-notice"
      data-tone={notice.tone}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <span aria-hidden="true" />
      {notice.message}
    </div>
  );
}

function formatAccountDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.4 13c.5-2.3 2.1-3.5 4.6-3.5s4.1 1.2 4.6 3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.2 13 4v3.6c0 3-1.7 5-5 6.2-3.3-1.2-5-3.2-5-6.2V4l5-1.8Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.3" />
      <path d="m5.8 8 1.4 1.4 3-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.8 8s2.2-3.5 6.2-3.5S14.2 8 14.2 8s-2.2 3.5-6.2 3.5S1.8 8 1.8 8Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 2 14 14M6.1 4.8A6.9 6.9 0 0 1 8 4.5c4 0 6.2 3.5 6.2 3.5a9.3 9.3 0 0 1-2 2.2M9.8 11.2a7 7 0 0 1-1.8.3C4 11.5 1.8 8 1.8 8a9.3 9.3 0 0 1 2-2.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}
