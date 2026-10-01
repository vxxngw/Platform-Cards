const { expect } = require("chai");
const { ethers } = require("hardhat");
const { seeded } = require("./helpers");

const P = ethers.parseEther("1");

async function withCards(f) {
  await f.collection.grantRole(await f.collection.MINTER_ROLE(), f.admin.address);
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  await f.collection.mintCards(f.alice.address, ids, Array(11).fill(3));
  await f.collection.connect(f.alice).setApprovalForAll(await f.market.getAddress(), true);
  return ids;
}

describe("Marketplace", () => {
  it("listCard escrows; buy pays seller minus 2.5% fee; withdraw works", async () => {
    const f = await seeded(); await withCards(f);
    await expect(f.market.connect(f.alice).listCard(1, 2, P)).to.emit(f.market, "Listed");
    expect(await f.collection.balanceOf(await f.market.getAddress(), 1)).to.equal(2n);
    await expect(f.market.connect(f.bob).buy(1, { value: P })).to.emit(f.market, "Sold").withArgs(1, f.bob.address, P);
    expect(await f.collection.balanceOf(f.bob.address, 1)).to.equal(2n);
    expect(await f.market.pendingWithdrawals(f.alice.address)).to.equal(ethers.parseEther("0.975"));
    expect(await f.market.accruedFees()).to.equal(ethers.parseEther("0.025"));
    await expect(f.market.connect(f.alice).withdraw()).to.changeEtherBalance(f.alice, ethers.parseEther("0.975"));
    await expect(f.market.connect(f.alice).withdraw()).to.be.revertedWithCustomError(f.market, "NothingToWithdraw");
    await expect(f.market.withdrawFees(f.carol.address)).to.changeEtherBalance(f.carol, ethers.parseEther("0.025"));
  });

  it("validates price/amount/value/self-buy", async () => {
    const f = await seeded(); await withCards(f);
    await expect(f.market.connect(f.alice).listCard(1, 1, 0)).to.be.revertedWithCustomError(f.market, "InvalidPrice");
    await expect(f.market.connect(f.alice).listCard(1, 0, P)).to.be.revertedWithCustomError(f.market, "InvalidAmount");
    await f.market.connect(f.alice).listCard(1, 1, P);
    await expect(f.market.connect(f.bob).buy(1, { value: P - 1n })).to.be.revertedWithCustomError(f.market, "WrongValue");
    await expect(f.market.connect(f.bob).buy(1, { value: P + 1n })).to.be.revertedWithCustomError(f.market, "WrongValue");
    await expect(f.market.connect(f.alice).buy(1, { value: P })).to.be.revertedWithCustomError(f.market, "SelfBuy");
  });

  it("sold or cancelled listing cannot be bought / cancelled again", async () => {
    const f = await seeded(); await withCards(f);
    await f.market.connect(f.alice).listCard(1, 1, P);
    await f.market.connect(f.alice).listCard(2, 1, P);
    await f.market.connect(f.bob).buy(1, { value: P });
    await expect(f.market.connect(f.carol).buy(1, { value: P })).to.be.revertedWithCustomError(f.market, "NotActive");
    await expect(f.market.connect(f.bob).cancel(2)).to.be.revertedWithCustomError(f.market, "NotSeller");
    await expect(f.market.connect(f.alice).cancel(2)).to.emit(f.market, "Cancelled");
    expect(await f.collection.balanceOf(f.alice.address, 2)).to.equal(3n);
    await expect(f.market.connect(f.carol).buy(2, { value: P })).to.be.revertedWithCustomError(f.market, "NotActive");
    await expect(f.market.connect(f.alice).cancel(2)).to.be.revertedWithCustomError(f.market, "NotActive");
  });

  it("bundle: one of each card in set, buyer receives whole set", async () => {
    const f = await seeded(); const ids = await withCards(f);
    await expect(f.market.connect(f.alice).listBundle(1, P * 5n)).to.emit(f.market, "Listed");
    expect((await f.market.getListing(1)).isBundle).to.equal(true);
    await f.market.connect(f.bob).buy(1, { value: P * 5n });
    for (const id of ids) expect(await f.collection.balanceOf(f.bob.address, id)).to.equal(1n);
    await expect(f.collection.connect(f.bob).redeemSet(1)).to.emit(f.collection, "SetRedeemed");
  });

  it("listing without approval reverts", async () => {
    const f = await seeded(); await withCards(f);
    await f.collection.connect(f.alice).setApprovalForAll(await f.market.getAddress(), false);
    await expect(f.market.connect(f.alice).listCard(1, 1, P)).to.be.reverted;
  });

  it("setFee: ADMIN only, ≤ 10%", async () => {
    const f = await seeded();
    await expect(f.market.connect(f.alice).setFee(100)).to.be.reverted;
    await expect(f.market.setFee(1001)).to.be.revertedWithCustomError(f.market, "FeeTooHigh");
    await f.market.setFee(1000);
    expect(await f.market.feeBps()).to.equal(1000n);
  });

  it("pause blocks list/buy; cancel still returns assets", async () => {
    const f = await seeded(); await withCards(f);
    await f.market.connect(f.alice).listCard(1, 1, P);
    await f.market.pause();
    await expect(f.market.connect(f.alice).listCard(2, 1, P)).to.be.reverted;
    await expect(f.market.connect(f.bob).buy(1, { value: P })).to.be.reverted;
    await expect(f.market.connect(f.alice).cancel(1)).to.emit(f.market, "Cancelled");
  });

  describe("re-entrancy", () => {
    async function setup() {
      const f = await seeded(); await withCards(f);
      const att = await (await ethers.getContractFactory("ReentrancyAttacker")).deploy(await f.market.getAddress());
      await f.collection.mintCards(await att.getAddress(), [1], [1]);
      return { f, att };
    }

    it("re-buying from onERC1155BatchReceived callback fails", async () => {
      const { f, att } = await setup();
      await f.market.connect(f.alice).listCard(1, 2, P); // listing 1 (re-entry target)
      await f.market.connect(f.alice).listCard(2, 1, P); // listing 2 (attacker buys)
      await att.arm(1, true, false);
      await att.buy(2, { value: P });
      expect(await att.reentered()).to.equal(false);
      expect(await f.collection.balanceOf(await f.market.getAddress(), 1)).to.equal(2n); // listing 1 untouched
    });

    it("re-entering withdraw from receive() cannot double-withdraw", async () => {
      const { f, att } = await setup();
      await att.approveAll(await f.collection.getAddress());
      await att.list(1, 1, P);
      await f.market.connect(f.bob).buy(1, { value: P });
      await att.arm(1, false, true);
      await att.withdraw();
      expect(await att.reentered()).to.equal(false);
      expect(await ethers.provider.getBalance(await f.market.getAddress())).to.equal(ethers.parseEther("0.025"));
    });
  });
});
