const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  console.log("Deploying ElectionProofRegistry with account:", deployer.address);
  console.log("Chain ID:", chainId.toString());

  const factory = await hre.ethers.getContractFactory("ElectionProofRegistry");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("ElectionProofRegistry deployed at:", contractAddress);

  const artifact = await hre.artifacts.readArtifact("ElectionProofRegistry");
  const output = {
    network: hre.network.name,
    chainId: chainId.toString(),
    contractName: "ElectionProofRegistry",
    address: contractAddress,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  const targetDir = path.resolve(__dirname, "..", "..", "api-server", "src", "blockchain");
  fs.mkdirSync(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, "registry-deployment.json");
  fs.writeFileSync(targetFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log("Deployment metadata written to:", targetFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
