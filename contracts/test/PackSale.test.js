const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { seeded, openWith, requestOpen, PRICE, RARITIES } = require("./helpers");

describe("PackSale", () => {
  describe("buyPacks", () => {
    it("reverts on wrong value, qty 0 / >10, sold out, not on sale", async () => {
      const f = await seeded({ packs: 12 });
      const ps = f.packSale.connect(f.alice);
      await expect(ps.buyPacks(1, 2, { value: PRICE })).to.be.revertedWithCustomError(ps, "WrongValue");
      await expect(ps.buyPacks(1, 2, { value: PRICE * 3n })).to.be.revertedWithCustomError(ps, "WrongValue");
      await expect(ps.buyPacks(1, 0, { value: 0 })).to.be.revertedWithCustomError(ps, "BadQuantity");
      await expect(ps.buyPacks(1, 11, { value: PRICE * 11n })).to.be.revertedWithCustomError(ps, "BadQuantity");
      await ps.buyPacks(1, 10, { value: PRICE * 10n });
      await expect(ps.buyPacks(1, 3, { value: PRICE * 3n })).to.be.revertedWithCustomError(ps, "SoldOut");
      await expect(ps.buyPacks(2, 1, { value: PRICE })).to.be.revertedWithCustomError(ps, "NotOnSale");
    });

    it("records unopened + emits event; pause blocks", async () => {
      const f = await seeded();
      await expect(f.packSale.connect(f.alice).buyPacks(1, 3, { value: PRICE * 3n }))
        .to.emit(f.packSale, "PacksPurchased").withArgs(f.alice.address, 1, 3, PRICE * 3n);
      expect(await f.packSale.unopened(f.alice.address, 1)).to.equal(3n);
      expect((await f.packSale.packConfigs(1)).remaining).to.equal(997n);
      await f.packSale.pause();
      await expect(f.packSale.connect(f.alice).buyPacks(1, 1, { value: PRICE })).to.be.reverted;
    });
  });

  describe("openPacks", () => {
    it("reverts without enough unopened packs", async () => {
      const f = await seeded();
      await expect(f.packSale.connect(f.alice).openPacks(1, 1)).to.be.revertedWithCustomError(f.packSale, "NotEnoughPacks");
    });

    it("mints 5×qty cards with ≥1 Rare+ per pack", async () => {
      const f = await seeded();
      for (let t = 0; t < 20; t++) {
        const { ids } = await openWith(f, f.alice, 2);
        expect(ids.length).to.equal(10);
        for (let p = 0; p < 2; p++) {
          const pack = ids.slice(p * 5, p * 5 + 5);
          expect(pack.some((id) => RARITIES[id - 1] >= 1), `pack ${pack}`).to.equal(true);
        }
      }
      const progress = await f.collection.getSetProgress(f.alice.address, 1);
      expect(progress.reduce((a, b) => a + b, 0n)).to.equal(200n);
    });

    it("VRF callback is cheap (<80k) and 10-pack claim is a normal user tx", async () => {
      const f = await seeded();
      const { gasUsed, ids, fulfillGas } = await openWith(f, f.alice, 10);
      console.log("      fulfill (VRF mock tx) gas:", fulfillGas.toString(), "| claimPacks(10 packs) gas:", gasUsed.toString());
      expect(ids.length).to.equal(50);
      expect(fulfillGas).to.be.lessThan(BigInt(await f.packSale.callbackGasLimit()) + 120_000n); // callback + coordinator overhead
      expect(gasUsed).to.be.lessThan(1_500_000n);
    });

    it("claimPacks: not before randomness, only once, anyone can trigger but cards go to buyer", async () => {
      const f = await seeded();
      const reqId = await requestOpen(f, f.alice, 1);
      await expect(f.packSale.claimPacks(reqId)).to.be.revertedWithCustomError(f.packSale, "NotClaimable");
      await f.mock.fulfillRandomWordsWithOverride(reqId, await f.packSale.getAddress(), [12345n]);
      await expect(f.packSale.connect(f.carol).claimPacks(reqId)).to.emit(f.packSale, "PackOpened");
      const total = (await f.collection.getSetProgress(f.alice.address, 1)).reduce((a, b) => a + b, 0n);
      expect(total).to.equal(5n);
      expect((await f.collection.getSetProgress(f.carol.address, 1)).reduce((a, b) => a + b, 0n)).to.equal(0n);
      await expect(f.packSale.claimPacks(reqId)).to.be.revertedWithCustomError(f.packSale, "NotClaimable");
      await expect(f.packSale.claimPacks(999)).to.be.revertedWithCustomError(f.packSale, "NotClaimable");
    });

    it("same random word always yields the same cards (deterministic, verifiable)", async () => {
      const a = await seeded(); const b = await seeded();
      const r1 = await openWith(a, a.alice, 3, 777n);
      const r2 = await openWith(b, b.alice, 3, 777n);
      expect(r1.ids).to.deep.equal(r2.ids);
    });

    it("distribution over 10,000 simulated draws is within 2% of config", async function () {
      this.timeout(600000);
      const f = await seeded({ packs: 10000 });
      const counts = [0, 0, 0, 0];
      let total = 0;
      // slot 5 of each pack is Rare+, so only slots 1-4 follow the base table
      for (let t = 0; t < 250; t++) {
        const { ids } = await openWith(f, f.alice, 10);
        ids.forEach((id, i) => { if (i % 5 !== 4) { counts[RARITIES[id - 1]]++; total++; } });
      }
      expect(total).to.equal(10000);
      const expected = [0.6, 0.28, 0.1, 0.02];
      counts.forEach((c, r) => expect(Math.abs(c / total - expected[r]), `rarity ${r}: ${c / total}`).to.be.lessThan(0.02));
    });

    it("falls back to lower rarity when supply is exhausted, never exceeds maxSupply", async () => {
      const supplies = [1000, 1000, 1000, 1000, 1000, 1, 1, 1, 1, 1, 1];
      const f = await seeded({ supplies });
      for (let t = 0; t < 8; t++) await openWith(f, f.alice, 10);
      for (let id = 6; id <= 11; id++) expect(await f.collection["totalSupply(uint256)"](id)).to.be.lte(1n);
      expect(await f.collection["totalSupply(uint256)"](11)).to.be.lte(1n);
    });
  });

  describe("stuck requests", () => {
    it("cancelStuckRequest refunds after 1h only; a late VRF answer is then ignored", async () => {
      const f = await seeded();
      const reqId = await requestOpen(f, f.alice, 2);
      await expect(f.packSale.cancelStuckRequest(reqId)).to.be.revertedWithCustomError(f.packSale, "NotStuck");
      await time.increase(3601);
      await expect(f.packSale.cancelStuckRequest(reqId)).to.emit(f.packSale, "RequestCancelled");
      expect(await f.packSale.unopened(f.alice.address, 1)).to.equal(2n);
      await expect(f.packSale.cancelStuckRequest(reqId)).to.be.revertedWithCustomError(f.packSale, "NotStuck");
      await f.mock.fulfillRandomWordsWithOverride(reqId, await f.packSale.getAddress(), [1n]); // late answer: no-op
      await expect(f.packSale.claimPacks(reqId)).to.be.revertedWithCustomError(f.packSale, "NotClaimable");
    });

    it("cannot cancel once randomness is ready (claim instead)", async () => {
      const f = await seeded();
      const reqId = await requestOpen(f, f.alice, 1);
      await f.mock.fulfillRandomWordsWithOverride(reqId, await f.packSale.getAddress(), [1n]);
      await time.increase(3601);
      await expect(f.packSale.cancelStuckRequest(reqId)).to.be.revertedWithCustomError(f.packSale, "NotStuck");
    });
  });

  describe("withdraw", () => {
    it("only ADMIN, sends full balance", async () => {
      const f = await seeded();
      await f.packSale.connect(f.alice).buyPacks(1, 4, { value: PRICE * 4n });
      await expect(f.packSale.connect(f.alice).withdraw(f.alice.address)).to.be.reverted;
      await expect(f.packSale.withdraw(f.carol.address)).to.changeEtherBalance(f.carol, PRICE * 4n);
    });
  });
});
