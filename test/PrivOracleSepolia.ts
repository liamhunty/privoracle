import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { PrivOracle } from "../types";
import { expect } from "chai";

type Signers = {
  owner: HardhatEthersSigner;
};

describe("PrivOracleSepolia", function () {
  let signers: Signers;
  let contract: PrivOracle;

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This hardhat test suite can only run on Sepolia Testnet");
      this.skip();
    }

    try {
      const deployment = await deployments.get("PrivOracle");
      contract = await ethers.getContractAt("PrivOracle", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners = await ethers.getSigners();
    signers = { owner: ethSigners[0] };
  });

  it("reads current day and owner", async function () {
    this.timeout(4 * 20000);
    const day = await contract.currentDay();
    const owner = await contract.owner();

    expect(day).to.be.gt(0);
    expect(owner).to.equal(signers.owner.address);
  });
});
