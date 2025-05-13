const admin = require("firebase-admin");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, wellecomeBonus, referralBonusLeve1, referralBonussLeve2 } = req.body;

    if (
      !email ||
      (wellecomeBonus === undefined &&
        referralBonusLeve1 === undefined &&
        referralBonussLeve2 === undefined)
    ) {
      return res.status(400).json({ error: "Invalid request data" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const usersRef = db.ref("users");
    const snapshot = await usersRef.once("value");

    let userKey = null;
    let userData = null;

    snapshot.forEach(child => {
      const data = child.val();
      if (data.email && data.email.trim().toLowerCase() === normalizedEmail) {
        userKey = child.key;
        userData = data;
      }
    });

    if (!userKey || !userData) {
      console.error("User not found for email:", normalizedEmail);
      return res.status(404).json({ error: "User not found" });
    }

    const updates = {};
    let currentBalance = parseFloat(userData.userBalance) || 0;

    // Logging values
    console.log("User found:", userData);
    console.log("Incoming bonuses:", { wellecomeBonus, referralBonusLeve1, referralBonussLeve2 });

    if (parseFloat(wellecomeBonus) > 0 && parseFloat(userData.wellecomeBonus) > 0) {
      updates.wellecomeBonus = 0;
      currentBalance += 0.50;
    }

    if (parseFloat(referralBonusLeve1) > 0 && parseFloat(userData.referralBonusLeve1) > 0) {
      updates.referralBonusLeve1 = 0;
      currentBalance += parseFloat(referralBonusLeve1);
    }

    if (parseFloat(referralBonussLeve2) > 0 && parseFloat(userData.referralBonussLeve2) > 0) {
      updates.referralBonussLeve2 = 0;
      currentBalance += parseFloat(referralBonussLeve2);
    }

    if (Object.keys(updates).length === 0) {
      console.log("No updates needed for user:", userKey);
      return res.status(200).json({ message: "No bonuses to apply" });
    }

    updates.userBalance = parseFloat(currentBalance.toFixed(2));

    await db.ref(`users/${userKey}`).update(updates);

    console.log("Updated user:", userKey, "Updates:", updates);

    return res.status(200).json({ message: "Bonus processed successfully", updates });

  } catch (error) {
    console.error("Error processing the bonus:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};
