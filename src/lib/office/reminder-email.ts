const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);

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

export function renderReminderEmail(input: {
  recipientName?: string | null;
  recipientEmail?: string | null;
  title: string;
  message: string;
  projectTitle: string;
  businessName: string;
  projectUrl: string;
  isTest?: boolean;
}): { subject: string; text: string; html: string; variables: Record<string, string> } {
  const greeting = reminderGreetingName(input.recipientName, input.recipientEmail);
  const hi = greeting ? `Hi ${greeting},` : "Hi,";
  const message = input.message.trim() || `You have a reminder for ${input.projectTitle}.`;
  const subject = reminderEmailSubject({
    title: input.title,
    projectTitle: input.projectTitle,
    isTest: input.isTest,
  });
  const footer = input.isTest
    ? "This was a test send and was not recorded as a delivery."
    : `Sent by ${input.businessName} through Sqyid.`;

  const text = [
    hi,
    "",
    message,
    "",
    `Project: ${input.projectTitle}`,
    `Open: ${input.projectUrl}`,
    "",
    footer,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#ffffff;color:#0f172a;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.55;max-width:560px;">
    <p style="margin:0 0 16px;">${escapeHtml(hi)}</p>
    <p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(message)}</p>
    <p style="margin:0 0 20px;">Project: <strong>${escapeHtml(input.projectTitle)}</strong></p>
    <p style="margin:0 0 24px;"><a href="${escapeHtml(input.projectUrl)}" style="color:#1e3a5f;">Open this project</a></p>
    <p style="margin:0;font-size:13px;color:#64748b;">${escapeHtml(footer)}</p>
  </div>
</body>
</html>`;

  return {
    subject,
    text,
    html,
    variables: {
      GREETING: hi,
      TITLE: input.title.trim() || "Reminder",
      MESSAGE: message,
      PROJECT: input.projectTitle,
      BUSINESS: input.businessName,
      PROJECT_URL: input.projectUrl,
      FOOTER: footer,
    },
  };
}

export function reminderTemplateAlias() {
  return process.env.RESEND_REMINDER_TEMPLATE?.trim() || "system-alert";
}
