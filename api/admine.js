const admin = require("firebase-admin");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;

// Initialize Firebase Admin SDK
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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ✅ API Key Verification
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid, vestBit } = req.body;

    if (!uid || typeof vestBit !== "number") {
      return res.status(400).json({ error: "Invalid uid or vestBit" });
    }

    const userRef = db.ref(`users/${uid}`);
    const snapshot = await userRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentData = snapshot.val();
    const currentVestBit = parseFloat(currentData.vestBit) || 0;
    const updatedVestBit = parseFloat((currentVestBit + vestBit).toFixed(8));

    await userRef.update({ vestBit: updatedVestBit });

    return res.status(200).json({
      message: "vestBit updated successfully",
      oldVestBit: currentVestBit,
      added: vestBit,
      newVestBit: updatedVestBit,
    });
  } catch (error) {
    console.error("Error updating vestBit:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
