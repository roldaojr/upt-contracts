const JSBI = require('JSBI')
const { Price } = require('@uniswap/sdk-core')
const {
    loadFixture, setBalance, impersonateAccount, stopImpersonatingAccount
} = require('@nomicfoundation/hardhat-network-helpers')
const { assert, expect } = require('chai')
const { ethers, deployments, getNamedAccounts } = require('hardhat')
const { abi: IERC20 } = require('@openzeppelin/contracts/build/contracts/ERC20.json')
const uniswap = require("../lib/uniswap")

let randomSeed = 1
const contractName = "UniswapPositionTools"
const gasLimit = 1000000

describe("UniswapTools contract", async () => {
    let accounts, nfPositionManager, contract
    const testPositions = [316343, 100209, 363656, 266715, 225152]

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
        await Promise.all(testPositions.map(approveToken))
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
            await stopImpersonatingAccount(ownerAddress)
            // check new liquidity
            const [
                {args: { liquidity }}
            ] = await contract.connect(ownerSigner).queryFilter(
                contract.filters.Compounded(ownerAddress, tokenId), -1, "latest"
            )
            const afterPosition = await uniswap.getPosition(tokenId)
            assert.isTrue(
                JSBI.equal(
                    JSBI.add(
                        JSBI.BigInt(liquidity.toString()),
                        beforePosition.liquidity
                    ),
                    afterPosition.liquidity
                ),
                "Liquidity must increase"
            )
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
            await stopImpersonatingAccount(ownerAddress)
            // get new tokenId
            const [
                {args: { newTokenId }}
            ] = await contract.connect(ownerSigner).queryFilter(
                contract.filters.Reminted(ownerAddress, tokenId), -1, "latest"
            )
            // compare current ticks with calculated ticks
            const {
                tickLower: curTickLower,
                tickUpper: curTickUpper,
            } = await uniswap.getPosition(newTokenId)
            assert.equal(curTickLower, newTickLower, "Lower tick not updated")
            assert.equal(curTickUpper, newTickUpper, "Upper tick not updated")
        }
    })

    it("Close position, collect fees", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            const { pool: {token0, token1} } = await uniswap.getPosition(tokenId)
            // get balance
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // remove liquidity
            await contract.connect(ownerSigner).removeLiquidityAndSwap(
                tokenId, 0, 0, { gasLimit }
            ).then(tx => tx.wait())
            await stopImpersonatingAccount(ownerAddress)
            // get amounts
            const [
                {args: { amount0, amount1 }}
            ] = await contract.connect(ownerSigner).queryFilter(
                contract.filters.LiquidityRemoved(ownerAddress, tokenId), -1, "latest"
            )
            // check new Liquidity
            const {
                liquidity: afterLiquidity
            } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(afterLiquidity, JSBI.BigInt(0)), `Liquidity = 0`)
            // get updated balance
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // check balances
            assert.isTrue(
                walletBefore[0].add(amount0).eq(walletAfter[0]),
                `Balance of token0 must been increased by ${amount0.toString()}`
            )
            assert.isTrue(
                walletBefore[1].add(amount1).eq(walletAfter[1]),
                `Balance of token1 must been increased by ${amount1.toString()}`
            )
        }
    })

    it("Close position, collect fees and convert to token0", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            const { pool: {token0, token1} } = await uniswap.getPosition(tokenId)
            // save balances
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // remove liquidity
            await contract.connect(ownerSigner).removeLiquidityAndSwap(
                tokenId, 0, 1, { gasLimit }
            ).then(tx => tx.wait())
            await stopImpersonatingAccount(ownerAddress)
            // get amounts
            const [
                {args: { amount0, amount1 }}
            ] = await contract.connect(ownerSigner).queryFilter(
                contract.filters.LiquidityRemoved(ownerAddress, tokenId), -1, "latest"
            )
            // check new Liquidity
            const {
                liquidity: afterLiquidity
            } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(afterLiquidity, JSBI.BigInt(0)), `Liquidity = 0`)
            // get updated balance
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // check balances
            assert.isTrue(
                walletAfter[0].sub(walletBefore[0]).eq(amount0),
                `Balance of token0 must been increased by ${amount0.toString()}`
            )
            assert.isTrue(
                walletAfter[1].sub(walletBefore[1]).eq(amount1),
                `Balance of token1 must been increased by ${amount1.toString()}`
            )
        }
    })

    it("Close position, collect fees and convert to token1", async () => {
        for(let tokenId of testPositions) {
            const ownerAddress = await nfPositionManager.ownerOf(tokenId)
            await impersonateAccount(ownerAddress)
            const ownerSigner = await ethers.getSigner(ownerAddress)
            const { pool: {token0, token1} } = await uniswap.getPosition(tokenId)
            // save balances
            const walletBefore = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // remove liquidity
            await contract.connect(ownerSigner).removeLiquidityAndSwap(
                tokenId, 0, 2, { gasLimit }
            ).then(tx => tx.wait())
            await stopImpersonatingAccount(ownerAddress)
            // get amounts
            const [
                {args: { amount0, amount1 }}
            ] = await contract.connect(ownerSigner).queryFilter(
                contract.filters.LiquidityRemoved(ownerAddress, tokenId), -1, "latest"
            )
            // check new Liquidity
            const {
                liquidity: afterLiquidity
            } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(afterLiquidity, JSBI.BigInt(0)), `Liquidity = 0`)
            // get updated balance
            const walletAfter = await Promise.all(
                [token0, token1].map(t => getTokenBalance(t.address, ownerAddress))
            )
            // check balances
            assert.isTrue(
                walletAfter[0].sub(walletBefore[0]).eq(amount0),
                `Balance of token0 must been increased by ${amount0.toString()}`
            )
            assert.isTrue(
                walletAfter[1].sub(walletBefore[1]).eq(amount1),
                `Balance of token1 must been increased by ${amount1.toString()}`
            )
        }
    })

    it("Partial close position", async () => {
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
            await stopImpersonatingAccount(ownerAddress)

            // check new liquidity
            const { liquidity: afterLiquidity } = await uniswap.getPosition(tokenId)
            assert.isTrue(JSBI.equal(
                afterLiquidity,
                JSBI.subtract(liquidity, reduceLiquidity),
            ), `Liquidity must be reduced`)
        }
    })

    it("Deny for not owned tokens", async () => {
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
    const token = await ethers.getContractAt(IERC20, tokenAddress)
    return token.balanceOf(ownerAddress)
}

const random = () => {
    var x = Math.sin(randomSeed++) * 10000;
    return x - Math.floor(x);
}

function randomInteger(min, max) {
    return Math.floor(random() * (max - min) ) + min;
}
