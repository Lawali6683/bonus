const admin = require("firebase-admin");
const crypto = require("crypto");

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
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

    // Handle OPTIONS request (CORS Preflight)
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    // Verify API key
    const authHeader = req.headers["x-api-key"];
    if (!authHeader || authHeader !== API_AUTH_KEY) {
        return res.status(401).json({ error: "Unauthorized request" });
    }

    // Verify POST method
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { email, bonusAmount } = req.body;
    if (!email || !bonusAmount) {
        return res.status(400).json({ error: "Email and bonusAmount are required" });
    }

    try {
        const userRef = db.ref(`users/${crypto.createHash("md5").update(email).digest("hex")}`);
        const userSnapshot = await userRef.once("value");

        if (!userSnapshot.exists()) {
            return res.status(404).json({ error: "User not found" });
        }

        const userData = userSnapshot.val();
        const { vestBit } = userData;

        // Add bonus amount to VestBit
        const newVestBit = vestBit + parseFloat(bonusAmount);
        await userRef.update({ vestBit: newVestBit });

        res.json({ message: "VestBit updated successfully." });
    } catch (error) {
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};
