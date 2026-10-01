// Adds PackSale as a consumer of the VRF v2.5 subscription (must be run by the subscription owner).
const hre = require("hardhat");
const d = require(`../deployments.${hre.network.name}.json`);
(async () => {
  const coord = new hre.ethers.Contract(d.vrfCoordinator, ["function addConsumer(uint256 subId,address consumer)"], (await hre.ethers.getSigners())[0]);
  await (await coord.addConsumer(d.subscriptionId, d.PackSale)).wait();
  console.log("PackSale added as VRF consumer");
})().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
