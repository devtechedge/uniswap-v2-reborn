// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Low-level token and ETH transfers tolerant of tokens that return nothing.
library SafeTransfers {
    function safeTransfer(address token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: TRANSFER_FAILED");
    }

    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: TRANSFER_FROM_FAILED");
    }

    function safeTransferETH(address to, uint256 value) internal {
        (bool ok,) = to.call{value: value}(new bytes(0));
        require(ok, "TransferHelper: ETH_TRANSFER_FAILED");
    }
}
