/**
 * Interfaz de correo: drivers `console` (terminal), `smtp` (Brevo) y
 * `ses` (AWS, Fase 9). Se elige con MAIL_DRIVER=console|smtp|ses.
 */
export const MAIL_DRIVER = process.env.MAIL_DRIVER ?? 'console';

/** Límite de enlaces mágicos por correo y ventana. */
export const MAGIC_LINK_LIMIT = 5;
export const MAGIC_LINK_WINDOW_MS = 60 * 60 * 1000;

function smtpConfig() {
  const user = process.env.BREVO_SMTP_EMAIL;
  const pass = process.env.BREVO_SMTP_PASS;
  if (!user || !pass) {
    throw new Error('Faltan BREVO_SMTP_EMAIL / BREVO_SMTP_PASS en el entorno.');
  }
  return {
    host: process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com',
    port: Number(process.env.BREVO_SMTP_PORT ?? 587),
    secure: false, // STARTTLS en 587
    auth: { user, pass },
  };
}

/**
 * Envía el enlace mágico de ingreso.
 * @param {{ to: string, url: string }} args
 */
export async function sendMagicLink({ to, url }) {
  const driver = process.env.MAIL_DRIVER ?? 'console';
  if (driver === 'console') {
    console.log('\n===== ENLACE MÁGICO =====\nPara: ' + to + '\n' + url + '\n=========================\n');
    return { delivered: false, driver };
  }
  if (driver === 'smtp') {
    const { default: nodemailer } = await import('nodemailer');
    const from = process.env.BREVO_EMAIL_NO_REPLY ?? 'familia@localhost';
    const transporter = nodemailer.createTransport(smtpConfig());
    const info = await transporter.sendMail({
      from: `Árbol Familiar <${from}>`,
      to,
      subject: 'Tu enlace para entrar al Árbol Familiar',
      text:
        `Hola,\n\nEntra al Árbol Genealógico Familiar con este enlace (vale 1 hora y un solo clic):\n${url}\n\n` +
        `Al abrirlo verás un botón para confirmar tu ingreso.\n\n` +
        `Si no lo pediste, ignora este correo.\n`,
      html:
        `<div style="font-family:Arial,sans-serif;font-size:18px;line-height:1.6;max-width:560px">` +
        `<p>Hola,</p><p>Entra al <strong>Árbol Genealógico Familiar</strong> tocando el botón ` +
        `(vale 1 hora y un solo clic; abrir este correo no lo gasta):</p>` +
        `<p><a href="${url}" style="display:inline-block;background:#047857;color:#fff;` +
        `font-size:20px;font-weight:bold;padding:14px 28px;border-radius:12px;text-decoration:none">` +
        `Entrar al árbol</a></p>` +
        `<p style="color:#666">Si no lo pediste, ignora este correo.</p></div>`,
    });
    console.log(`[mailer:smtp] enlace enviado a ${to} (id ${info.messageId})`);
    return { delivered: true, driver, messageId: info.messageId };
  }
  if (driver === 'ses') {
    throw new Error('Mailer SES pendiente (Fase 9: configurar AWS SES).');
  }
  throw new Error(`MAIL_DRIVER desconocido: ${driver}`);
}
