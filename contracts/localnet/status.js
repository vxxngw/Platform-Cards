// Health check of the 2-node network: is each node up, on the right chain, peered, and do both share the same blocks?
//   node localnet/status.js
const C = require("./config");

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(3000),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

async function probe(id) {
  const url = `http://127.0.0.1:${C.NODES[id].http}`;
  try {
    const [chainId, height, peers, syncing] = await Promise.all([
      rpc(url, "eth_chainId"), rpc(url, "eth_blockNumber"), rpc(url, "net_peerCount"), rpc(url, "eth_syncing"),
    ]);
    const signers = id === 1 ? await rpc(url, "clique_getSigners").catch(() => null) : null;
    return { id, url, up: true, chainId: Number(chainId), height: Number(height), peers: Number(peers), syncing: syncing !== false, signers };
  } catch (e) {
    return { id, url, up: false, error: e.cause?.code || e.message };
  }
}

async function main() {
  const nodes = await Promise.all([probe(1), probe(2)]);
  for (const n of nodes) {
    const role = n.id === 1 ? "validator" : "RPC node ";
    if (!n.up) { console.log(`node ${n.id} ${role} ${n.url}  DOWN (${n.error})`); continue; }
    console.log(`node ${n.id} ${role} ${n.url}  chainId ${n.chainId}  block #${n.height}  peers ${n.peers}${n.syncing ? "  syncing…" : ""}` +
      (n.signers ? `  signers ${n.signers.join(", ")}` : ""));
  }

  const problems = [];
  for (const n of nodes) {
    if (!n.up) problems.push(`node ${n.id} is not running: npm run chain:node${n.id}`);
    else if (n.chainId !== C.CHAIN_ID) problems.push(`node ${n.id} answers chainId ${n.chainId}, expected ${C.CHAIN_ID} (another chain on port ${C.NODES[n.id].http}?)`);
    else if (n.peers === 0) problems.push(`node ${n.id} has no peers`);
  }
  const [a, b] = nodes;
  if (a.up && b.up && a.chainId === C.CHAIN_ID && b.chainId === C.CHAIN_ID) {
    // Same chain ⇔ same block hash at a height both nodes have.
    const h = "0x" + Math.min(a.height, b.height).toString(16);
    const [ba, bb] = await Promise.all([rpc(a.url, "eth_getBlockByNumber", [h, false]), rpc(b.url, "eth_getBlockByNumber", [h, false])]);
    if (ba.hash !== bb.hash) problems.push(`the nodes disagree at block ${Number(h)}: different chains (re-run chain:setup --reset?)`);
    else if (Math.abs(a.height - b.height) > 2) problems.push(`node 2 is ${a.height - b.height} blocks behind node 1`);
    else console.log(`\nBoth nodes share block #${Number(h)} ${ba.hash.slice(0, 18)}…`);
  }
  if (problems.length) {
    console.log("\nProblems:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  console.log("OK: one chain, two nodes in sync.");
}

main();
