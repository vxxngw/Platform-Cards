// Seeds one sample set + pack config using deployments.<network>.json
const hre = require("hardhat");
const d = require(`../deployments.${hre.network.name}.json`);

async function main() {
  const { ethers } = hre;
  const collection = await ethers.getContractAt("CardCollection", d.CardCollection);
  const packSale = await ethers.getContractAt("PackSale", d.PackSale);
  // 11 cards: 5 Common, 3 Rare, 2 Epic, 1 Legendary (spec §2)
  const rarities = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3];
  const supplies = [10000, 10000, 10000, 10000, 10000, 3000, 3000, 3000, 800, 800, 100];
  // idempotent: re-running after a partial failure must not create a duplicate set
  let setId = Number(await collection.nextSetId()) - 1;
  if (setId < 1) {
    await (await collection.createSet("Mythic Beasts", rarities, supplies, 50)).wait();
    setId = Number(await collection.nextSetId()) - 1;
  }
  const cfg = await packSale.packConfigs(setId);
  if (!cfg[3]) await (await packSale.configurePack(setId, ethers.parseEther("0.01"), 1000, true)).wait();
  console.log(`Set #${setId} ready, pack config 0.01 ETH x 1000`);
}
main().catch((e) => { console.error(e); process.exit(1); });
