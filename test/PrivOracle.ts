import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";
import { PrivOracle, PrivOracle__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("PrivOracle")) as PrivOracle__factory;
  const contract = (await factory.deploy()) as PrivOracle;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

describe("PrivOracle", function () {
  let signers: Signers;
  let contract: PrivOracle;
  let contractAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This hardhat test suite cannot run on Sepolia Testnet");
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("rewards a correct prediction", async function () {
    const day = await contract.currentDay();
    const nextDay = day + 1n;
    const stake = ethers.parseEther("0.1");

    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add64(1900n)
      .add8(1n)
      .encrypt();

    const placeTx = await contract.connect(signers.alice).placePrediction(
      0,
      encrypted.handles[0],
      encrypted.handles[1],
      encrypted.inputProof,
      { value: stake },
    );
    await placeTx.wait();

    await time.increaseTo(Number(nextDay * 86400n) + 5);

    const recordTx = await contract.connect(signers.deployer).recordDailyPrice(0, 2000);
    await recordTx.wait();

    const confirmTx = await contract.connect(signers.alice).confirmPrediction(0, nextDay);
    await confirmTx.wait();

    const encryptedPoints = await contract.getPoints(signers.alice.address);
    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedPoints,
      contractAddress,
      signers.alice,
    );

    expect(clearPoints).to.eq(stake);
  });

  it("does not reward an incorrect prediction", async function () {
    const day = await contract.currentDay();
    const nextDay = day + 1n;
    const stake = ethers.parseEther("0.05");

    const encrypted = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add64(2100n)
      .add8(1n)
      .encrypt();

    const placeTx = await contract.connect(signers.alice).placePrediction(
      1,
      encrypted.handles[0],
      encrypted.handles[1],
      encrypted.inputProof,
      { value: stake },
    );
    await placeTx.wait();

    await time.increaseTo(Number(nextDay * 86400n) + 5);

    const recordTx = await contract.connect(signers.deployer).recordDailyPrice(1, 2000);
    await recordTx.wait();

    const confirmTx = await contract.connect(signers.alice).confirmPrediction(1, nextDay);
    await confirmTx.wait();

    const encryptedPoints = await contract.getPoints(signers.alice.address);
    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedPoints,
      contractAddress,
      signers.alice,
    );

    expect(clearPoints).to.eq(0);
  });
});
