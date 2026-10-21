// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IPairSync {
    function sync() external;
}

interface IERC20Transfer {
    function transfer(address to, uint256 value) external returns (bool);
}

/// @notice Flash-swap receiver. `data` = abi.encode(repayToken, repayAmount, reenter).
/// With `reenter` it calls back into the pair first, which must fail with the lock error.
contract FlashBorrower {
    function uniswapV2Call(address, uint256, uint256, bytes calldata data) external {
        (address token, uint256 repay, bool reenter) = abi.decode(data, (address, uint256, bool));
        if (reenter) IPairSync(msg.sender).sync();
        if (repay > 0) IERC20Transfer(token).transfer(msg.sender, repay);
    }
}
