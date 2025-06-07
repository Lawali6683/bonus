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
  try {
    res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    if (req.method === "OPTIONS") return res.status(204).end();

    
    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
      return res.status(401).json({ error: "Unauthorized request: Invalid API key" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { email, withdrawalPassword } = req.body;

    if (!email || !withdrawalPassword) {
      return res.status(400).json({ error: "Missing email or withdrawalPassword in request body" });
    }

    const usersRef = db.ref("users");
    const snapshot = await usersRef.once("value");
    const users = snapshot.val();

    if (!users) {
      return res.status(404).json({ error: "No users found in database" });
    }

    let foundUid = null;

    Object.keys(users).forEach(uid => {
      if (users[uid].email && users[uid].email.toLowerCase() === email.toLowerCase()) {
        foundUid = uid;
      }
    });

    if (!foundUid) {
      return res.status(404).json({ error: "User not found with the provided email" });
    }

    
    await db.ref(`users/${foundUid}/withdrawalPassword`).set(withdrawalPassword);

    return res.status(200).json({
      message: "withdrawalPassword has been successfully set",
      uid: foundUid,
    });

  } catch (error) {
    console.error("Error in /api/password route:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
      stack: error.stack,
    });
  }
};
