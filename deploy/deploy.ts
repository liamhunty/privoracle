import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedPrivOracle = await deploy("PrivOracle", {
    from: deployer,
    log: true,
  });

  console.log(`PrivOracle contract: `, deployedPrivOracle.address);
};
export default func;
func.id = "deploy_priv_oracle"; // id required to prevent reexecution
func.tags = ["PrivOracle"];
