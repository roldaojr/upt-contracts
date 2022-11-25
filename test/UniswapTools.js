const JSBI = require('JSBI')
const { Price } = require('@uniswap/sdk-core')
const {
    loadFixture, setBalance, impersonateAccount, stopImpersonatingAccount
} = require('@nomicfoundation/hardhat-network-helpers')
const { assert, expect } = require('chai')
const { ethers, deployments, getNamedAccounts } = require('hardhat')
const { abi: ERC20 } = require('@openzeppelin/contracts/build/contracts/ERC20.json')
const uniswap = require("../lib/uniswap")

let randomSeed = 4955
const contractName = "UniswapPositionTools"
const testPositionsCount = 5
const gasLimit = 1000000

describe("UniswapTools contract", async () => {
    let accounts, nfPositionManager, testPositions = [], contract;

    /*
     * Approve tokens spend
     */
    const approveToken = async (tokenId) => {
        const ownerAddress = await nfPositionManager.ownerOf(tokenId)
        // send eth pay gas fess
        await setBalance(ownerAddress, ethers.utils.parseEther("0.1"))
        await impersonateAccount(ownerAddress)
        const ownerSigner = await ethers.getSigner(ownerAddress)
        // approve token spend
        await nfPositionManager.connect(ownerSigner).approve(
            contract.address, tokenId, { gasLimit }
        ).then(tx => tx.wait())
        return stopImpersonatingAccount(ownerAddress)
    }

    /*
     * get random positions with filter
     */
    const getTestPostions = async () => {
        const positionsCount = await nfPositionManager.totalSupply()
        while(testPositions.length < testPositionsCount) {
            const tokenId = await nfPositionManager.tokenByIndex(
                Math.floor(positionsCount.toNumber() * random())
            )
            const position = await uniswap.getPosition(tokenId)
            // check position balances
            if(
                (
                    position.feeGrowthInside0LastX128.gt(0) ||
                    position.feeGrowthInside1LastX128.gt(0)
                ) && JSBI.greaterThan(position.liquidity, JSBI.BigInt(0))
            ) {
                // approve token andd to list
                await approveToken(tokenId)
                testPositions.push(tokenId.toNumber())
            }
        }
        return testPositions
    }

    before(async() => {
        accounts = await getNamedAccounts()
        // get uniswap contracts
        nfPositionManager = await uniswap.getPositionManager()
        // deploy contracts
        await impersonateAccount(accounts.deployer)
        await deployments.fixture([contractName])
        await stopImpersonatingAccount(accounts.deployer)
        // get contract
        const { address, abi } = await deployments.get(contractName)
        contract = new ethers.Contract(address, abi)
    })

    beforeEach(async () => {
        await loadFixture(getTestPostions)
    })

    it("Compound fees", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            const beforePosition = await uniswap.getPosition(tokenId)
            // execute call
            await contract.connect(ownerSigner).swapAndCompound(
                tokenId, { gasLimit }
            ).then(tx => tx.wait())
            // check new liquidity
            const afterPosition = await uniswap.getPosition(tokenId)
            assert.isTrue(
                JSBI.greaterThan(afterPosition.liquidity, beforePosition.liquidity),
                "Liquidity must increase"
            )
            await stopImpersonatingAccount(ownerAddress)
        }
    })

    it("Remint tokens changing price range", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            // get info
            const {
                pool,
                token0PriceLower: priceLower,
                token0PriceUpper: priceUpper
            } = await uniswap.getPosition(tokenId)
            const percentPrice = new Price(
                pool.token1, pool.token0,
                ethers.utils.parseUnits("100", pool.token1.decimals),
                ethers.utils.parseUnits("120", pool.token0.decimals)
            )
            const newPriceLower = priceLower.multiply(percentPrice)
            const newPriceUpper = priceUpper.multiply(percentPrice)
            const newTickLower = uniswap.poolPriceToTick(pool, newPriceLower)
            const newTickUpper = uniswap.poolPriceToTick(pool, newPriceUpper)
            // remint token
            await contract.connect(ownerSigner).remint(
                tokenId, newTickLower, newTickUpper, { gasLimit }
            ).then(tx => tx.wait())
            /*assert.equal(
                curTickLower, newTickLower,
                "Lower tick not updated"
            )
            assert.equal(
                curTickUpper, newTickUpper,
                "Upper tick not updated"
            )*/
            await stopImpersonatingAccount(ownerAddress)
        }
    })

    it("Close position, collect fees", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            const {
                pool: {token0, token1}, amount0, amount1, liquidity, ...pos
            } = await uniswap.getPosition(tokenId)
            // get balance
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // remove liquidity
            await contract.connect(ownerSigner).removeLiquidityAndSwap(
                tokenId, 0, 0, { gasLimit }
            ).then(tx => tx.wait())
            // get updated balance
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // check new Liquidity
            const {
                liquidity: afterLiquidity
            } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(afterLiquidity, JSBI.BigInt(0)), `Liquidity = 0`)
            // check balances
            assert.isTrue(JSBI.greaterThanOrEqual(
                walletAfter[0], JSBI.add(walletBefore[0], amount0.decimalScale)
            ), `Balance of token0 must been increased by ${amount0.toSignificant()}`)
            assert.isTrue(JSBI.greaterThanOrEqual(
                walletAfter[1], JSBI.add(walletBefore[1], amount1.decimalScale)
            ), `Balance of token1 must been increased by ${amount1.toSignificant()}`)
            await stopImpersonatingAccount(ownerAddress)
        }
    })

    it("Close position, collect fees and convert to token0", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            const {
                pool: {token0, token1}, amount0
            } = await uniswap.getPosition(tokenId)
            // save balances
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // remove liquidity
            await contract.connect(ownerSigner).removeLiquidityAndSwap(
                tokenId, 0, 1, { gasLimit }
            ).then(tx => tx.wait())
            // get new balances
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // check new Liquidity
            const {
                liquidity: afterLiquidity
            } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(afterLiquidity, JSBI.BigInt(0)), `Liquidity = 0`)
            // check balances
            assert.isTrue(JSBI.greaterThan(
                walletAfter[0], JSBI.add(walletBefore[0], amount0.decimalScale)
            ), `Balance of token0 must been increased by ${amount0.toSignificant()}`)
            assert.isTrue(JSBI.equal(
                walletAfter[1], walletBefore[1]
            ), `Balance of token1 must not changed`)
            await stopImpersonatingAccount(ownerAddress)
        }
    })

    it("Close position, collect fees and convert to token1", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            const {
                pool: {token0, token1}, amount1
            } = await uniswap.getPosition(tokenId)
            // save balances
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // remove liquidity
            await contract.connect(ownerSigner).removeLiquidityAndSwap(
                tokenId, 0, 2, { gasLimit }
            ).then(tx => tx.wait())
            // get new balances
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // check new Liquidity
            const {
                liquidity: afterLiquidity
            } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(afterLiquidity, JSBI.BigInt(0)), `Liquidity = 0`)
            // check balances
            assert.isTrue(JSBI.equal(
                walletAfter[0], walletBefore[0]
            ), `Balance of token0 must not changed`)
            assert.isTrue(JSBI.greaterThan(
                walletAfter[1], JSBI.add(walletBefore[1], amount1.decimalScale)
            ), `Balance of token1 must been increased by ${amount1.toSignificant()}`)
            await stopImpersonatingAccount(ownerAddress)
        }
    })

    it("Partial close position, collect fees", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            const { liquidity } = await uniswap.getPosition(tokenId)
            const percent = JSBI.BigInt(Math.floor(random() * 90))
            const reduceLiquidity = JSBI.divide(JSBI.multiply(
                liquidity, percent
            ), JSBI.BigInt(100))
            // remove liquidity
            await contract.connect(ownerSigner).removeLiquidityAndSwap(
                tokenId, reduceLiquidity.toString(), 0, { gasLimit }
            ).then(tx => tx.wait())

            // check new liquidity
            const { liquidity: afterLiquidity } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(
                afterLiquidity,
                JSBI.subtract(liquidity, reduceLiquidity),
            ), `Liquidity must be reduced`)
            await stopImpersonatingAccount(ownerAddress)
        }
    })

    it("Deny not owned tokens manipulation", async () => {
        for(let tokenId of testPositions) {
            const [spender] = await ethers.getSigners()
            const { liquidity: reduceLiquidity } = await uniswap.getPosition(tokenId)
            // execute call and expect Error           
            await expect(
                contract.connect(spender).removeLiquidityAndSwap(
                    tokenId, reduceLiquidity.toString(), 0, { gasLimit }
                )
            ).to.be.rejectedWith(Error)
            // check liquidity
            const { liquidity: afterLiquidity } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(
                afterLiquidity,
                reduceLiquidity,
            ), `Liquidity must not change`)
        }
    })
})

const getTokenBalance = async (tokenAddress, ownerAddress) => {
    return (
        await ethers.getContractAt(ERC20, tokenAddress)
    ).balanceOf(ownerAddress)
}

const random = () => {
    var x = Math.sin(randomSeed++) * 10000;
    return x - Math.floor(x);
}
