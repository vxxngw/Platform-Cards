const { ethers } = require("hardhat");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

const RARITIES = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3];
const SUPPLIES = [10000, 10000, 10000, 10000, 10000, 3000, 3000, 3000, 800, 800, 100];
const PRICE = ethers.parseEther("0.01");

async function deployAll() {
  const [admin, alice, bob, carol] = await ethers.getSigners();
  const collection = await (await ethers.getContractFactory("CardCollection")).deploy("ipfs://cid/");
  const packSale = await (await ethers.getContractFactory("PackSale")).deploy(await collection.getAddress());
  const market = await (await ethers.getContractFactory("Marketplace")).deploy(await collection.getAddress());
  await collection.grantRole(await collection.MINTER_ROLE(), await packSale.getAddress());
  return { admin, alice, bob, carol, collection, packSale, market };
}

async function seeded(opts = {}) {
  const f = await deployAll();
  await f.collection.createSet("Thần Thú Việt", RARITIES, opts.supplies || SUPPLIES, 50);
  await f.packSale.configurePack(1, PRICE, opts.packs ?? 1000, true);
  return f;
}

const parse = (f, rc, name) => rc.logs.map((l) => { try { return f.packSale.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === name);

/** Same formula as PackSale: keccak256(abi.encode(secret, buyer)). */
const commitmentOf = (secret, buyer) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "address"], [secret, buyer]));
const randomSecret = () => ethers.hexlify(ethers.randomBytes(32));

/** buy + commit only; returns { reqId, secret, commitBlock } */
async function requestOpen(f, user, qty, secret = randomSecret()) {
  await f.packSale.connect(user).buyPacks(1, qty, { value: PRICE * BigInt(qty) });
  const rc = await (await f.packSale.connect(user).openPacks(1, qty, commitmentOf(secret, user.address))).wait();
  return { reqId: parse(f, rc, "OpenRequested").args.reqId, secret, commitBlock: rc.blockNumber };
}

/** reveal a request (Hardhat mines one block per tx, so one empty block is mined first to get past commitBlock + 1) */
async function reveal(f, req, by) {
  await mine(1);
  const rc = await (await f.packSale.connect(by).revealPacks(req.reqId, req.secret)).wait();
  const ev = parse(f, rc, "PackOpened");
  return { ids: ev ? ev.args.cardIds.map(Number) : [], seed: ev?.args.seed, gasUsed: rc.gasUsed };
}

/** buy + commit + reveal; returns drawn card ids, the seed and the gas of the reveal */
async function openWith(f, user, qty) {
  const req = await requestOpen(f, user, qty);
  return { reqId: req.reqId, ...(await reveal(f, req, user)) };
}

module.exports = { deployAll, seeded, openWith, requestOpen, reveal, commitmentOf, randomSecret, RARITIES, SUPPLIES, PRICE };
