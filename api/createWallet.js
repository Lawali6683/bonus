
const ethers = require("ethers");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { userCoinpayid } = req.body;

  if (!userCoinpayid) {
    return res.status(400).json({ error: "Missing userCoinpayid" });
  }

  try {
    // Create one wallet
    const wallet = ethers.Wallet.createRandom();
    const privateKey = wallet.privateKey;
    const address = wallet.address;

    const networks = [
      { coin: "BNB", field: "bnbBep20Address", networkId: "56" },
      { coin: "USDT", field: "usdtBep20Address", networkId: "56" },
      { coin: "USDC", field: "usdcBep20Address", networkId: "56" },
      { coin: "TRX", field: "trxBep20Address", networkId: "56" },
    ];

    const response = {
      userCoinpayid,
      userWalletPrivateKey: privateKey,
      userBnBWalletAddress: address,
    };

    networks.forEach(({ field }) => {
      response[field] = address; // All use same BNB address on BEP20
    });

    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ error: "Failed to generate wallet", details: err.message });
  }
};
