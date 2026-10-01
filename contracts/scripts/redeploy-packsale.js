// Replaces PackSale (keeps CardCollection + Marketplace): new deploy, role/consumer migration, old revenue withdrawn.
// npx hardhat run scripts/redeploy-packsale.js --network sepolia
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, `../deployments.${hre.network.name}.json`);
const d = require(file);

(async () => {
  const { ethers } = hre;
  const [me] = await ethers.getSigners();
  const collection = await ethers.getContractAt("CardCollection", d.CardCollection);
  const old = await ethers.getContractAt("PackSale", d.PackSale);
  const coord = new ethers.Contract(d.vrfCoordinator, ["function addConsumer(uint256,address)", "function removeConsumer(uint256,address)"], me);

  const fresh = await (await ethers.getContractFactory("PackSale")).deploy(d.vrfCoordinator, d.CardCollection, d.subscriptionId, d.keyHash);
  await fresh.waitForDeployment();
  const addr = await fresh.getAddress();
  console.log("new PackSale", addr, "at block", await ethers.provider.getBlockNumber());

  const minter = await collection.MINTER_ROLE();
  await (await collection.grantRole(minter, addr)).wait();
  await (await collection.revokeRole(minter, d.PackSale)).wait();
  await (await coord.addConsumer(d.subscriptionId, addr)).wait();
  try { await (await coord.removeConsumer(d.subscriptionId, d.PackSale)).wait(); } catch (e) { console.log("removeConsumer skipped:", e.shortMessage || e.message); }
  const bal = await ethers.provider.getBalance(d.PackSale);
  if (bal > 0n) await (await old.withdraw(me.address)).wait();
  console.log("withdrew", ethers.formatEther(bal), "ETH from old PackSale");

  const cfg = await old.packConfigs(1);
  await (await fresh.configurePack(1, ethers.parseEther("0.01"), cfg[2], true)).wait();
  console.log("configured set 1 on new PackSale: 0.01 ETH x", cfg[2].toString());

  const next = { ...d, PackSaleV1: d.PackSale, PackSale: addr, packSaleDeployBlock: await ethers.provider.getBlockNumber() };
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  console.log("updated", path.basename(file), "- verify with:");
  console.log(`npx hardhat verify --network ${hre.network.name} ${addr} ${d.vrfCoordinator} ${d.CardCollection} ${d.subscriptionId} ${d.keyHash}`);
})().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
