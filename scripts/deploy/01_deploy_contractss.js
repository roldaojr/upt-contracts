const contractName = "UniswapPositionTools"

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const {
        deployer,
        UniswapV3NonfungiblePositionManager,
        UniswapV3SwapRouter
    } = await getNamedAccounts()
    await deploy(contractName, {
        from: deployer,
        args: [UniswapV3NonfungiblePositionManager, UniswapV3SwapRouter],
        deterministicDeployment: process.env.CONTRACT_KEY ?? true,
        gaslimit: 4000000,
        log: true
    })
}

module.exports.tags = [ contractName ]
