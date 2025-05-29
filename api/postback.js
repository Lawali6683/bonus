const admin = require("firebase-admin");
const crypto = require("crypto");

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;

if (!admin.apps.length && SERVICE_ACCOUNT) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();
const VERCEL_LOG = console.log;

module.exports = async (req, res) => {
  const query = req.query;
  const {
    cmd,
    userId,
    amt,
    offerInvitationId,
    status,
    oiHash,
    currencyAmt,
    transactionId,
    endUserId,
    offerTitle,
    useragent,
    currencyName,
    offerType,
    txnHash,
    transactionSource,
  } = query;

  // Log everything for debugging
  VERCEL_LOG("Received RapidoReach postback:", query);

  // Validate required fields
  if (
    !cmd ||
    !userId ||
    !amt ||
    !status ||
    !transactionId ||
    status !== "C"
  ) {
    return res.status(400).json({ error: "Missing or invalid postback data" });
  }

  try {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once("value");
    const userData = snapshot.val();

    if (!userData) {
      VERCEL_LOG("User not found in database:", userId);
      return res.status(404).json({ error: "User not found" });
    }

    const taskBonusPath = `users/${userId}/taskBonus`;
    const currentBonusSnapshot = await db.ref(taskBonusPath).once("value");
    const currentBonus = currentBonusSnapshot.val() || 0;

    const rewardAmount = parseFloat(amt);
    if (isNaN(rewardAmount) || rewardAmount <= 0) {
      return res.status(400).json({ error: "Invalid reward amount" });
    }

    const bonusToAdd = rewardAmount / 2;
    const updatedBonus = currentBonus + bonusToAdd;

    await db.ref(taskBonusPath).set(updatedBonus);

    VERCEL_LOG(`User ${userId} credited with bonus: ${bonusToAdd} (total: ${updatedBonus})`);

    return res.status(200).json({ success: true, message: "User credited" });
  } catch (error) {
    VERCEL_LOG("Postback processing error:", error);
    return res.status(500).json({ error: "Internal server error", detail: error.message });
  }
};
