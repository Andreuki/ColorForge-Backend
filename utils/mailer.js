const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendPasswordResetEmail = async (to, resetUrl) => {
  await transporter.sendMail({
    from: `"ColorForge" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Restablecer contraseña - ColorForge',
    html: `
      <div style="background:#111;color:#fff;padding:32px;font-family:serif;max-width:480px;margin:auto;border-radius:12px;">
        <h2 style="color:#C8922A;font-size:24px;">⚒ ColorForge</h2>
        <h3 style="color:#fff;">Restablecer tu contraseña</h3>
        <p style="color:#aaa;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>
        <a href="${resetUrl}"
          style="display:inline-block;margin:16px 0;padding:12px 24px;
                 background:#C8922A;color:#000;font-weight:bold;
                 border-radius:8px;text-decoration:none;">
          Restablecer contraseña
        </a>
        <p style="color:#666;font-size:12px;">Este enlace expira en 1 hora. Si no lo solicitaste, ignora este email.</p>
      </div>
    `
  });
};

module.exports = { sendPasswordResetEmail };
