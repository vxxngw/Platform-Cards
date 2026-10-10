// Creates the local 2-node network: Clique signer key (node 1 keystore), node keys, genesis.json, `geth init` on both nodes.
//   node localnet/setup.js           idempotent: keeps an existing network
//   node localnet/setup.js --reset   wipes localnet/data and starts a brand-new chain (redeploy the contracts afterwards)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { HDNodeWallet, SigningKey, Wallet, parseEther } = require("ethers");
const C = require("./config");

function gethVersion() {
  let out;
  try {
    out = execFileSync(C.GETH, ["version"], { encoding: "utf8" });
  } catch {
    throw new Error(`geth not found ("${C.GETH}"). Install geth 1.13.x and put it on PATH, or set GETH_BIN.`);
  }
  const m = out.match(/Version:\s*(\d+)\.(\d+)\.(\d+)/);
  if (m && (Number(m[1]) > 1 || Number(m[2]) >= 14)) {
    console.warn(`WARNING: geth ${m[1]}.${m[2]}.${m[3]} — Clique block production was removed after 1.13; use geth 1.13.15.`);
  }
  return m ? `${m[1]}.${m[2]}.${m[3]}` : "unknown";
}

/** Ids of the nodes whose RPC port answers. */
async function runningNodes() {
  const probe = async (id) => {
    try {
      await fetch(`http://127.0.0.1:${C.NODES[id].http}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(1000),
      });
      return id;
    } catch { return null; }
  };
  return (await Promise.all([probe(1), probe(2)])).filter(Boolean);
}

const randomKey = () => "0x" + crypto.randomBytes(32).toString("hex");
const enodeOf = (key, port) => `enode://${new SigningKey(key).publicKey.slice(4)}@127.0.0.1:${port}`;

function writeNodeKey(node, key) {
  fs.mkdirSync(path.join(node.dir, "geth"), { recursive: true });
  fs.writeFileSync(path.join(node.dir, "geth", "nodekey"), key.slice(2));
}

function gethInit(node) {
  try {
    execFileSync(C.GETH, ["init", "--datadir", node.dir, C.GENESIS], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    throw new Error(`geth init failed for ${node.dir}:\n${e.stderr || e.message}`);
  }
}

async function main() {
  if (process.argv.includes("--reset")) {
    // Deleting the data of a running node would leave a half-deleted directory (Windows keeps geth's files locked).
    const running = await runningNodes();
    if (running.length) {
      const who = running.length > 1 ? "Nodes 1 and 2 are" : `Node ${running[0]} is`;
      throw new Error(`${who} still running: stop ${running.length > 1 ? "them" : "it"} (Ctrl+C in the terminal) before chain:reset.`);
    }
    fs.rmSync(C.DATA, { recursive: true, force: true });
  }
  if (fs.existsSync(C.INFO)) {
    const net = JSON.parse(fs.readFileSync(C.INFO, "utf8"));
    console.log(`Network already set up (chainId ${net.chainId}, signer ${net.signer}). Use --reset for a fresh chain.`);
    return;
  }
  const version = gethVersion();
  fs.mkdirSync(C.DATA, { recursive: true });

  // Clique signer: only node 1 has it (keystore + password file), and unlocks it to seal blocks.
  const password = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(C.PASSWORD_FILE, password);
  const signer = new Wallet(randomKey());
  const keystoreDir = path.join(C.NODES[1].dir, "keystore");
  fs.mkdirSync(keystoreDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/:/g, "-");
  fs.writeFileSync(path.join(keystoreDir, `UTC--${stamp}--${signer.address.slice(2).toLowerCase()}`), await signer.encrypt(password));

  // Fixed node keys, so each node knows the other's enode before either starts.
  const nodeKeys = { 1: randomKey(), 2: randomKey() };
  for (const id of [1, 2]) writeNodeKey(C.NODES[id], nodeKeys[id]);

  const dev = Array.from({ length: C.DEV_ACCOUNTS }, (_, i) =>
    HDNodeWallet.fromPhrase(C.DEV_MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`).address);
  const fund = (eth) => ({ balance: parseEther(eth).toString() });
  const genesis = {
    // Clique on geth does not support Shanghai/Cancun, so the EVM stops at London. Hardhat compiles with
    // evmVersion "paris" (no PUSH0), which runs unchanged here.
    config: {
      chainId: C.CHAIN_ID,
      homesteadBlock: 0, eip150Block: 0, eip155Block: 0, eip158Block: 0, byzantiumBlock: 0,
      constantinopleBlock: 0, petersburgBlock: 0, istanbulBlock: 0, berlinBlock: 0, londonBlock: 0,
      clique: { period: C.PERIOD, epoch: 30000 },
    },
    difficulty: "0x1",
    gasLimit: "0x1c9c380", // 30M
    // 32 bytes vanity + the signer list (just node 1) + 65 bytes for the seal
    extraData: "0x" + "00".repeat(32) + signer.address.slice(2).toLowerCase() + "00".repeat(65),
    alloc: Object.fromEntries([[signer.address, fund("100")], ...dev.map((a) => [a, fund("10000")])]),
  };
  fs.writeFileSync(C.GENESIS, JSON.stringify(genesis, null, 2));
  for (const id of [1, 2]) gethInit(C.NODES[id]);

  const net = {
    chainId: C.CHAIN_ID,
    period: C.PERIOD,
    geth: version,
    signer: signer.address,
    enode: { 1: enodeOf(nodeKeys[1], C.NODES[1].p2p), 2: enodeOf(nodeKeys[2], C.NODES[2].p2p) },
    rpc: { 1: `http://127.0.0.1:${C.NODES[1].http}`, 2: `http://127.0.0.1:${C.NODES[2].http}` },
    devAccounts: dev,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(C.INFO, JSON.stringify(net, null, 2));
  console.log(`Local network ready: chainId ${C.CHAIN_ID}, Clique signer ${signer.address}, block every ${C.PERIOD}s`);
  console.log(`Funded ${dev.length} dev accounts (10000 ETH each), deployer = ${dev[0]}`);
  console.log("Next: `npm run chain:node1` and `npm run chain:node2` in two terminals, then `npm run deploy:local`.");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
