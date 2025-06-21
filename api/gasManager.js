const admin = require("firebase-admin");
const ethers = require("ethers");

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;
const API_AUTH_KEY = process.env.API_AUTH_KEY;
const BSC_RPC = process.env.BSC_RPC || "https://bsc-dataseed.binance.org/";
const BNB_RECEIVER = process.env.BNB_RECEIVER;

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { uid, coin, amount, txHash } = req.body;
  if (!uid || !coin || !amount || !txHash) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const usersSnap = await db.ref("users").once("value");

    // Nemo admin user
    let adminUser = null;
    usersSnap.forEach((child) => {
      const val = child.val();
      if (val.email === "harunalawali5522@gmail.com") {
        adminUser = val;
      }
    });

    if (!adminUser || !adminUser.userWalletPrivateKey || !adminUser.bnbBep20Address) {
      return res.status(400).json({ error: "Admin wallet info missing" });
    }

    // Duba user da aka turo uid dinsa
    const userSnap = await db.ref(`users/${uid}`).once("value");
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userSnap.val();
    if (!user.bnbBep20Address) {
      return res.status(400).json({ error: "User BNB address missing" });
    }

    // Check if gas already sent
    const gasCheck = await db.ref(`gasProcessed/${uid}`).once("value");
    if (gasCheck.exists()) {
      return res.status(200).json({ message: "Gas already sent." });
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const wallet = new ethers.Wallet(adminUser.userWalletPrivateKey, provider);

    const gasFee = ethers.parseEther("0.0008");

    // Tura gas fee zuwa wallet na user
    const tx = await wallet.sendTransaction({
      to: user.bnbBep20Address,
      value: gasFee,
    });

    await tx.wait();

    await db.ref(`gasProcessed/${uid}`).set({
      status: "sent",
      from: adminUser.bnbBep20Address,
      to: user.bnbBep20Address,
      amount: "0.0008",
      txHash: tx.hash,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error("GAS ERROR:", err);
    await db.ref(`gasErrors/${uid}_${Date.now()}`).set({
      error: err.message,
      full: err.toString(),
      time: new Date().toISOString(),
    });
    res.status(500).json({ error: "Failed to send gas fee" });
  }
};
