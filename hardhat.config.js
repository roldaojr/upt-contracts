const dotenv = require("dotenv")
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-ethers");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
const { removeConsoleLog } = require("hardhat-preprocessor");

dotenv.config()

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.7.6",
        settings: {
            optimizer: {
                runs: 200,
                enabled: true
            }
        }
    },
    preprocess: {
        eachLine: removeConsoleLog(
          (bre) =>
            bre.network.name !== "hardhat" && bre.network.name !== "localhost"
        ),
    },
    defaultNetwork: 'hardhat',
    paths: {
        deploy: 'scripts/deploy'
    },
    networks: {
        hardhat: {
            chainId: 1337,
            live: false,
            tags: ["test", "dev"],
            forking: process.env.HARDHAT_FORK_RPC_URL ? {
                url: process.env.HARDHAT_FORK_RPC_URL,
                blockNumber: process.env.HARDHAT_FORK_BLOCK ? (
                    parseInt(process.env.HARDHAT_FORK_BLOCK) 
                ): undefined
            } : undefined,
        },
        goerli: {
            chainId: 5,
            url: `https://goerli.infura.io/v3/${process.env.INFURA_KEY}`,
            accounts: [process.env.ACCOUNT_PRIVATE_KEY],
            live: true,
            tags: ["staging"]
        },
        mumbai: {
            chainId: 80001,
            url: `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_KEY}`,
            accounts: [process.env.ACCOUNT_PRIVATE_KEY],
            live: true,
            tags: ["staging"],
        }
    },
    namedAccounts: {
        spender: { default: 0 },
        deployer: { default: 1 },
        other: { default: 2 },
        // known contract addresses
        UniswapV3NonfungiblePositionManager: {
            default: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        },
        UniswapV3SwapRouter: {
            default: "0xE592427A0AEce92De3Edee1F18E0157C05861564"
        },
    }
}
