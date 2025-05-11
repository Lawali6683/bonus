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

  const { email, bonusAmount } = req.body;

  if (!email || bonusAmount === undefined) {
    return res.status(400).json({ error: "Email and bonusAmount are required" });
  }

  try {
    const usersRef = db.ref("users");
    const snapshot = await usersRef.once("value");

    let foundUserKey = null;
    snapshot.forEach((childSnapshot) => {
      const userData = childSnapshot.val();
      if (userData.email === email) {
        foundUserKey = childSnapshot.key;
      }
    });

    if (!foundUserKey) {
      return res.status(404).json({ error: "User with this email not found" });
    }

    const userRef = db.ref(`users/${foundUserKey}`);
    const userSnapshot = await userRef.once("value");
    const user = userSnapshot.val();

    const currentVestBit = parseFloat(user.vestBit || 0);
    const bonusToAdd = parseFloat(bonusAmount);

    if (isNaN(bonusToAdd)) {
      return res.status(400).json({ error: "Invalid bonusAmount value" });
    }

    const newVestBit = currentVestBit + bonusToAdd;

    await userRef.update({ vestBit: newVestBit });

    return res.json({ message: "VestBit bonus added successfully." });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};
