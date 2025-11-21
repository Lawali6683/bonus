const { ethers } = require("ethers");
const admin = require("firebase-admin");
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;
const BSC_RPC = "https://bsc-dataseed.binance.org/";
const ADMIN_PRIVATE_KEY = process.env.ADMIN_GAS_WALLET_PRIVATE_KEY;
const COMPANY_RECIPIENT_ADDRESS = process.env.COMPANY_RECIPIENT_ADDRESS;
const WEBHOOK_URL = "https://bonus-gamma.vercel.app/webhook";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}
const db = admin.database();
const provider = new ethers.providers.JsonRpcProvider(BSC_RPC);
const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
const coins = [
  { coin: "USDT", field: "usdtBep20Address", decimals: 18, contractAddress: "0x55d398326f99059fF775485246999027B3197955" },
  { coin: "BUSD", field: "busdBep20Address", decimals: 18, contractAddress: "0xe9e7cea3dedca5984780bafc599bd69add087d56" },
  { coin: "TRX", field: "trxBep20Address", decimals: 18, contractAddress: "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3" },
  { coin: "USDC", field: "usdcBep20Address", decimals: 18, contractAddress: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" }
];
const BEP20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];
async function getAllUsers() {
  const snapshot = await db.ref("users").once("value");
  const users = [];
  snapshot.forEach(child => {
    const data = child.val();
    users.push({ uid: child.key, userCoinpayid: data.userCoinpayid || null, ...data });
  });
  return users;
}
function getUserTokenAddress(user, coinConfig) {
  return user[coinConfig.field];
}
async function getUserBalances(walletAddress, coinConfig) {
  const contract = new ethers.Contract(coinConfig.contractAddress, BEP20_ABI, provider);
  const tokenBalance = await contract.balanceOf(walletAddress);
  const bnbBalance = await provider.getBalance(walletAddress);
  return { tokenBalance, bnbBalance };
}
async function sendWebhook({ uid, userCoinpayid, coin, amount, txHash = "", status = "success" }) {
  const body = { uid, userCoinpayid, coin, amount, txHash, status };
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "@haruna66" },
    body: JSON.stringify(body),
  });
}
async function processWithdrawal(user, coinConfig) {
  const { uid, userCoinpayid, userWalletPrivateKey: userPrivateKey } = user;
  const userTokenAddress = getUserTokenAddress(user, coinConfig);
  if (!userTokenAddress) return { status: "failed", error: "User token address not found" };
  if (!userPrivateKey) return { status: "failed", error: "User wallet private key not found" };
  
  const userWallet = new ethers.Wallet(userPrivateKey, provider);
  const { tokenBalance, bnbBalance } = await getUserBalances(userTokenAddress, coinConfig);
  const contract = new ethers.Contract(coinConfig.contractAddress, BEP20_ABI, provider);
  const gasPrice = await provider.getGasPrice();
  
  const withdrawAmount = tokenBalance; 
  if (withdrawAmount.isZero()) return { status: "skipped", message: "Zero balance" };

  const transferData = contract.interface.encodeFunctionData("transfer", [COMPANY_RECIPIENT_ADDRESS, withdrawAmount]);
  let gasLimit;
  try {
    gasLimit = await provider.estimateGas({
      from: userTokenAddress,
      to: coinConfig.contractAddress,
      data: transferData
    });
    gasLimit = gasLimit.mul(105).div(100); 
  } catch (err) {
    gasLimit = ethers.BigNumber.from(120000); 
  }
  const totalGasCost = gasPrice.mul(gasLimit);
  
  if (bnbBalance.lt(totalGasCost)) {
    const gasToSend = totalGasCost.sub(bnbBalance).add(ethers.utils.parseEther("0.00001"));
    const adminBnbBalance = await provider.getBalance(adminWallet.address);

    if (adminBnbBalance.lt(gasToSend)) {
      return { status: "failed", error: "Company wallet has insufficient BNB for gas.", coin: coinConfig.coin, amount: ethers.utils.formatUnits(withdrawAmount, coinConfig.decimals), bnbRequired: ethers.utils.formatUnits(gasToSend, 18) };
    }
    
    const tx1 = await adminWallet.sendTransaction({
      to: userTokenAddress,
      value: gasToSend
    });
    await tx1.wait(1); 
  }
  
  const userWalletWithContract = new ethers.Contract(coinConfig.contractAddress, BEP20_ABI, userWallet);
  const tx2 = await userWalletWithContract.transfer(COMPANY_RECIPIENT_ADDRESS, withdrawAmount, { gasPrice, gasLimit });
  await tx2.wait(1);
  
  const amountWithdrawn = ethers.utils.formatUnits(withdrawAmount, coinConfig.decimals);
  await sendWebhook({ uid, userCoinpayid, coin: coinConfig.coin, amount: amountWithdrawn, txHash: tx2.hash, status: "success" });
  
  return {
    status: "success",
    txHash: tx2.hash,
    coin: coinConfig.coin,
    amount: amountWithdrawn,
    to: COMPANY_RECIPIENT_ADDRESS
  };
}
async function main() {
  const users = await getAllUsers();
  const results = [];
  
  for (const user of users) {
    for (const coinConfig of coins) {
      try {
        const userTokenAddress = getUserTokenAddress(user, coinConfig);
        if (!userTokenAddress) continue;
        
        const { tokenBalance } = await getUserBalances(userTokenAddress, coinConfig);
        if (tokenBalance.isZero()) continue; 
        
        const result = await processWithdrawal(user, coinConfig);
        results.push({ 
          uid: user.uid, 
          userCoinpayid: user.userCoinpayid,
          ...result 
        });
      } catch (err) {
        results.push({ 
          uid: user.uid, 
          userCoinpayid: user.userCoinpayid,
          status: "failed", 
          coin: coinConfig.coin, 
          error: err.message 
        });
      }
    }
  }
  return results;
}
module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const key = req.headers["x-api-key"] || req.query.key;
    if (key !== "@haruna66") {
      return res.status(403).json({ error: "Invalid API Key" });
    }
    const results = await main();
    
    return res.status(200).json({ 
        success: true, 
        message: "GasManager process finished.", 
        results 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
