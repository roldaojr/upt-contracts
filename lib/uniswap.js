const { ethers, getChainId } = require('hardhat')
const { Token, Price } = require('@uniswap/sdk-core')
const {
    Pool, Position, nearestUsableTick, priceToClosestTick
} = require('@uniswap/v3-sdk')
const IERC20Metadata = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/IERC20Metadata.sol/IERC20Metadata.json')

const getPositionManager = () => {
    return ethers.getContractAt(
        "INonfungiblePositionManager",
        '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    )
}

const getPoolState = async (poolContract) => {
    const [ liquidity, slot ] = await Promise.all([
        poolContract.liquidity(),
        poolContract.slot0()
    ])
    return {
        liquidity,
        sqrtPriceX96: slot[0],
        tick: slot[1],
        observationIndex: slot[2],
        observationCardinality: slot[3],
        observationCardinalityNext: slot[4],
        feeProtocol: slot[5],
        unlocked: slot[6],
    }
}

const getToken = async (address) => {
    const tokenContract = await ethers.getContractAt(IERC20Metadata.abi, address)
    const chainId = parseInt(await getChainId());
    const [ decimals, symbol ] = await Promise.all([
        tokenContract.decimals(),
        tokenContract.symbol()
    ])
    const newToken = new Token(chainId, address, decimals, symbol)
    return newToken
}

const getPool = async (token0address, token1address, fee) => {
    const token0 = await getToken(token0address)
    const token1 = await getToken(token1address)
    const poolAddress = Pool.getAddress(token0, token1, fee)
    const poolContract = await ethers.getContractAt('IUniswapV3Pool', poolAddress)
    const state = await getPoolState(poolContract)
    return new Pool(
        token0,
        token1,
        fee,
        state.sqrtPriceX96.toString(),
        state.liquidity.toString(),
        state.tick
    )
}

const getPosition = async (id) => {
    const nfPositionManager = await getPositionManager()
    const {
        token0, token1, fee, liquidity, tickLower, tickUpper,
        ...extra
    } = await nfPositionManager.positions(id)
    const pool = await getPool(token0, token1, fee)
    const position = new Position({pool, liquidity, tickLower, tickUpper})
    for(let prop in extra) {
        position[prop] = extra[prop]
    }
    position.id = id
    return position
}


const poolPriceToTick = (pool, fraction) => {
    const price = new Price(
        pool.token0, pool.token1,
        fraction.denominator, fraction.numerator
    )
    return nearestUsableTick(priceToClosestTick(price), pool.tickSpacing)
}

module.exports = {
    getPositionManager,
    getPosition,
    poolPriceToTick
}
