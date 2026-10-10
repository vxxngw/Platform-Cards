require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("dotenv").config();
const LOCALNET = require("./localnet/config");

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY, LOCALNET_RPC_URL, LOCALNET_PRIVATE_KEY } = process.env;
const withPrefix = (k) => (k.startsWith("0x") ? k : "0x" + k);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  paths: { sources: "./src", tests: "./test" },
  networks: {
    hardhat: { allowUnlimitedContractSize: false },
    // The local 2-node geth network (localnet/). Transactions go through node 2, the RPC node; node 1 only seals blocks.
    localnet: {
      url: LOCALNET_RPC_URL || `http://127.0.0.1:${LOCALNET.NODES[2].http}`,
      chainId: LOCALNET.CHAIN_ID,
      accounts: LOCALNET_PRIVATE_KEY ? [withPrefix(LOCALNET_PRIVATE_KEY)] : { mnemonic: LOCALNET.DEV_MNEMONIC, count: LOCALNET.DEV_ACCOUNTS },
    },
    ...(SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY
      ? { sepolia: { url: SEPOLIA_RPC_URL, chainId: 11155111, accounts: [withPrefix(DEPLOYER_PRIVATE_KEY)] } }
      : {}),
  },
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  gasReporter: { enabled: !!process.env.REPORT_GAS, currency: "USD" },
};
