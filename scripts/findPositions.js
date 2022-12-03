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
        const position = await nfPositionManager.positions(tokenId)
        // check position balances
        if(position.liquidity.gt(0) && (
            position.tokensOwed0.gt(0) ||
            position.tokensOwed1.gt(0)
        )) {
            console.info("Found valid position ID: ", tokenId.toNumber())
            positions.push(tokenId.toNumber())
        }
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
