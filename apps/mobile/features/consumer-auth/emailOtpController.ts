import type { ConsumerAuthPort } from "./ports";
export type EmailOtpPurpose = "login" | "signup";
export type EmailOtpStatus = "idle" | "sending" | "code_sent" | "verifying" | "verified";
export type EmailOtpSnapshot = Readonly<{ status: EmailOtpStatus; email: string; purpose: EmailOtpPurpose; resendAt: number; attempts: number; error: string | null }>;
export const DEVELOPMENT_EMAIL_OTP_LENGTH = 8; // Hosted Development config read back on 2026-10-10.
export class ConsumerEmailOtpController {
  private state: EmailOtpSnapshot = Object.freeze({ status: "idle", email: "", purpose: "login", resendAt: 0, attempts: 0, error: null });
  private listeners = new Set<() => void>();
  private epoch = 0;
  private verifiedAt: number | null = null;
  private verifiedUserId: string | null = null;
  constructor(private readonly auth: ConsumerAuthPort, private readonly now: () => number = Date.now) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit(patch: Partial<EmailOtpSnapshot>) { this.state = Object.freeze({ ...this.state, ...patch }); for (const fn of this.listeners) fn(); }
  private busy() { return this.state.status === "sending" || this.state.status === "verifying"; }
  changeEmail() {
    if (this.busy()) return false;
    this.epoch++;
    this.verifiedAt = null; this.verifiedUserId = null;
    // Keep the sending cooldown when switching email or auth mode.
    this.emit({ status: "idle", email: "", purpose: "login", error: null });
    return true;
  }
  useReceivedCode(email: string) {
    if (this.busy() || this.state.status === "verified") return false;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { this.emit({ error: "invalid_email" }); return false; }
    if (this.state.status === "code_sent" && this.state.purpose !== "login") return false;
    // Resume only an existing-account email challenge. Provider verification is still required.
    // Preserve attempts and cooldown: reopening the input must not reset either limit.
    this.epoch++;
    this.emit({ status: "code_sent", email: address, purpose: "login", error: null });
    return true;
  }
  async send(email: string, purpose: EmailOtpPurpose) {
    if (this.busy() || this.state.status === "verified") return false;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { this.emit({ error: "invalid_email" }); return false; }
    if (this.now() < this.state.resendAt) { this.emit({ error: "email_otp_rate_limited" }); return false; }
    if (!this.auth.sendEmailCode) { this.emit({ error: "operation_not_enabled" }); return false; }
    const epoch = ++this.epoch, priorStatus = this.state.status;
    this.emit({ status: "sending", error: null, resendAt: this.now() + 60000 });
    try {
      const r = await this.auth.sendEmailCode({ email: address, purpose });
      if (epoch !== this.epoch) return false;
      if (!r.ok) { this.emit({ status: priorStatus, error: r.error.code }); return false; }
      this.emit({ status: "code_sent", email: address, purpose, attempts: 0, error: null });
      return true;
    } catch { if (epoch === this.epoch) this.emit({ status: priorStatus, error: "email_otp_transport_failed" }); return false; }
  }
  async setOwnPassword(password: string) {
    if (this.busy() || this.state.status !== "verified" || this.verifiedAt === null || !this.verifiedUserId || this.now() - this.verifiedAt > 300000) {
      this.emit({ error: "password_reauthentication_required" }); return false;
    }
    if (password.length < 8) { this.emit({ error: "password_invalid" }); return false; }
    if (!this.auth.setOwnPassword) { this.emit({ error: "operation_not_enabled" }); return false; }
    const epoch = this.epoch, actor = this.verifiedUserId;
    this.emit({ status: "verifying", error: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("PASSWORD_SETTINGS_TIMEOUT")), 15000); });
      const current = await Promise.race([this.auth.getCurrentSession(), deadline]);
      if (epoch !== this.epoch || !current.ok || current.value?.user.userId !== actor) {
        if (epoch === this.epoch) this.emit({ status: "verified", error: "password_reauthentication_required" }); return false;
      }
      const result = await Promise.race([this.auth.setOwnPassword({ expectedUserId: actor, password }), deadline]);
      password = "";
      if (epoch !== this.epoch) return false;
      this.emit({ status: "verified", error: result.ok ? null : result.error.code });
      if (result.ok) { this.verifiedAt = null; this.verifiedUserId = null; }
      return result.ok;
    } catch (error) {
      password = "";
      if (epoch === this.epoch) {
        const uncertain = error instanceof Error && error.message === "PASSWORD_SETTINGS_TIMEOUT";
        if (uncertain) { this.epoch++; this.verifiedAt = null; this.verifiedUserId = null; }
        this.emit({ status: "verified", error: uncertain ? "password_update_uncertain" : "password_update_failed" });
      }
      return false;
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }

  async verify(token: string) {
    if (this.busy() || this.state.status !== "code_sent") return false;
    if (!new RegExp("^\\d{" + DEVELOPMENT_EMAIL_OTP_LENGTH + "}$").test(token)) { this.emit({ error: "invalid_code" }); return false; }
    if (this.state.attempts >= 5) { this.emit({ error: "email_otp_attempts_exhausted" }); return false; }
    if (!this.auth.verifyEmailCode) { this.emit({ error: "operation_not_enabled" }); return false; }
    const epoch = this.epoch;
    this.emit({ status: "verifying", error: null, attempts: this.state.attempts + 1 });
    try {
      const r = await this.auth.verifyEmailCode({ email: this.state.email, token });
      token = "";
      if (epoch !== this.epoch) return false;
      if (!r.ok) { this.emit({ status: "code_sent", error: r.error.code }); return false; }
      this.verifiedAt = this.now(); this.verifiedUserId = r.value.user.userId;
      this.emit({ status: "verified", error: null });
      return true;
    } catch { token = ""; if (epoch === this.epoch) this.emit({ status: "code_sent", error: "email_otp_transport_failed" }); return false; }
  }
}
