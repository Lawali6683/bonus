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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).json({ message: "Preflight OK" });
  }

  // Check method
  if (req.method !== "POST") {
    console.warn("⛔ Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check API key
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== API_AUTH_KEY) {
    console.warn("⛔ Unauthorized: Invalid API Key");
    return res.status(401).json({ error: "Unauthorized request" });
  }

  try {
    const { uid } = req.body;
    const rewardAmount = 0.00532;

    if (!uid || typeof uid !== "string") {
      console.warn("⛔ Invalid request body:", req.body);
      return res.status(400).json({ error: "Invalid uid" });
    }

    const userRef = db.ref(`users/${uid}`);
    const snapshot = await userRef.once("value");

    if (!snapshot.exists()) {
      console.warn(`❌ User not found for uid: ${uid}`);
      return res.status(404).json({ error: "User not found" });
    }

    const userData = snapshot.val();
    const currentVestBit = parseFloat(userData.vestBit) || 0;
    const updatedVestBit = parseFloat((currentVestBit + rewardAmount).toFixed(5));

    await userRef.update({ vestBit: updatedVestBit });

    console.log(`✅ Updated user ${uid}: +${rewardAmount} VestBit (from ${currentVestBit} → ${updatedVestBit})`);

    return res.status(200).json({
      message: "VestBit updated successfully",
      uid,
      oldVestBit: currentVestBit,
      added: rewardAmount,
      newVestBit: updatedVestBit
    });
  } catch (error) {
    console.error("🔥 Internal server error:", error.message);
    console.error("Full error object:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
};
