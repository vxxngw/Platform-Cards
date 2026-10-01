// Local demo helper: plays the Chainlink VRF node. Watches PackSale.OpenRequested and fulfills with a random word.
// npx hardhat node                                  (terminal 1)
// npx hardhat run scripts/deploy.js --network localhost && npx hardhat run scripts/seed.js --network localhost
// npx hardhat run scripts/local-fulfiller.js --network localhost   (terminal 2, keeps running)
const hre = require("hardhat");
const d = require(`../deployments.${hre.network.name}.json`);

async function main() {
  const { ethers } = hre;
  const packSale = await ethers.getContractAt("PackSale", d.PackSale);
  const mock = await ethers.getContractAt("VRFCoordinatorV2_5Mock", d.vrfCoordinator);
  console.log("fulfiller watching", d.PackSale);
  const done = new Set();
  setInterval(async () => {
    try {
      const logs = await packSale.queryFilter(packSale.filters.OpenRequested(), d.deployBlock);
      for (const l of logs) {
        const id = l.args.reqId;
        if (done.has(id.toString())) continue;
        done.add(id.toString());
        const req = await packSale.requests(id);
        if (req.randomReady || req.claimed) continue;
        const word = BigInt(ethers.hexlify(ethers.randomBytes(32)));
        await (await mock.fulfillRandomWordsWithOverride(id, d.PackSale, [word])).wait();
        console.log("fulfilled", id.toString());
      }
    } catch (e) { console.error(e.shortMessage || e.message); }
  }, 1500);
  await new Promise(() => {});
}
main();
