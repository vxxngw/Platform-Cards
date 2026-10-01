const { expect } = require("chai");
const { deployAll, seeded, RARITIES, SUPPLIES } = require("./helpers");

describe("CardCollection", () => {
  it("createSet only ADMIN; creates sequential cards + reward", async () => {
    const f = await deployAll();
    await expect(f.collection.connect(f.alice).createSet("x", RARITIES, SUPPLIES, 50)).to.be.reverted;
    await expect(f.collection.createSet("Set", RARITIES, SUPPLIES, 50)).to.emit(f.collection, "SetCreated");
    const [name, ids, reward, active] = await f.collection.getSet(1);
    expect(name).to.equal("Set");
    expect(ids.map(Number)).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(reward).to.equal(12n);
    expect(active).to.equal(true);
    expect((await f.collection.cards(12))[3]).to.equal(true); // isReward
  });

  it("rejects bad set size / length mismatch", async () => {
    const f = await deployAll();
    await expect(f.collection.createSet("x", [0, 1], [1, 1], 1)).to.be.revertedWithCustomError(f.collection, "InvalidSetSize");
    await expect(f.collection.createSet("x", RARITIES, SUPPLIES.slice(1), 1)).to.be.revertedWithCustomError(f.collection, "LengthMismatch");
  });

  it("only MINTER mints, never above maxSupply, never reward", async () => {
    const f = await seeded();
    await expect(f.collection.connect(f.alice).mintCards(f.alice.address, [1], [1])).to.be.reverted;
    await f.collection.grantRole(await f.collection.MINTER_ROLE(), f.admin.address);
    await expect(f.collection.mintCards(f.alice.address, [11], [101])).to.be.revertedWithCustomError(f.collection, "MaxSupplyExceeded");
    await f.collection.mintCards(f.alice.address, [11], [100]);
    await expect(f.collection.mintCards(f.alice.address, [11], [1])).to.be.revertedWithCustomError(f.collection, "MaxSupplyExceeded");
    await expect(f.collection.mintCards(f.alice.address, [12], [1])).to.be.revertedWithCustomError(f.collection, "MaxSupplyExceeded");
  });

  describe("redeemSet", () => {
    it("reverts when incomplete, burns 1 each + mints reward when complete", async () => {
      const f = await seeded();
      await f.collection.grantRole(await f.collection.MINTER_ROLE(), f.admin.address);
      const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      await f.collection.mintCards(f.alice.address, ids.slice(0, 10), Array(10).fill(1));
      await expect(f.collection.connect(f.alice).redeemSet(1)).to.be.revertedWithCustomError(f.collection, "IncompleteSet").withArgs(11);
      await f.collection.mintCards(f.alice.address, [11, 1], [1, 1]); // card 1 x2
      await expect(f.collection.connect(f.alice).redeemSet(1)).to.emit(f.collection, "SetRedeemed").withArgs(f.alice.address, 1, 12);
      expect(await f.collection.balanceOf(f.alice.address, 12)).to.equal(1n);
      expect(await f.collection.balanceOf(f.alice.address, 1)).to.equal(1n); // duplicate kept
      expect(await f.collection.balanceOf(f.alice.address, 2)).to.equal(0n);
      await expect(f.collection.connect(f.alice).redeemSet(99)).to.be.revertedWithCustomError(f.collection, "UnknownSet");
    });

    it("respects reward maxSupply", async () => {
      const f = await deployAll();
      await f.collection.createSet("s", RARITIES, SUPPLIES, 1);
      await f.collection.grantRole(await f.collection.MINTER_ROLE(), f.admin.address);
      const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      for (const u of [f.alice, f.bob]) await f.collection.mintCards(u.address, ids, Array(11).fill(1));
      await f.collection.connect(f.alice).redeemSet(1);
      await expect(f.collection.connect(f.bob).redeemSet(1)).to.be.revertedWithCustomError(f.collection, "MaxSupplyExceeded");
    });
  });

  it("getSetProgress, uri, pause blocks transfers", async () => {
    const f = await seeded();
    await f.collection.grantRole(await f.collection.MINTER_ROLE(), f.admin.address);
    await f.collection.mintCards(f.alice.address, [1, 3], [2, 1]);
    expect((await f.collection.getSetProgress(f.alice.address, 1)).map(Number)).to.deep.equal([2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await f.collection.uri(7)).to.equal("ipfs://cid/7.json");
    await expect(f.collection.connect(f.alice).pause()).to.be.reverted;
    await f.collection.pause();
    await expect(f.collection.connect(f.alice).safeTransferFrom(f.alice.address, f.bob.address, 1, 1, "0x")).to.be.reverted;
    await f.collection.unpause();
    await f.collection.connect(f.alice).safeTransferFrom(f.alice.address, f.bob.address, 1, 1, "0x");
    expect(await f.collection.balanceOf(f.bob.address, 1)).to.equal(1n);
  });
});
