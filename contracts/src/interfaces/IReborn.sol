// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IRebornFactory {
    function feeTo() external view returns (address);
    function getPair(address, address) external view returns (address);
    function createPair(address, address) external returns (address);
    function pairCodeHash() external pure returns (bytes32);
}

interface IRebornPair {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
    function getReserves() external view returns (uint112, uint112, uint32);
    function mint(address to) external returns (uint256);
    function burn(address to) external returns (uint256, uint256);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function initialize(address, address) external;
}

interface IFlashCallee {
    function uniswapV2Call(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external;
}

interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
}

interface IWETH9 {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
    function withdraw(uint256) external;
}
