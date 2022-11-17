const dotenv = require("dotenv")
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-ethers");
require("hardhat-deploy");
require("hardhat-deploy-ethers");

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
        }
    },
    namedAccounts: {
        deployer: {
            default: 0, // here this will by default take the first account as deployer
        },
        UniswapV3Factory: {
            default: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        },
        UniswapV3NonfungiblePositionManager: {
            default: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        },
        UniswapV3SwapRouter: {
            default: "0xE592427A0AEce92De3Edee1F18E0157C05861564"
        },
        WETH9: {
            default: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
        }
    }
}
