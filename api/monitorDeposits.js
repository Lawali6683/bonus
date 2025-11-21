const { ethers } = require("ethers");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const API_AUTH_KEY = process.env.API_AUTH_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK ? JSON.parse(process.env.FIREBASE_DATABASE_SDK) : null;
const WEBHOOK_URL = "https://bonus-gamma.vercel.app/webhook";
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}
const db = admin.database();
const BSC_RPC = process.env.BSC_RPC || "https://bsc-dataseed.binance.org/";
const provider = new ethers.providers.JsonRpcProvider(BSC_RPC);
const coins = [
  { coin: "BNB", field: "bnbBep20Address", networkId: "56", decimals: 18 },
  { coin: "USDT", field: "usdtBep20Address", networkId: "56", decimals: 18, contractAddress: "0x55d398326f99059fF775485246999027B3197955" },
  { coin: "BUSD", field: "busdBep20Address", networkId: "56", decimals: 18, contractAddress: "0xe9e7cea3dedca5984780bafc599bd69add087d56" },
  { coin: "TRX", field: "trxBep20Address", networkId: "56", decimals: 18, contractAddress: "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3" },
  { coin: "USDC", field: "usdcBep20Address", networkId: "56", decimals: 18, contractAddress: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" }
];
const BEP20_ABI = ["function balanceOf(address) view returns (uint256)"];
async function getAllUsers() {
  const snapshot = await db.ref("users").once("value");
  const users = [];
  snapshot.forEach(child => {
    const data = child.val();
    users.push({ uid: child.key, userCoinpayid: data.userCoinpayid || null, ...data });
  });
  return users;
}
function getUserWalletAddress(user) {
  for (const coin of coins) {
    if (user[coin.field]) return user[coin.field];
  }
  if (user.userBnbWalletAddress) return user.userBnbWalletAddress;
  if (user.walletAddress) return user.walletAddress;
  return null;
}
async function getUserBalances(walletAddress) {
  const result = {};
  result.BNB = await provider.getBalance(walletAddress);
  for (const coin of coins) {
    if (coin.coin === "BNB") continue;
    const contract = new ethers.Contract(coin.contractAddress, BEP20_ABI, provider);
    try {
      result[coin.coin] = await contract.balanceOf(walletAddress);
    } catch {
      result[coin.coin] = ethers.BigNumber.from(0);
    }
  }
  return result;
}
async function getLastCheckedBalances(uid) {
  const snapshot = await db.ref(`deposits_monitor/${uid}`).once("value");
  return snapshot.val() || {};
}
async function updateLastCheckedBalances(uid, balances) {
  await db.ref(`deposits_monitor/${uid}`).set(balances);
}
function hasDeposit(current, previous) {
  const result = [];
  for (const coin of Object.keys(current)) {
    const coinCfg = coins.find(c => c.coin === coin);
    if (!coinCfg) continue;
    const currentValue = ethers.BigNumber.from(current[coin] || 0);
    const prevValue = ethers.BigNumber.from(previous[coin] || 0);
    if (currentValue.gt(prevValue)) {
      result.push({
        coin,
        amount: ethers.utils.formatUnits(currentValue.sub(prevValue), coinCfg.decimals),
      });
    }
  }
  return result;
}
async function sendWebhook({ uid, userCoinpayid, coin, amount, txHash = "", status = "pending" }) {
  const body = { uid, userCoinpayid, coin, amount, txHash, status };
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "@haruna66" },
    body: JSON.stringify(body),
  });
}
async function main(isAdminRequest = false) {
  if (API_AUTH_KEY && process.env.CRON_API_KEY !== API_AUTH_KEY && !isAdminRequest) throw new Error("Invalid API_AUTH_KEY.");
  const users = await getAllUsers();
  const allIncreasedDeposits = [];
  for (const user of users) {
    try {
      const { uid, userCoinpayid } = user;
      const walletAddress = getUserWalletAddress(user);
      if (!walletAddress) continue;
      const prevBalances = await getLastCheckedBalances(uid);
      const currentBalances = await getUserBalances(walletAddress);
      const prevRaw = {};
      const currRaw = {};
      for (const coin of coins) {
        currRaw[coin.coin] = currentBalances[coin.coin]?.toString() || "0";
        prevRaw[coin.coin] = prevBalances[coin.coin] || "0";
      }
      const increased = hasDeposit(currRaw, prevRaw);
      if (increased.length > 0) {
        for (const dep of increased) {
          const depositInfo = { uid, userCoinpayid, walletAddress, ...dep, status: "Pending Withdrawal", isWithdrawn: false };
          allIncreasedDeposits.push(depositInfo);
          if (!isAdminRequest) {
            await sendWebhook(depositInfo);
          }
        }
        await updateLastCheckedBalances(uid, currRaw);
      }
    } catch (err) {
      console.error(`Failed for user ${user.uid}:`, err);
    }
  }
  return allIncreasedDeposits;
}
module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const key = req.headers["x-api-key"] || req.query.key;
    if (key !== "@haruna66") {
      return res.status(403).json({ error: "Invalid API Key" });
    }
    const isAdminRequest = req.query.source === 'admin';
    const deposits = await main(isAdminRequest);
    
    if (isAdminRequest) {
      return res.status(200).json({ success: true, deposits });
    } else {
      return res.status(200).json({ success: true, message: `monitorDeposits finished. ${deposits.length} deposits found.` });
    }
  } catch (err) {
    console.error("Error in monitorDeposits:", err);
    return res.status(500).json({ error: err.message });
  }
};
