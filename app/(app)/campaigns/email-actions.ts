"use server";

import { Resend } from "resend";

export type SendEmailResult = { ok: boolean; error?: string; errorCode?: string };

export async function sendCampaignEmail(to: string, subject: string, body: string): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: "לא הוגדרו RESEND_API_KEY / RESEND_FROM_EMAIL בקובץ .env.local" };

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, text: body || subject });
  if (error) return { ok: false, error: error.message, errorCode: error.name };
  return { ok: true };
}

export async function sendHtmlEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; contentBase64: string }[]
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: "לא הוגדרו RESEND_API_KEY / RESEND_FROM_EMAIL בקובץ .env.local" };

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    attachments: attachments?.map((a) => ({ filename: a.filename, content: a.contentBase64 })),
  });
  if (error) return { ok: false, error: error.message, errorCode: error.name };
  return { ok: true };
}
