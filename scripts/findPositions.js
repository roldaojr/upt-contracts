const { ethers } = require('hardhat')
const uniswap = require("../lib/uniswap")

const MAX_UINT128 = ethers.BigNumber.from(2).pow(128).sub(1)

const main = async () => {
    console.info(`Search valid positions`)
    const positionsCount = 10
    const positions = []
    const nfPositionManager = await uniswap.getPositionManager()
    const totalPositions = await nfPositionManager.totalSupply()
    while(positions.length < positionsCount) {
        const tokenId = await nfPositionManager.tokenByIndex(
            randomInteger(20000, totalPositions.toNumber())
        )
        const position = await nfPositionManager.positions(tokenId)
        // check liquidity
        if(position.liquidity.eq(0)) continue
        const owner = await nfPositionManager.ownerOf(tokenId)
        const signer = await ethers.getSigner(owner)
        // check fees
        const { amount0, amount1 } = await nfPositionManager.connect(
            signer
        ).callStatic.collect({
            tokenId,
            recipient: signer.address,
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128
        }, {from: signer.address})
        if(amount0.eq(0) && amount1.eq(0)) continue
        // Position is valid
        console.info("Found valid position ID:", tokenId.toNumber())
        positions.push(tokenId.toNumber())
    }
    console.info("Valid positions found", positions)
}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min) ) + min;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
