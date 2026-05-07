require("@nomicfoundation/hardhat-ethers");

const ganacheRpcUrl = process.env.GANACHE_RPC_URL || "http://127.0.0.1:7545";
const deployerPrivateKeyRaw = (process.env.BLOCKCHAIN_PRIVATE_KEY || "").trim();
const isValidPrivateKey = /^0x[0-9a-fA-F]{64}$/.test(deployerPrivateKeyRaw);
const deployerPrivateKey = isValidPrivateKey ? deployerPrivateKeyRaw : "";

module.exports = {
  solidity: "0.8.24",
  networks: {
    ganache: {
      url: ganacheRpcUrl,
      chainId: Number.parseInt(process.env.BLOCKCHAIN_CHAIN_ID || "1337", 10),
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
  },
};
