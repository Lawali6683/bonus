const { MailerSend, EmailParams, Recipient } = require("mailersend");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      console.log("❌ Invalid method used:", req.method);
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { to, subject, htmlContent } = req.body;

    if (!to || !subject || !htmlContent) {
      console.log("❌ Missing fields:", { to, subject, htmlContent });
      return res.status(400).json({ error: "Missing email details" });
    }

    // API KEY (direct for testing)
    const mailersend = new MailerSend({
      apiKey: "mlsn.9bc72af91a8fdaad66f61dc9e4f8ec67b73e0729051bd36d323b66a75cd94ff2",
    });

    const recipients = [new Recipient(to, "Recipient")];

    const emailParams = new EmailParams()
      .setFrom("vestinoominer@gmai.com") // Change this to your verified sender or sandbox
      .setFromName("Vestinoo Team 📩")
      .setRecipients(recipients)
      .setSubject(subject)
      .setHtml(htmlContent)
      .setText("This email from Vestinoo Mine."); // optional plain text

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
