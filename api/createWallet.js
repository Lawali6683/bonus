const ethers = require("ethers");
const crypto = require("crypto");

const coins = [
  { coin: "BNB", field: "bnbBep20Address", networkId: "56" },
  { coin: "USDT", field: "usdtBep20Address", networkId: "56" },
  { coin: "USDC", field: "usdcBep20Address", networkId: "56" },
  { coin: "TRX", field: "trxBep20Address", networkId: "56" },
];


function generateBSCWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const { userCoinpayid } = req.body;
    if (!userCoinpayid) {
      return res.status(400).json({ error: "Missing userCoinpayid" });
    }
    
    const mainWallet = generateBSCWallet();
   
    const response = {
      userCoinpayid,
      network: "BSC",
      userWalletPrivateKey: mainWallet.privateKey,
      userBnbWalletAddress: mainWallet.address,
    };

    
    coins.forEach(({ field }) => {
      response[field] = mainWallet.address;
    });

  
    return res.status(200).json(response);
  } catch (e) {
    console.error("[createWallet.js] Error:", e);
    return res.status(500).json({ error: "Wallet generation failed", details: e.message });
  }
};
