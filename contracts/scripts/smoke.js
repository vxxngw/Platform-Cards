// Live smoke test: buy 1 pack, open it, wait for Chainlink VRF to fulfill, print the cards.
// npx hardhat run scripts/smoke.js --network sepolia
const hre = require("hardhat");
const d = require(`../deployments.${hre.network.name}.json`);
(async () => {
  const { ethers } = hre;
  const [me] = await ethers.getSigners();
  const ps = await ethers.getContractAt("PackSale", d.PackSale);
  const col = await ethers.getContractAt("CardCollection", d.CardCollection);
  const setId = 1;
  const price = (await ps.packConfigs(setId))[1];
  if ((await ps.unopened(me.address, setId)) === 0n) {
    const tx = await ps.buyPacks(setId, 1, { value: price }); await tx.wait();
    console.log("bought 1 pack", tx.hash);
  }
  const tx = await ps.openPacks(setId, 1); const rc = await tx.wait();
  const reqId = rc.logs.map((l) => { try { return ps.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "OpenRequested").args.reqId;
  console.log("openPacks", tx.hash, "reqId", reqId.toString());
  const t0 = Date.now();
  const waitMin = Number(process.env.WAIT_MIN || 4);
  while (Date.now() - t0 < waitMin * 60_000) {
    await new Promise((r) => setTimeout(r, 6000));
    if ((await ps.requests(reqId)).randomReady) {
      console.log(`randomness ready after ${Math.round((Date.now() - t0) / 1000)}s -> claiming`);
      const ctx = await ps.claimPacks(reqId); const crc = await ctx.wait();
      const ev = crc.logs.map((l) => { try { return ps.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "PackOpened");
      const info = await Promise.all(ev.args.cardIds.map(async (id) => `#${id}:${["Common", "Rare", "Epic", "Legendary"][(await col.cards(id))[1]]}`));
      console.log("cards:", info.join(" "), "| claim tx", ctx.hash, "gas", crc.gasUsed.toString());
      return;
    }
  }
  console.log(`randomness NOT ready within ${waitMin} min`);
})().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
