// Fallback seed (spec v2 §3): creates a demo Pokémon set + pack config WITHOUT the Pack Builder / TCGdex, for when TCGdex is down.
//   npx hardhat run scripts/seed-pokemon.js --network sepolia          create the set, write metadata/<id>.json
//   CHECK=1 node scripts/seed-pokemon.js                               only diff the snapshot below against live TCGdex (no chain)
// The card list is a static snapshot of "Pokémon 151" (TCGdex set `sv03.5`), so nothing here calls the network except CHECK.
// Tiers are assigned by hand: the demo needs 2 Epic cards, which this set only has as Special illustration rares.
// The metadata JSON mirrors frontend/src/lib/pokemon/metadata.ts (buildCardMetadata) — keep the two in sync.
const fs = require("fs");
const path = require("path");

const LANG = "en";
const SERIE = "sv";
const SET = { id: "sv03.5", name: "151" };
const IMG = `https://assets.tcgdex.net/${LANG}/${SERIE}/${SET.id}`;
const DESCRIPTION = "Academic digital replica of a Pokémon TCG card. Not affiliated with Nintendo or The Pokémon Company.";
const TIERS = ["Common", "Rare", "Epic", "Legendary"];

// [localId, name, tier, official rarity (null = not confirmed against TCGdex yet; CHECK=1 reports it), maxSupply]
const POOL = [
  ["001", "Bulbasaur", 0, "Common", 10000],
  ["004", "Charmander", 0, "Common", 10000],
  ["007", "Squirtle", 0, "Common", 10000],
  ["016", "Pidgey", 0, "Common", 10000],
  ["025", "Pikachu", 0, "Common", 10000],
  ["003", "Venusaur ex", 1, "Double rare", 3000],
  ["006", "Charizard ex", 1, "Double rare", 3000],
  ["009", "Blastoise ex", 1, "Double rare", 3000],
  ["198", "Venusaur ex", 2, null, 800],
  ["200", "Blastoise ex", 2, "Special illustration rare", 800],
  ["199", "Charizard ex", 3, "Special illustration rare", 100],
];
const REWARD = ["151", "Mew ex", "Double rare", 50];

const meta = (localId, name, rarity, tier) => ({
  name,
  description: tier === "Reward" ? `${DESCRIPTION} Reward card, obtainable only by burning a complete set.` : DESCRIPTION,
  image: `${IMG}/${localId}/high.webp`,
  attributes: [
    { trait_type: "Set", value: SET.name },
    { trait_type: "Card No.", value: localId },
    ...(rarity ? [{ trait_type: "Official Rarity", value: rarity }] : []),
    { trait_type: "Tier", value: tier },
  ],
  source: "tcgdex",
  tcgdexId: `${SET.id}-${localId}`,
  lang: LANG,
  priceRef: { set_name: SET.name, item_no: localId, variation: "", language: LANG, card_name: name },
});

async function check() {
  let bad = 0;
  for (const [localId, name, , rarity] of [...POOL, [REWARD[0], REWARD[1], 3, REWARD[2]]]) {
    const r = await fetch(`https://api.tcgdex.net/v2/${LANG}/cards/${SET.id}-${localId}`);
    if (!r.ok) { console.log(`✗ ${SET.id}-${localId}: HTTP ${r.status}`); bad++; continue; }
    const c = await r.json();
    const sameName = c.name.toLowerCase() === name.toLowerCase();
    const sameRarity = !rarity || (c.rarity || "").toLowerCase() === rarity.toLowerCase();
    console.log(`${sameName && sameRarity ? "✓" : "✗"} ${c.id}  ${c.name} · ${c.rarity ?? "—"}${sameName ? "" : `   (snapshot: ${name})`}${sameRarity ? "" : `   (snapshot: ${rarity})`}`);
    if (!sameName || !sameRarity) bad++;
  }
  console.log(bad ? `${bad} card(s) differ — fix POOL above before seeding` : "snapshot matches TCGdex");
  process.exit(bad ? 1 : 0);
}

async function main() {
  const hre = require("hardhat");
  const d = require(`../deployments.${hre.network.name}.json`);
  const { ethers } = hre;
  const collection = await ethers.getContractAt("CardCollection", d.CardCollection);
  const packSale = await ethers.getContractAt("PackSale", d.PackSale);
  const firstCardId = Number(await collection.nextCardId());
  const name = `Pokémon ${SET.name}`;

  // idempotent like seed.js: a re-run after a partial failure must not create a duplicate set
  let setId = Number(await collection.nextSetId()) - 1;
  const exists = setId >= 1 && (await collection.getSet(setId)).name === name;
  if (!exists) {
    await (await collection.createSet(name, POOL.map((c) => c[2]), POOL.map((c) => c[4]), REWARD[3])).wait();
    setId = Number(await collection.nextSetId()) - 1;
  }
  const first = exists ? Number((await collection.getSet(setId)).cardIds[0]) : firstCardId;

  // One base URI serves every token, so the folder also needs a JSON for every older id (filler, as the Pack Builder does).
  const out = path.join(__dirname, "..", "metadata");
  fs.mkdirSync(out, { recursive: true });
  const write = (id, json) => fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(json, null, 2));
  for (let id = 1; id < first; id++) if (!fs.existsSync(path.join(out, `${id}.json`))) write(id, { name: `Card #${id}`, description: DESCRIPTION, attributes: [], source: "custom" });
  POOL.forEach(([localId, n, tier, rarity], i) => write(first + i, meta(localId, n, rarity, TIERS[tier])));
  write(first + POOL.length, meta(REWARD[0], REWARD[1], REWARD[2], "Reward"));

  const cfg = await packSale.packConfigs(setId);
  if (!cfg[3]) await (await packSale.configurePack(setId, ethers.parseEther("0.01"), 1000, true)).wait();
  console.log(`Set #${setId} "${name}" ready (cards ${first}–${first + POOL.length}), pack 0.01 ETH x 1000`);
  console.log(`Metadata written to ${out}/ — pin it (Pinata) then collection.setBaseURI("ipfs://<CID>/"), or POST it via /api/pin.`);
}

(process.env.CHECK ? check() : main()).catch((e) => { console.error(e); process.exit(1); });
