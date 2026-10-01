// GAS=500000 npx hardhat run scripts/set-gas.js --network sepolia
const hre = require("hardhat");
const d = require(`../deployments.${hre.network.name}.json`);
(async () => {
  const ps = await hre.ethers.getContractAt("PackSale", d.PackSale);
  const gas = Number(process.env.GAS || 500000);
  await (await ps.setVrfConfig(d.subscriptionId, d.keyHash, gas, 3)).wait();
  console.log("callbackGasLimit =", (await ps.callbackGasLimit()).toString());
})().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
