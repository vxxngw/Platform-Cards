const { ethers } = require("hardhat");

const RARITIES = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3];
const SUPPLIES = [10000, 10000, 10000, 10000, 10000, 3000, 3000, 3000, 800, 800, 100];
const PRICE = ethers.parseEther("0.01");

async function deployAll() {
  const [admin, alice, bob, carol] = await ethers.getSigners();
  const mock = await (await ethers.getContractFactory("VRFCoordinatorV2_5Mock")).deploy(ethers.parseEther("0.1"), 1e9, 4e15);
  const rc = await (await mock.createSubscription()).wait();
  const subId = rc.logs.map((l) => mock.interface.parseLog(l)).find((e) => e?.name === "SubscriptionCreated").args.subId;
  await mock.fundSubscription(subId, ethers.parseEther("1000000"));

  const collection = await (await ethers.getContractFactory("CardCollection")).deploy("ipfs://cid/");
  const packSale = await (await ethers.getContractFactory("PackSale")).deploy(await mock.getAddress(), await collection.getAddress(), subId, ethers.ZeroHash);
  const market = await (await ethers.getContractFactory("Marketplace")).deploy(await collection.getAddress());
  await mock.addConsumer(subId, await packSale.getAddress());
  await collection.grantRole(await collection.MINTER_ROLE(), await packSale.getAddress());
  return { admin, alice, bob, carol, mock, collection, packSale, market, subId };
}

async function seeded(opts = {}) {
  const f = await deployAll();
  await f.collection.createSet("Thần Thú Việt", RARITIES, opts.supplies || SUPPLIES, 50);
  await f.packSale.configurePack(1, PRICE, opts.packs ?? 1000, true);
  return f;
}

const parse = (f, rc, name) => rc.logs.map((l) => { try { return f.packSale.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === name);

/** buy + open + VRF fulfill (mock) + claim; returns drawn card ids and gas of each phase */
async function openWith(f, user, qty, word) {
  await f.packSale.connect(user).buyPacks(1, qty, { value: PRICE * BigInt(qty) });
  const rc = await (await f.packSale.connect(user).openPacks(1, qty)).wait();
  const reqId = parse(f, rc, "OpenRequested").args.reqId;
  const w = word ?? BigInt(ethers.hexlify(ethers.randomBytes(32)));
  const frc = await (await f.mock.fulfillRandomWordsWithOverride(reqId, await f.packSale.getAddress(), [w])).wait();
  const crc = await (await f.packSale.connect(user).claimPacks(reqId)).wait();
  const ev = parse(f, crc, "PackOpened");
  return { reqId, ids: ev ? ev.args.cardIds.map(Number) : [], gasUsed: crc.gasUsed, fulfillGas: frc.gasUsed };
}

/** buy + open only; returns reqId */
async function requestOpen(f, user, qty) {
  await f.packSale.connect(user).buyPacks(1, qty, { value: PRICE * BigInt(qty) });
  const rc = await (await f.packSale.connect(user).openPacks(1, qty)).wait();
  return parse(f, rc, "OpenRequested").args.reqId;
}

module.exports = { deployAll, seeded, openWith, requestOpen, RARITIES, SUPPLIES, PRICE };
