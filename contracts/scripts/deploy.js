// npx hardhat run scripts/deploy.js --network localnet    (npm run deploy:local; also writes frontend/.env.local)
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Networks that outlive this script: point the frontend at them
const FRONTEND_ENV = ["localhost", "localnet"];

/** Sets `vars` in frontend/.env.local (Vite: overrides .env), keeping every other line the user has there. */
function writeFrontendEnv(vars) {
  const file = path.join(__dirname, "../../frontend/.env.local");
  const mark = "# written by contracts/scripts/deploy.js";
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const kept = lines.filter((l) => l !== mark && !Object.keys(vars).some((k) => l.startsWith(`${k}=`)));
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  const ours = [mark, ...Object.entries(vars).map(([k, v]) => `${k}=${v}`)];
  fs.writeFileSync(file, [...kept, ...(kept.length ? [""] : []), ...ours, ""].join("\n"));
  return file;
}

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const baseUri = process.env.BASE_URI || "https://example.com/api/metadata/";

  const collection = await (await ethers.getContractFactory("CardCollection")).deploy(baseUri);
  await collection.waitForDeployment();
  // Real chains mine in blocks: index events from the block that created CardCollection, not from the head.
  const deployBlock = (await collection.deploymentTransaction().wait()).blockNumber;
  // Packs open by commit-reveal inside PackSale: no oracle to deploy or fund.
  const packSale = await (await ethers.getContractFactory("PackSale")).deploy(await collection.getAddress());
  await packSale.waitForDeployment();
  const market = await (await ethers.getContractFactory("Marketplace")).deploy(await collection.getAddress());
  await market.waitForDeployment();

  await (await collection.grantRole(await collection.MINTER_ROLE(), await packSale.getAddress())).wait();

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployBlock,
    deployer: deployer.address,
    CardCollection: await collection.getAddress(),
    PackSale: await packSale.getAddress(),
    Marketplace: await market.getAddress(),
    baseUri,
  };
  fs.writeFileSync(path.join(__dirname, `../deployments.${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(out);

  if (FRONTEND_ENV.includes(network.name)) {
    const file = writeFrontendEnv({
      VITE_CHAIN_ID: out.chainId,
      VITE_RPC_URL: network.config.url,
      VITE_LOGS_RPC_URL: network.config.url, // overrides a leftover Sepolia logs endpoint in .env
      VITE_DEPLOY_BLOCK: deployBlock,
      VITE_ADMIN_ADDRESS: deployer.address,
      VITE_COLLECTION_ADDRESS: out.CardCollection,
      VITE_PACKSALE_ADDRESS: out.PackSale,
      VITE_MARKETPLACE_ADDRESS: out.Marketplace,
      // server side (/api/pin admin check)
      COLLECTION_ADDRESS: out.CardCollection,
      CHAIN_RPC_URL: network.config.url,
    });
    console.log(`\nFrontend configured: ${path.relative(process.cwd(), file)} (restart \`npm run dev\` to pick it up)`);
  }
  console.log(`Next: npx hardhat run scripts/seed.js --network ${network.name}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
