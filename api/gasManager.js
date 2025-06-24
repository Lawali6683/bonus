const { ethers } = require("ethers");
const admin = require("firebase-admin");

// Env variables
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;
const BSC_RPC = process.env.BSC_RPC || "https://bsc-dataseed.binance.org/";
const ADMIN_PRIVATE_KEY = process.env.ADMIN_GAS_WALLET_PRIVATE_KEY;
const COMPANY_RECIPIENT_ADDRESS = process.env.COMPANY_RECIPIENT_ADDRESS; 

// --- FIREBASE INIT ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}
const db = admin.database();

// --- ETHERS PROVIDER & ADMIN WALLET ---
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

// --- MAIN HANDLER ---
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { uid, userCoinpayid, coin, amount, txHash } = req.body;
    if (!uid && !userCoinpayid) return res.status(400).json({ error: "uid or userCoinpayid required" });
    if (!coin || !amount) return res.status(400).json({ error: "coin and amount required" });

    // 1. Find user by uid or userCoinpayid
    let userSnap;
    if (uid) {
      userSnap = await db.ref("users/" + uid).once("value");
    } else {      
      const usersSnap = await db.ref("users").orderByChild("userCoinpayid").equalTo(userCoinpayid).limitToFirst(1).once("value");
      userSnap = null;
      usersSnap.forEach(child => { userSnap = child; });
    }
    if (!userSnap || !userSnap.exists()) return res.status(404).json({ error: "User not found" });

    const user = userSnap.val();    
    const userPrivateKey = user.userWalletPrivateKey;
    if (!userPrivateKey) return res.status(400).json({ error: "User wallet private key not found" });

    const coinConfig = coins.find(c => c.coin === coin);
    if (!coinConfig) return res.status(400).json({ error: "Coin not supported" });
    const userTokenAddress = user[coinConfig.field];
    if (!userTokenAddress) return res.status(400).json({ error: "User token address not found" });

    // 3. Setup user wallet
    const userWallet = new ethers.Wallet(userPrivateKey, provider);

    // 4. Check BNB (gas) balance
    const userBnbBalance = await provider.getBalance(userTokenAddress);   
    const gasPrice = await provider.getGasPrice();  
    const contract = new ethers.Contract(coinConfig.contractAddress, BEP20_ABI, provider);
    const tokenBalance = await contract.balanceOf(userTokenAddress);
    const withdrawAmount = ethers.utils.parseUnits(amount.toString(), coinConfig.decimals);

    if (tokenBalance.lt(withdrawAmount)) {
      return res.status(400).json({ error: "User does not have enough token balance" });
    }

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

    
    if (userBnbBalance.lt(totalGasCost)) {
      const gasToSend = totalGasCost.sub(userBnbBalance).add(ethers.utils.parseEther("0.00001"));
      
      const tx1 = await adminWallet.sendTransaction({
        to: userTokenAddress,
        value: gasToSend
      });
      await tx1.wait(1);
    }
    
    const userWalletWithContract = new ethers.Contract(
      coinConfig.contractAddress,
      BEP20_ABI,
      userWallet
    );
    const tx2 = await userWalletWithContract.transfer(COMPANY_RECIPIENT_ADDRESS, withdrawAmount, { gasPrice, gasLimit });
    await tx2.wait(1);

    // 7. Success
    return res.json({
      success: true,
      txHash: tx2.hash,
      coin,
      amount: ethers.utils.formatUnits(withdrawAmount, coinConfig.decimals),
      to: COMPANY_RECIPIENT_ADDRESS
    });

  } catch (err) {
    console.error("GasManage error:", err);
    return res.status(500).json({ error: err.message });
  }
};
