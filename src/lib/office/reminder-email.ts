const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);

export const REMINDER_ACTION_LABEL = "Emerald Vale Studios";
export const REMINDER_ACTION_URL = "https://www.emeraldvalestudios.com/";

export const REMINDER_TEMPLATE_VARIABLE_KEYS = [
  "subject",
  "alert_type",
  "sent_at",
  "headline",
  "intro",
  "severity_class",
  "status_label",
  "alert_title",
  "alert_summary",
  "system_name",
  "occurred_at",
  "reference_id",
  "action_url",
  "action_label",
] as const;

export type ReminderTemplateVariables = Record<(typeof REMINDER_TEMPLATE_VARIABLE_KEYS)[number], string>;

export function reminderGreetingName(name?: string | null, email?: string | null): string | null {
  const raw = name?.trim() ?? "";
  if (raw && !raw.includes("@")) {
    return raw.split(/\s+/)[0] ?? null;
  }
  return null;
}

export function reminderEmailSubject(input: {
  title: string;
  projectTitle: string;
  isTest?: boolean;
}): string {
  const title = input.title.trim() || "Reminder";
  const project = input.projectTitle.trim();
  const base =
    project && title.toLowerCase() !== project.toLowerCase() ? `${project}: ${title}` : title;
  return input.isTest ? `${base} (test)` : base;
}

export function formatReminderTimestamp(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function reminderTemplateVariables(input: {
  recipientName?: string | null;
  recipientEmail?: string | null;
  title: string;
  message: string;
  projectTitle: string;
  businessName: string;
  projectUrl: string;
  occurredAt?: Date;
  timezone?: string;
  referenceId?: string | null;
  isTest?: boolean;
  now?: Date;
}): ReminderTemplateVariables {
  const title = input.title.trim() || "Reminder";
  const project = input.projectTitle.trim() || "Project";
  const message = input.message.trim() || `You have a reminder for ${project}.`;
  const timezone = input.timezone?.trim() || "America/Chicago";
  const when = input.occurredAt ?? input.now ?? new Date();
  const sentAt = formatReminderTimestamp(input.now ?? new Date(), timezone);
  const occurredAt = formatReminderTimestamp(when, timezone);
  const greeting = reminderGreetingName(input.recipientName, input.recipientEmail);
  const intro = greeting
    ? `Hi ${greeting}, this is a ${input.isTest ? "test reminder" : "scheduled reminder"} for ${project}.`
    : `This is a ${input.isTest ? "test reminder" : "scheduled reminder"} for ${project}.`;

  return {
    subject: reminderEmailSubject({
      title,
      projectTitle: project,
      isTest: input.isTest,
    }),
    alert_type: input.isTest ? "Test reminder" : "Reminder",
    sent_at: sentAt,
    headline: title,
    intro,
    severity_class: "",
    status_label: input.isTest ? "Test send" : "Scheduled reminder",
    alert_title: title,
    alert_summary: message,
    system_name: "Project reminders",
    occurred_at: occurredAt,
    reference_id: "",
    action_url: REMINDER_ACTION_URL,
    action_label: REMINDER_ACTION_LABEL,
  };
}

function renderReminderEmailHtml(vars: ReminderTemplateVariables): string {
  const v = {
    subject: escapeHtml(vars.subject),
    alert_type: escapeHtml(vars.alert_type),
    sent_at: escapeHtml(vars.sent_at),
    headline: escapeHtml(vars.headline),
    intro: escapeHtml(vars.intro),
    severity_class: escapeHtml(vars.severity_class),
    status_label: escapeHtml(vars.status_label),
    alert_title: escapeHtml(vars.alert_title),
    alert_summary: escapeHtml(vars.alert_summary).replace(/\n/g, "<br />"),
    system_name: escapeHtml(vars.system_name),
    occurred_at: escapeHtml(vars.occurred_at),
    action_url: escapeHtml(vars.action_url),
    action_label: escapeHtml(vars.action_label),
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${v.subject}</title>
    <style>
      :root { color-scheme: light; supported-color-schemes: light; }
      body { margin: 0; padding: 0; width: 100%; background: #f6f5f1; color: #1c2824; font-family: Arial, Helvetica, sans-serif; -webkit-text-size-adjust: 100%; }
      table { border-collapse: collapse; }
      a { color: #2f6655; text-decoration: underline; }
      .email-shell { width: 100%; background: #f6f5f1; }
      .email-container { width: 100%; max-width: 620px; margin: 0 auto; }
      .brand-bar { padding: 28px 32px; background: #102a24; }
      .brand-link { text-decoration: none; }
      .brand-lockup { display: inline-flex; align-items: center; gap: 11px; color: #ffffff; font-family: Georgia, "Times New Roman", serif; font-size: 20px; letter-spacing: 0.02em; }
      .brand-mark { display: inline-block; width: 34px; height: 34px; border: 1px solid #b88a4a; border-radius: 50%; color: #d8b477; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 700; line-height: 32px; text-align: center; letter-spacing: 0.04em; }
      .brand-subtitle { display: block; margin-top: 2px; color: #9db2a8; font-family: Arial, Helvetica, sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 0.18em; line-height: 1; text-transform: uppercase; }
      .hero { padding: 42px 48px 36px; background: #ffffff; border-bottom: 1px solid #dfe7e2; }
      .eyebrow { margin: 0 0 14px; color: #b88a4a; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; line-height: 1.4; text-transform: uppercase; }
      .headline { margin: 0; color: #102a24; font-family: Georgia, "Times New Roman", serif; font-size: 34px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.16; }
      .intro { margin: 16px 0 0; color: #6b7771; font-size: 16px; line-height: 1.65; }
      .content { padding: 34px 48px 40px; background: #ffffff; }
      .alert-card { padding: 22px 24px; background: #e6f0eb; border: 1px solid #c8ddd3; border-left: 4px solid #2f6655; }
      .alert-card.alert-critical { background: #fff2ef; border-color: #f0d1cc; border-left-color: #b84b43; }
      .alert-label { margin: 0 0 8px; color: #2f6655; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
      .alert-critical .alert-label { color: #b84b43; }
      .alert-title { margin: 0; color: #102a24; font-size: 19px; line-height: 1.35; }
      .alert-copy { margin: 10px 0 0; color: #4e5e56; font-size: 14px; line-height: 1.6; }
      .details { width: 100%; margin: 28px 0; border-top: 1px solid #dfe7e2; }
      .details td { padding: 13px 0; border-bottom: 1px solid #dfe7e2; font-size: 14px; vertical-align: top; }
      .details-label { width: 36%; color: #6b7771; }
      .details-value { color: #1c2824; font-weight: 700; text-align: right; }
      .button-wrap { padding: 4px 0 6px; }
      .button { display: inline-block; padding: 14px 22px; background: #173c32; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; }
      .secondary-copy { margin: 24px 0 0; color: #6b7771; font-size: 13px; line-height: 1.65; }
      .footer { padding: 26px 48px 34px; background: #102a24; color: #c6d5ce; }
      .footer-name { margin: 0; color: #ffffff; font-family: Georgia, "Times New Roman", serif; font-size: 17px; }
      .footer-copy { margin: 8px 0 0; color: #9db2a8; font-size: 12px; line-height: 1.6; }
      .footer-links { margin: 14px 0 0; font-size: 12px; }
      .footer-links a { color: #dce9e3; }
      @media only screen and (max-width: 640px) {
        .brand-bar { padding: 24px 22px; }
        .hero { padding: 34px 24px 28px; }
        .content { padding: 28px 24px 34px; }
        .footer { padding: 24px 24px 30px; }
        .headline { font-size: 29px; }
        .details-label { width: 42%; }
      }
    </style>
  </head>
  <body>
    <table role="presentation" class="email-shell" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td class="brand-bar">
                <a class="brand-link" href="https://www.emeraldvalestudios.com/" target="_blank">
                  <span class="brand-lockup" role="img" aria-label="Emerald Vale Studios">
                    <span class="brand-mark">EV</span>
                    <span>Emerald Vale<span class="brand-subtitle">Studios</span></span>
                  </span>
                </a>
              </td>
            </tr>
            <tr>
              <td class="hero">
                <p class="eyebrow">${v.alert_type} · ${v.sent_at}</p>
                <h1 class="headline">${v.headline}</h1>
                <p class="intro">${v.intro}</p>
              </td>
            </tr>
            <tr>
              <td class="content">
                <div class="alert-card ${v.severity_class}">
                  <p class="alert-label">${v.status_label}</p>
                  <h2 class="alert-title">${v.alert_title}</h2>
                  <p class="alert-copy">${v.alert_summary}</p>
                </div>
                <table role="presentation" class="details" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="details-label">System</td>
                    <td class="details-value">${v.system_name}</td>
                  </tr>
                  <tr>
                    <td class="details-label">Occurred</td>
                    <td class="details-value">${v.occurred_at}</td>
                  </tr>
                </table>
                <div class="button-wrap">
                  <a class="button" href="${v.action_url}" target="_blank">${v.action_label}</a>
                </div>
                <p class="secondary-copy">
                  If you were not expecting this alert, or if the button does not work, contact your Emerald Vale
                  Studios administrator.
                </p>
              </td>
            </tr>
            <tr>
              <td class="footer">
                <p class="footer-name">Emerald Vale Studios</p>
                <p class="footer-copy">This is an automated notification. Please do not reply to this email.</p>
                <p class="footer-links">
                  <a href="https://www.emeraldvalestudios.com/" target="_blank">Visit our website</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderReminderEmail(input: {
  recipientName?: string | null;
  recipientEmail?: string | null;
  title: string;
  message: string;
  projectTitle: string;
  businessName: string;
  projectUrl: string;
  occurredAt?: Date;
  timezone?: string;
  referenceId?: string | null;
  isTest?: boolean;
  now?: Date;
}): { subject: string; text: string; html: string; variables: ReminderTemplateVariables } {
  const variables = reminderTemplateVariables(input);
  const text = [
    variables.intro,
    "",
    variables.alert_summary,
    "",
    `Project: ${input.projectTitle}`,
    `${variables.action_label}: ${variables.action_url}`,
    "",
    input.isTest
      ? "This was a test send and was not recorded as a delivery."
      : `Sent by ${input.businessName}.`,
  ].join("\n");

  return {
    subject: variables.subject,
    text,
    html: renderReminderEmailHtml(variables),
    variables,
  };
}

export function reminderTemplateAlias() {
  return process.env.RESEND_REMINDER_TEMPLATE?.trim() || "system-alert";
}
