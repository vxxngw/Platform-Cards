// Statistical check of PackSale's draw (spec §11): `OUT=sim.json npx hardhat run scripts/sim-distribution.js`
//   A) uncapped supplies: pure algorithm, 10,000 base slots (slots 1-4 of 2,500 packs) + 2,500 Rare+ slots (slot 5)
//   B) default maxSupply (10,000 / 3,000 / 800 / 100): how supply caps push draws down to lower tiers
const fs = require("fs");
const { ethers } = require("hardhat");
const { seeded, openWith, RARITIES } = require("../test/helpers");

const TIERS = ["Common", "Rare", "Epic", "Legendary"];

async function runScenario({ supplies, packs, label, bucketPacks }) {
  const f = await seeded({ supplies, packs });
  const base = [0, 0, 0, 0];      // slots 1-4
  const slot5 = [0, 0, 0, 0];     // slot 5 (Rare+ table)
  const perCard = Array(11).fill(0);
  const buckets = [];             // tier counts per bucket of `bucketPacks` packs (all 5 slots)
  let bucket = [0, 0, 0, 0];
  let packsDone = 0;
  const exhaustedAt = {};
  while (packsDone < packs) {
    const qty = Math.min(10, packs - packsDone);
    const { ids } = await openWith(f, f.alice, qty);
    ids.forEach((id, i) => {
      const t = RARITIES[id - 1];
      perCard[id - 1]++;
      (i % 5 === 4 ? slot5 : base)[t]++;
      bucket[t]++;
    });
    packsDone += qty;
    for (let id = 1; id <= 11; id++) {
      if (exhaustedAt[id] == null && perCard[id - 1] >= supplies[id - 1]) exhaustedAt[id] = packsDone;
    }
    if (bucketPacks && packsDone % bucketPacks === 0) { buckets.push(bucket); bucket = [0, 0, 0, 0]; }
  }
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  console.log(`${label}: ${packsDone} packs | base slots ${base.join("/")} | slot5 ${slot5.join("/")}`);
  return { label, packs: packsDone, base, slot5, perCard, buckets, bucketPacks, exhaustedAt, baseShare: base.map((c) => c / sum(base)), slot5Share: slot5.map((c) => c / Math.max(1, sum(slot5))) };
}

(async () => {
  const BIG = 1_000_000_000;
  const out = { tiers: TIERS, rarities: RARITIES };
  out.uncapped = await runScenario({ supplies: Array(11).fill(BIG), packs: 2500, label: "uncapped" });
  out.capped = await runScenario({ supplies: [10000, 10000, 10000, 10000, 10000, 3000, 3000, 3000, 800, 800, 100], packs: 2500, label: "capped", bucketPacks: 250 });
  fs.writeFileSync(process.env.OUT || "sim-distribution.json", JSON.stringify(out, null, 1));
  console.log("wrote", process.env.OUT || "sim-distribution.json");
})();
