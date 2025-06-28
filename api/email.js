const MailerSend = require("mailersend");

const mailersend = new MailerSend.MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY
});

const { EmailParams, Recipient } = MailerSend;

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { to, subject, htmlContent } = req.body;

    if (!to || !subject || !htmlContent) {
      return res.status(400).json({ error: "Missing email details" });
    }

    const recipients = [new Recipient(to, "Recipient")];

    const emailParams = new EmailParams()
      .setFrom("vestinoomine@gmail.com")
      .setFromName("Vestinoo Team 📩")
      .setRecipients(recipients)
      .setSubject(subject)
      .setHtml(htmlContent)
      .setText("This Email from Vestinoo Team.");

    const response = await mailersend.email.send(emailParams);

    console.log("✅ Email sent successfully to:", to);
    return res.status(200).json({ message: "Email sent successfully", data: response.body });

  } catch (err) {
    console.error("❌ Email send error:", err);
    return res.status(500).json({
      error: "Failed to send email",
      details: err.message || "Unknown error",
    });
  }
};
