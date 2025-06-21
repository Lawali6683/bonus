const { ethers } = require("ethers");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_DATABASE_SDK);
const API_AUTH_KEY = process.env.API_AUTH_KEY;
const WEBHOOK_URL = "https://bonus-gamma.vercel.app/webhook";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();
const provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed.binance.org/");

const tokenContracts = {
  USDT: {
    address: "0x55d398326f99059fF775485246999027B3197955",
    decimals: 18,
  },
  BUSD: {
    address: "0xe9e7cea3dedca5984780bafc599bd69add087d56",
    decimals: 18,
  },
  TRX: {
    address: "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3",
    decimals: 18,
  },
};

async function monitor() {
  const usersSnap = await db.ref("users").once("value");
  const users = usersSnap.val();

  for (const uid in users) {
    const user = users[uid];
    const bnbWallet = user.userBnBWalletAddress || user.bnbBep20Address;
if (!bnbWallet) continue;


    // Check native BNB
    const bnbBalance = await provider.getBalance(bnbWallet);
    const bnbAmount = parseFloat(ethers.utils.formatEther(bnbBalance));
    if (bnbAmount > 0.001) {
      await sendWebhook(uid, "BNB", bnbAmount, "native_bnb_tx_hash");
    }

    // Check tokens
    for (const coin in tokenContracts) {
      const { address, decimals } = tokenContracts[coin];
      const contract = new ethers.Contract(
        address,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );

      try {
        const rawBal = await contract.balanceOf(bnbWallet);
        const tokenAmount = parseFloat(ethers.utils.formatUnits(rawBal, decimals));
        if (tokenAmount > 0.01) {
          await sendWebhook(uid, coin, tokenAmount, "token_tx_hash");
        }
      } catch (err) {
        console.error(`Error checking ${coin} for ${uid}:`, err);
      }
    }
  }
}

async function sendWebhook(uid, coin, amount, txHash) {
  const body = JSON.stringify({ uid, coin, amount, txHash, status: "pending" });
  const secret = "@haruna66";
  const signature = require("crypto")
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": secret,
      "x-signature": signature,
    },
    body,
  });
}

module.exports = async (req, res) => {
  await monitor();
  res.status(200).json({ message: "Deposit check complete" });
};
