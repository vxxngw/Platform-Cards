// Creates a fresh VRF v2.5 subscription (owner = deployer), adds PackSale as consumer and points PackSale at it.
// Then fund it with LINK at https://vrf.chain.link/sepolia/<subId>
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, `../deployments.${hre.network.name}.json`);
const d = require(file);
(async () => {
  const { ethers } = hre;
  const [me] = await ethers.getSigners();
  const coord = new ethers.Contract(d.vrfCoordinator, ["function createSubscription() returns (uint256)", "function addConsumer(uint256,address)", "event SubscriptionCreated(uint256 indexed subId,address owner)"], me);
  const rc = await (await coord.createSubscription()).wait();
  const subId = rc.logs.map((l) => { try { return coord.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "SubscriptionCreated").args.subId;
  await (await coord.addConsumer(subId, d.PackSale)).wait();
  const ps = await ethers.getContractAt("PackSale", d.PackSale);
  await (await ps.setVrfConfig(subId, d.keyHash, 80000, 3)).wait();
  fs.writeFileSync(file, JSON.stringify({ ...d, subscriptionIdV1: d.subscriptionId, subscriptionId: subId.toString() }, null, 2));
  console.log("new subscription", subId.toString());
  console.log("fund it: https://vrf.chain.link/sepolia/" + subId.toString());
})().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
