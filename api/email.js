const fetch = require("node-fetch");

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

    const apiKey = process.env.BREVO_API_KEY;


    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Vestinoo Team 📩",
          email: "vestinoo@brevo.email"  // zaka iya canzawa
        },
        to: [
          {
            email: to,
            name: "Recipient"
          }
        ],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Brevo API error:", result);
      return res.status(500).json({ error: "Failed to send email", details: result });
    }

    console.log("✅ Email sent successfully to:", to);
    return res.status(200).json({ message: "Email sent successfully", data: result });

  } catch (err) {
    console.error("❌ Email send error:", err);
    return res.status(500).json({
      error: "Failed to send email",
      details: err.message || "Unknown error",
    });
  }
};
