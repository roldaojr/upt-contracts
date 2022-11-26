const JSBI = require('JSBI')
const uniswap = require("../lib/uniswap")

const main = async () => {
    console.info(`Search valid positions`)
    const positionsCount = 10
    const positions = []
    const nfPositionManager = await uniswap.getPositionManager()
    const totalPositions = await nfPositionManager.totalSupply()
    while(positions.length < positionsCount) {
        const tokenId = await nfPositionManager.tokenByIndex(
            randomInteger(0, totalPositions.toNumber())
        )
        const position = await uniswap.getPosition(tokenId)
        // check position balances
        if(
            (
                position.feeGrowthInside0LastX128.gt(0) ||
                position.feeGrowthInside1LastX128.gt(0)
            ) && JSBI.greaterThan(position.liquidity, JSBI.BigInt(0))
        ) {
            console.debug(tokenId.toNumber())
            positions.push(tokenId.toNumber())
        }
    }
}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min) ) + min;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
