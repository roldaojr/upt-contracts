const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { ethers, deployments } = require('hardhat');
const ERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');

let randomSeed = 10
const contractName = "UniswapPositionTools"
const testPositionsCount = 5

describe("UniswapTools contract", async () => {
    let accounts, nfPositionManager, factory, testPositions = [];
    const gasLimit = 700000

    before(async() => {
        accounts = await getNamedAccounts()

        // get uniswap contracts
        nfPositionManager = await ethers.getContractAt(
            "INonfungiblePositionManager",
            accounts.UniswapV3NonfungiblePositionManager
        );
        factory = await ethers.getContractAt(
            "IUniswapV3Factory",
            accounts.UniswapV3Factory
        )
    
        // deploy contract
        await deployments.fixture([contractName])
    
        // get positions tokens ids
        const positionsCount = await nfPositionManager.totalSupply()
        while(testPositions.length < testPositionsCount) {
            const tokenId = await nfPositionManager.tokenByIndex(
                Math.floor(positionsCount.toNumber() * random())
            )
            testPositions.push(tokenId.toNumber())
        }

        loadFixture(approvedTokensFixture)
    })

    /*
     * Ompersonate token owner
     */
    const getSignerForTokenId = async (tokenId) => {
        const ownerAddress = await nfPositionManager.ownerOf(tokenId)
        const ownerSigner = await impersonateAccountAndGetSigner(ownerAddress)
        return ownerSigner
    }

    /*
     */
    const impersonateContractForTokenId = async (tokenId) => {
        return ethers.getContractAt(
            contractName,
            accounts.deployer,
            await getSignerForTokenId(tokenId)
        )
    }

    const approvedTokensFixture = async () => {
        const [ owner ] = await ethers.getSigners();
        await Promise.all(testPositions.map(async tokenId => {
            const ownerSigner = await getSignerForTokenId(tokenId)
            // send eth pay gas fess
            await owner.sendTransaction({
                to: ownerSigner.address,
                value: ethers.utils.parseEther("0.1")
            }).then(tx => tx.wait())
            // approve token spend
            await nfPositionManager.connect(ownerSigner).approve(
                contract.address, tokenId, { gasLimit: 500000 }
            ).then(tx => tx.wait())
        }))
    }

    it("Compound fees", async () => {
        for(let tokenId of testPositions) {
            const contract = await impersonateContractForTokenId(tokenId)
            const { liquidity } = await nfPositionManager.positions(tokenId)
            // execute call
            await contract.swapAndCompound(tokenId, { gasLimit })
            // check new liquidity
            const { liquidity: newLiquidity } = await nfPositionManager.positions(tokenId)
            expect(newLiquidity > liquidity, "Liquidity must be bigger")
        }
    })

    it("Remint tokens changing price range", async () => {
        for(let tokenId of testPositions) {
            const contract = await impersonateContractForTokenId(tokenId)
            // get info
            const {
                token0, token1, fee,
                tickLower, tickUpper,
            }  = await nfPositionManager.positions(tokenId)
            const poolAddress = await factory.getPool(token0, token1, fee)
            const poolContract = await ethers.getContractAt("IUniswapV3Pool", poolAddress)
            const tickSpacing = await poolContract.tickSpacing()
            const newTickLower = tickLower - tickSpacing * 5
            const newTickUpper = tickUpper + tickSpacing * 10

            // remint token
            await contract.remint(
                tokenId, newTickLower, newTickUpper, { gasLimit: 1000000 }
            ).then(tx => tx.wait())
        }
    })

    it("Close position, collect fees", async () => {
        for(let tokenId of testPositions) {
            const contract = await impersonateContractForTokenId(tokenId)
            const { token0, token1 } = await nfPositionManager.positions(tokenId)
            // save balances 
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.signer.address))
            )
            const contractBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.address))
            )

            // remove liquidity
            await contract.removeLiquidityAndSwap(
                tokenId, 0, 0, { gasLimit }
            ).then(tx => tx.wait())

            // get new balances
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.signer.address))
            )
            const contractAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.address))
            )

            // check balances
            expect(
                (walletAfter[0].gte(walletBefore[0]) && walletAfter[1].gte(walletBefore[1])),
                "Owner must have more token balance"
            )
            expect(
                (contractAfter[0].eq(contractBefore[0]) && contractAfter[1].eq(contractBefore[1])),
                "Contract must not change the balance"
            )
        }
    })

    it("Close position, collect fees and convert to token1", async () => {
        for(let tokenId of testPositions) {
            const contract = await impersonateContractForTokenId(tokenId)
            const { token0, token1 } = await nfPositionManager.positions(tokenId)

            // save balances
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.signer.address))
            )
            const contractBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.address))
            )

            // remove liquidity
            await contract.removeLiquidityAndSwap(
                tokenId, 0, 1, { gasLimit }
            ).then(tx => tx.wait())

            // get new balances
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.signer.address))
            )
            const contractAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.address))
            )
            // check balances
            expect(
                (walletAfter[0].gte(walletBefore[0]) && walletAfter[1].gte(walletBefore[1])),
                "Owner must have more token balance"
            )
            expect(
                (contractAfter[0].eq(contractBefore[0]) && contractAfter[1].eq(contractBefore[1])),
                "Contract must not change the balance"
            )
        }
    })

    it("Close position, collect fees and convert to token2", async () => {
        for(let tokenId of testPositions) {
            const contract = await impersonateContractForTokenId(tokenId)
            const { token0, token1 } = await nfPositionManager.positions(tokenId)

            // save balances
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.signer.address))
            )
            const contractBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.address))
            )

            // remove liquidity
            await contract.removeLiquidityAndSwap(
                tokenId, 0, 2, { gasLimit }
            ).then(tx => tx.wait())

            // get new balances
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.signer.address))
            )
            const contractAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t, contract.address))
            )
            // check balances
            expect(
                (walletAfter[0].gte(walletBefore[0]) && walletAfter[1].gte(walletBefore[1])),
                "Owner must have more token balance"
            )
            expect(
                (contractAfter[0].eq(contractBefore[0]) && contractAfter[1].eq(contractBefore[1])),
                "Contract must not change the balance"
            )
        }
    })

    it("Partial close position, collect fees", async () => {
        for(let tokenId of testPositions) {
            const contract = await impersonateContractForTokenId(tokenId)
            const { liquidity } = await nfPositionManager.positions(tokenId)
            const percent = Math.floor(random() * 100)
            const liquidityToRemove = liquidity.mul(percent).div(100)

            // remove liquidity
            await contract.removeLiquidityAndSwap(
                tokenId, liquidityToRemove, 0, { gasLimit }
            ).then(tx => tx.wait())

            // check new liquidity
            const { liquidity: newLiquidity } = await nfPositionManager.positions(tokenId)
            expect(
                newLiquidity.eq(liquidity.sub(liquidityToRemove)),
                "New liquidity must be equal to remaining liquidity"
            )
        }
    })
})


const getTokenBalance = async (tokenAddress, ownerAddress) => {
    return (
        await ethers.getContractAt(ERC20.abi, tokenAddress)
    ).balanceOf(ownerAddress)
}

const impersonateAccountAndGetSigner = async (address) => {
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [address],
    });
    return await ethers.getSigner(address)
}

const random = () => {
    var x = Math.sin(randomSeed++) * 10000;
    return x - Math.floor(x);
}
