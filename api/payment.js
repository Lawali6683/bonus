const { ethers } = require("ethers");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const ADMIN_GAS_WALLET_PRIVATE_KEY = process.env.ADMIN_GAS_WALLET_PRIVATE_KEY;
const BSC_RPC = "https://bsc-dataseed.binance.org/";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST method is allowed" });

  const origin = req.headers.origin;
  if (origin !== "https://vestinoo-project.vercel.app") {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  const { amount, walletAddress, coin, networkId, userCoinpayid } = req.body || {};

  if (!amount || !walletAddress || !coin || !networkId || !userCoinpayid) {
    return res.status(400).json({ error: "Missing required withdrawal parameters" });
  }

  try {    
    const provider = new ethers.providers.JsonRpcProvider(BSC_RPC);
    const adminWallet = new ethers.Wallet(ADMIN_GAS_WALLET_PRIVATE_KEY, provider);

    // Send BNB or BEP-20 token
    let tx;
    if (coin.toUpperCase() === "BNB") {      
      tx = await adminWallet.sendTransaction({
        to: walletAddress,
        value: ethers.utils.parseEther(String(amount))
      });
    } else {
      
      const tokenConfig = {
        USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
        BUSD: { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18 },
        USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
        TRX:  { address: "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3", decimals: 18 }
      };
      const token = tokenConfig[coin.toUpperCase()];
      if (!token) return res.status(400).json({ error: "Unsupported coin" });

      const abi = [
        "function transfer(address to, uint256 value) returns (bool)"
      ];
      const contract = new ethers.Contract(token.address, abi, adminWallet);
      tx = await contract.transfer(walletAddress, ethers.utils.parseUnits(String(amount), token.decimals));
    }
    await tx.wait(1);

    // Success
    return res.status(200).json({
      success: true,
      message: "Withdrawal initiated successfully",
      txHash: tx.hash,
      userCoinpayid
    });

  } catch (err) {
    console.error("Withdrawal Error:", err);
    return res.status(500).json({
      success: false,
      message: "Withdrawal failed",
      error: err.error || err.message || "Unknown error"
    });
  }
};
