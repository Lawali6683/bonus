const { ethers } = require("ethers");
const admin = require("firebase-admin");

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const SERVICE_ACCOUNT = process.env.FIREBASE_DATABASE_SDK
  ? JSON.parse(process.env.FIREBASE_DATABASE_SDK)
  : null;

// An gyara an cire process.env.BSC_RPC
const BSC_RPC = "https://bsc-dataseed.binance.org/"; 

const ADMIN_PRIVATE_KEY = process.env.ADMIN_GAS_WALLET_PRIVATE_KEY;
const COMPANY_RECIPIENT_ADDRESS = process.env.COMPANY_RECIPIENT_ADDRESS;

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
    // Bincika idan akwai private key saboda aiki
    if (data.userWalletPrivateKey) {
        users.push({ uid: child.key, userCoinpayid: data.userCoinpayid || null, userWalletPrivateKey: data.userWalletPrivateKey, ...data });
    }
  });
  return users;
}

// Sabon aiki don binciko users masu matsalar gas
async function getGasIssueUsers() {
    const users = await getAllUsers();
    const gasIssues = [];
    const gasPrice = await provider.getGasPrice();

    for (const user of users) {
        try {
            const userWallet = new ethers.Wallet(user.userWalletPrivateKey, provider);
            const userAddress = userWallet.address;
            const userBnbBalance = await provider.getBalance(userAddress);
            let totalTokenValue = 0;
            let needsGas = false;

            for (const coinConfig of coins) {
                const contract = new ethers.Contract(coinConfig.contractAddress, BEP20_ABI, provider);
                const tokenBalance = await contract.balanceOf(userAddress);

                if (tokenBalance.gt(0)) {
                    totalTokenValue += parseFloat(ethers.utils.formatUnits(tokenBalance, coinConfig.decimals));
                    
                    // Ƙididdigar gas
                    const transferData = contract.interface.encodeFunctionData("transfer", [COMPANY_RECIPIENT_ADDRESS, tokenBalance]);
                    let gasLimit;
                    try {
                        gasLimit = await provider.estimateGas({
                            from: userAddress,
                            to: coinConfig.contractAddress,
                            data: transferData
                        });
                        gasLimit = gasLimit.mul(105).div(100); 
                    } catch (err) {
                        gasLimit = ethers.BigNumber.from(120000); 
                    }
                    const totalGasCost = gasPrice.mul(gasLimit);

                    if (userBnbBalance.lt(totalGasCost)) {
                        needsGas = true;
                        const gasNeeded = totalGasCost.sub(userBnbBalance);
                        gasIssues.push({
                            uid: user.uid,
                            userCoinpayid: user.userCoinpayid,
                            walletAddress: userAddress,
                            coin: coinConfig.coin,
                            tokenBalance: ethers.utils.formatUnits(tokenBalance, coinConfig.decimals),
                            bnbBalance: ethers.utils.formatEther(userBnbBalance),
                            gasNeeded: ethers.utils.formatEther(gasNeeded),
                            issue: "Low BNB (Gas Fee)",
                        });
                        // Ba sai mun bincika sauran coins ba idan har an ga matsala
                        break; 
                    }
                }
            }
        } catch (err) {
            console.error(`Error checking user ${user.uid}:`, err);
        }
    }

    return gasIssues;
}

module.exports = async function handler(req, res) {
  const key = req.headers["x-api-key"] || req.query.key;
  if (key !== "@haruna66") {
    return res.status(403).json({ error: "Invalid API Key" });
  }

  try {
    // Yanayin cire kudi ta hanyar webhook
    if (req.method === "POST" && req.body.action !== "getGasIssues") {
      const { uid, userCoinpayid, coin, amount } = req.body;
      
      if (!uid && !userCoinpayid) return res.status(400).json({ error: "uid or userCoinpayid required" });
      if (!coin || !amount) return res.status(400).json({ error: "coin and amount required" });

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

      const userWallet = new ethers.Wallet(userPrivateKey, provider);
      const userTokenAddress = userWallet.address; // Maimakon amfani da field, yi amfani da address na wallet da aka samu daga private key
      
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
      let gasTxHash = null;

      if (userBnbBalance.lt(totalGasCost)) {
        const gasToSend = totalGasCost.sub(userBnbBalance).add(ethers.utils.parseEther("0.00001"));
        
        const tx1 = await adminWallet.sendTransaction({
          to: userTokenAddress,
          value: gasToSend,
          gasPrice: gasPrice.mul(120).div(100) // Ƙara gas price kaɗan don tabbatar da shiga cikin sauri
        });
        gasTxHash = tx1.hash;
        await tx1.wait(1);
      }

      const userWalletWithContract = new ethers.Contract(
        coinConfig.contractAddress,
        BEP20_ABI,
        userWallet
      );
      
      const tx2 = await userWalletWithContract.transfer(COMPANY_RECIPIENT_ADDRESS, withdrawAmount, { gasPrice, gasLimit });
      await tx2.wait(1);

      return res.json({
        success: true,
        txHash: tx2.hash,
        gasTxHash: gasTxHash, // Nuna hash na gas idan an tura
        coin,
        amount: ethers.utils.formatUnits(withdrawAmount, coinConfig.decimals),
        to: COMPANY_RECIPIENT_ADDRESS
      });

    } 
    
    // Yanayin binciko users masu matsalar gas daga Admin Panel
    else if (req.method === "POST" && req.body.action === "getGasIssues") {
        const gasIssues = await getGasIssueUsers();
        return res.json({ success: true, gasIssues });
    }
    
    // Idan ba POST ba ko wani abu daban
    else {
        return res.status(405).json({ error: "Method not allowed or invalid action" });
    }
  } catch (err) {
    console.error("GasManage error:", err);
    // Bada bayanin kuskure a bayyane 
    return res.status(500).json({ error: err.message });
  }
};
