// Starts one node of the local network and keeps it running (Ctrl+C stops it). Run `npm run chain:setup` once before.
//   node localnet/node.js 1   validator: seals blocks; RPC http://127.0.0.1:8545 without CORS (not meant for browsers)
//   node localnet/node.js 2   RPC node: syncs from node 1; RPC http://127.0.0.1:8546 for the dApp, MetaMask and Hardhat
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const C = require("./config");

const id = process.argv[2];
const node = C.NODES[id];
if (!node) {
  console.error("usage: node localnet/node.js <1|2>");
  process.exit(1);
}
if (!fs.existsSync(C.INFO)) {
  console.error("The local network does not exist yet: run `npm run chain:setup` first.");
  process.exit(1);
}
const net = JSON.parse(fs.readFileSync(C.INFO, "utf8"));
const other = id === "1" ? "2" : "1";

// The other node is a static peer: geth dials it right away and keeps redialing, instead of waiting for discovery (~1 min).
const peerConfig = path.join(node.dir, "peers.toml");
fs.writeFileSync(peerConfig, `[Node.P2P]\nStaticNodes = ["${net.enode[other]}"]\n`);

const args = [
  "--config", peerConfig,
  "--datadir", node.dir,
  "--networkid", String(C.CHAIN_ID),
  "--syncmode", "full",
  // Write every block's state to disk at once: killing a node (closing its window) never rewinds the chain. Cheap here.
  "--gcmode", "archive",
  "--port", String(node.p2p),
  "--authrpc.port", String(node.authrpc),
  // On Windows every geth defaults to \\.\pipe\geth.ipc, so two nodes on one machine would collide.
  "--ipcpath", `geth-node${id}.ipc`,
  // Private network on localhost: no discovery (so no public bootnodes), no NAT mapping, peers from 127.0.0.0/8 only.
  "--nodiscover", "--nat", "none", "--netrestrict", "127.0.0.0/8",
  "--http", "--http.addr", "127.0.0.1", "--http.port", String(node.http),
];

if (id === "1") {
  args.push(
    "--http.api", "eth,net,web3,clique",
    "--mine", "--miner.etherbase", net.signer,
    "--unlock", net.signer, "--password", C.PASSWORD_FILE,
    // Required by geth when HTTP is on. HTTP is bound to 127.0.0.1 without CORS, so web pages cannot reach the signer.
    "--allow-insecure-unlock",
  );
} else {
  // No keys on this node, so it is safe to open it to the browser (the Vite app on localhost:5173, Privy, MetaMask).
  args.push("--http.api", "eth,net,web3,txpool", "--http.corsdomain", "*");
}

console.log(`node ${id} (${id === "1" ? "validator" : "RPC"}) → ${net.rpc[id]} · chainId ${C.CHAIN_ID}`);
const child = spawn(C.GETH, args, { stdio: "inherit" });
child.on("error", (e) => { console.error(`cannot start geth: ${e.message}`); process.exit(1); });
child.on("exit", (code) => process.exit(code ?? 0));
