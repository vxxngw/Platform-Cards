// Local faucet: sends ETH from dev account #9 (pre-funded in genesis) to any wallet, e.g. a MetaMask or Privy address.
//   npm run fund -- <address> [amountEth=100]
const { HDNodeWallet, JsonRpcProvider, formatEther, getAddress, parseEther } = require("ethers");
const C = require("../localnet/config");

async function main() {
  const [to, amount = "100"] = process.argv.slice(2);
  if (!to) throw new Error("usage: npm run fund -- <address> [amountEth]");
  const provider = new JsonRpcProvider(process.env.LOCALNET_RPC_URL || `http://127.0.0.1:${C.NODES[2].http}`);
  const faucet = HDNodeWallet.fromPhrase(C.DEV_MNEMONIC, undefined, "m/44'/60'/0'/0/9").connect(provider);
  const tx = await faucet.sendTransaction({ to: getAddress(to), value: parseEther(amount) });
  await tx.wait();
  console.log(`sent ${amount} ETH to ${getAddress(to)} (tx ${tx.hash}); balance now ${formatEther(await provider.getBalance(to))} ETH`);
}

main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
