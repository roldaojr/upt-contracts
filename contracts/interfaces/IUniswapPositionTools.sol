// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';


interface IUniswapPositionTools {
    // config changes
    event TWAPConfigUpdated(address account, uint32 maxTWAPTickDifference, uint32 TWAPSeconds);
    // events
    event Compounded(
        address indexed account,
        uint256 indexed tokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1,
        address token0,
        address token1
    );

    event Reminted(
        address indexed account,
        uint256 indexed tokenId,
        uint256 newTokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1,
        address token0,
        address token1
    );

    event LiquidityRemoved(
        address indexed account,
        uint256 indexed tokenId,
        uint256 amount0,
        uint256 amount1,
        address token0,
        address token1
    );

    /// @notice The nonfungible position manager address with which this staking contract is compatible
    function nonfungiblePositionManager() external view returns (INonfungiblePositionManager);

    /// @notice The nonfungible position manager address with which this staking contract is compatible
    function swapRouter() external view returns (ISwapRouter);

    /// @notice Max tick difference between TWAP tick and current price to allow operations
    function maxTWAPTickDifference() external view returns (uint32);

    /// @notice Number of seconds to use for TWAP calculation
    function TWAPSeconds() external view returns (uint32);

    /**
     * @notice Management method to change the max tick difference from twap to allow swaps (onlyOwner)
     * @param _maxTWAPTickDifference new max tick difference
     * @param _TWAPSeconds new TWAP period seconds
     */
    function setTWAPConfig(uint32 _maxTWAPTickDifference, uint32 _TWAPSeconds) external;

    /// @notice how reward should be converted
    enum RewardConversion { NONE, TOKEN_0, TOKEN_1 }

    /**
     * @notice Autocompounds for a given NFT (anyone can call this and gets a percentage of the fees)
     * @param tokenId Autocompound token with tokenId
     * @return liquidity Amount of new liquidity
     * @return compounded0 Amount of token0 that was compounded
     * @return compounded1 Amount of token1 that was compounded
     */
    function swapAndCompound(uint256 tokenId) external returns (
        uint128 liquidity, uint256 compounded0, uint256 compounded1
    );

    function remint(
        uint256 tokenId, int24 tickLower, int24 tickUpper
    ) external returns (
        uint256 newTokenId, uint128 newLiquidity, uint256 amount0, uint256 amount1
    );

    function removeLiquidityAndSwap(
        uint256 tokenId, uint128 liquidityAmount, RewardConversion conversion
    ) external returns (
        uint256 amount0, uint256 amount1
    );
}
