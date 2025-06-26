const nodemailer = require("nodemailer");

module.exports = async (req, res) => {
  try {
    // Bada damar POST kawai
    if (req.method !== "POST") {
      console.log("❌ Invalid method used:", req.method);
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { to, subject, htmlContent } = req.body;

    
    if (!to || !subject || !htmlContent) {
      console.log("❌ Missing fields:", { to, subject, htmlContent });
      return res.status(400).json({ error: "Missing email details" });
    }

    // Karbo credentials daga environment variables
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    const emailHost = process.env.EMAIL_HOST || "smtp-relay.brevo.com";
    const emailPort = process.env.EMAIL_PORT || 587;

    if (!emailUser || !emailPass) {
      console.log("❌ EMAIL_USER or EMAIL_PASS missing in environment");
      return res.status(500).json({ error: "Server misconfigured: missing credentials" });
    }

    // Create transporter na Brevo
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: Number(emailPort),
      secure: false,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    const mailOptions = {
      from: `"Vestinoo Team 📩" <${emailUser}>`,
      to,
      subject,
      html: htmlContent,
    };

    console.log("📨 Attempting to send email to:", to);
    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", result.messageId);

    return res.status(200).json({ message: "Email sent successfully" });
  } catch (err) {
    console.error("❌ Email send error:", err);
    return res.status(500).json({
      error: "Failed to send email",
      details: err.message || "Unknown error",
    });
  }
};
