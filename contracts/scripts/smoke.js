// Live smoke test of the commit-reveal opening: buy 1 pack, commit, wait for the anchor block, reveal, print the cards.
// npx hardhat run scripts/smoke.js --network localnet
const hre = require("hardhat");
const d = require(`../deployments.${hre.network.name}.json`);
(async () => {
  const { ethers } = hre;
  const [me] = await ethers.getSigners();
  const ps = await ethers.getContractAt("PackSale", d.PackSale);
  const col = await ethers.getContractAt("CardCollection", d.CardCollection);
  const parse = (rc, name) => rc.logs.map((l) => { try { return ps.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === name);
  const setId = 1;
  const price = (await ps.packConfigs(setId))[1];
  if ((await ps.unopened(me.address, setId)) === 0n) {
    const tx = await ps.buyPacks(setId, 1, { value: price }); await tx.wait();
    console.log("bought 1 pack", tx.hash);
  }
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "address"], [secret, me.address]));
  const rc = await (await ps.openPacks(setId, 1, commitment)).wait();
  const reqId = parse(rc, "OpenRequested").args.reqId;
  console.log(`commit: reqId ${reqId} in block ${rc.blockNumber}`);
  // the reveal must land after commitBlock + 1, whose hash goes into the seed
  while ((await ethers.provider.getBlockNumber()) < rc.blockNumber + 2) await new Promise((r) => setTimeout(r, 500));
  const rtx = await ps.revealPacks(reqId, secret); const rrc = await rtx.wait();
  const ev = parse(rrc, "PackOpened");
  const info = await Promise.all(ev.args.cardIds.map(async (id) => `#${id}:${["Common", "Rare", "Epic", "Legendary"][(await col.cards(id))[1]]}`));
  console.log(`reveal in block ${rrc.blockNumber}: ${info.join(" ")} | seed ${ev.args.seed} | gas ${rrc.gasUsed}`);
})().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
