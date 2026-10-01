// npx hardhat run scripts/deploy.js --network sepolia
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const SEPOLIA = {
  coordinator: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B",
  keyHash: "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae", // 500 gwei lane
};

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const baseUri = process.env.BASE_URI || "https://example.com/api/metadata/";
  let coordinator = process.env.VRF_COORDINATOR || SEPOLIA.coordinator;
  let subId = process.env.VRF_SUBSCRIPTION_ID || "0";
  const keyHash = process.env.VRF_KEY_HASH || SEPOLIA.keyHash;

  const isLocal = network.name === "hardhat" || network.name === "localhost";
  let mock;
  if (isLocal) {
    mock = await (await ethers.getContractFactory("VRFCoordinatorV2_5Mock")).deploy(ethers.parseEther("0.1"), 1e9, 4e15);
    await mock.waitForDeployment();
    coordinator = await mock.getAddress();
    const tx = await mock.createSubscription();
    const rc = await tx.wait();
    subId = rc.logs.map((l) => mock.interface.parseLog(l)).find((e) => e?.name === "SubscriptionCreated").args.subId.toString();
    await mock.fundSubscription(subId, ethers.parseEther("100"));
  }

  const collection = await (await ethers.getContractFactory("CardCollection")).deploy(baseUri);
  await collection.waitForDeployment();
  const packSale = await (await ethers.getContractFactory("PackSale")).deploy(coordinator, await collection.getAddress(), subId, keyHash);
  await packSale.waitForDeployment();
  const market = await (await ethers.getContractFactory("Marketplace")).deploy(await collection.getAddress());
  await market.waitForDeployment();

  await (await collection.grantRole(await collection.MINTER_ROLE(), await packSale.getAddress())).wait();
  if (isLocal) await (await mock.addConsumer(subId, await packSale.getAddress())).wait();

  const out = {
    network: network.name,
    deployBlock: await ethers.provider.getBlockNumber(),
    deployer: deployer.address,
    CardCollection: await collection.getAddress(),
    PackSale: await packSale.getAddress(),
    Marketplace: await market.getAddress(),
    vrfCoordinator: coordinator,
    subscriptionId: subId,
    keyHash,
    baseUri,
  };
  fs.writeFileSync(path.join(__dirname, `../deployments.${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(out);
  console.log("\nNext: add PackSale as consumer of the VRF subscription, then run scripts/seed.js");
  console.log(`Verify: npx hardhat verify --network ${network.name} ${out.CardCollection} "${baseUri}"`);
}
main().catch((e) => { console.error(e); process.exit(1); });
