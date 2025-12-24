import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

type AssetId = 0 | 1;

function parseAsset(value: string): AssetId {
  const normalized = value.trim().toLowerCase();
  if (normalized === "eth" || normalized === "0") {
    return 0;
  }
  if (normalized === "btc" || normalized === "1") {
    return 1;
  }
  throw new Error(`Unknown asset "${value}". Use ETH or BTC.`);
}

task("task:address", "Prints the PrivOracle address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const deployment = await deployments.get("PrivOracle");
  console.log("PrivOracle address is " + deployment.address);
});

task("task:current-day", "Prints the current day index").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { ethers, deployments } = hre;
  const deployment = await deployments.get("PrivOracle");
  const contract = await ethers.getContractAt("PrivOracle", deployment.address);
  const day = await contract.currentDay();
  console.log(`Current day: ${day}`);
});

task("task:record-price", "Records the daily price for an asset")
  .addParam("asset", "ETH or BTC")
  .addParam("price", "Price as integer (USD, no decimals)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const asset = parseAsset(taskArguments.asset);
    const price = BigInt(taskArguments.price);

    const deployment = await deployments.get("PrivOracle");
    const contract = await ethers.getContractAt("PrivOracle", deployment.address);
    const [signer] = await ethers.getSigners();

    const tx = await contract.connect(signer).recordDailyPrice(asset, price);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:place-prediction", "Places an encrypted prediction for tomorrow")
  .addParam("asset", "ETH or BTC")
  .addParam("price", "Predicted price as integer (USD, no decimals)")
  .addParam("direction", "1 for greater than, 2 for less than")
  .addOptionalParam("stake", "Stake in ETH (default 0.01)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const asset = parseAsset(taskArguments.asset);
    const price = BigInt(taskArguments.price);
    const direction = BigInt(taskArguments.direction);
    const stakeEth = taskArguments.stake ?? "0.01";

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("PrivOracle");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivOracle", deployment.address);

    const encrypted = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add64(price)
      .add8(direction)
      .encrypt();

    const tx = await contract.connect(signer).placePrediction(
      asset,
      encrypted.handles[0],
      encrypted.handles[1],
      encrypted.inputProof,
      { value: ethers.parseEther(stakeEth) },
    );
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:confirm-prediction", "Confirms a prediction for a given day")
  .addParam("asset", "ETH or BTC")
  .addParam("day", "Day index (UTC) to confirm")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const asset = parseAsset(taskArguments.asset);
    const day = BigInt(taskArguments.day);

    const deployment = await deployments.get("PrivOracle");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivOracle", deployment.address);

    const tx = await contract.connect(signer).confirmPrediction(asset, day);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:decrypt-points", "Decrypts your encrypted points")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("PrivOracle");
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("PrivOracle", deployment.address);

    const encryptedPoints = await contract.getPoints(signer.address);
    if (encryptedPoints === ethers.ZeroHash) {
      console.log("Encrypted points are not initialized.");
      return;
    }

    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedPoints,
      deployment.address,
      signer,
    );

    console.log(`Encrypted points: ${encryptedPoints}`);
    console.log(`Clear points: ${clearPoints}`);
  });
