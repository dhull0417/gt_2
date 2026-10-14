import { ENV } from "../../config/env.js";

export const emailConfigured = () =>
  ENV.LIFECYCLE_EMAILS_ENABLED === "true" && !!ENV.RESEND_API_KEY && !!ENV.EMAIL_FROM;

/**
 * Sends one email through Resend's REST API (no SDK dependency).
 * Returns { ok: true, id } or { ok: false, permanent, error }.
 * `permanent` = a 4xx other than 429: retrying the same message won't help.
 * The Idempotency-Key makes a retried request after a network blip safe.
 */
export const sendEmail = async ({ to, subject, html, text, headers, idempotencyKey, tags }) => {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: ENV.EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
        ...(ENV.EMAIL_REPLY_TO ? { reply_to: ENV.EMAIL_REPLY_TO } : {}),
        ...(headers ? { headers } : {}),
        ...(tags ? { tags } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, id: body.id ?? null };
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 409;
    return { ok: false, permanent, error: `${res.status} ${body.message || body.name || ""}`.trim() };
  } catch (err) {
    return { ok: false, permanent: false, error: err.message };
  }
};
