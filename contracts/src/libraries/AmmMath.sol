// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Integer square root (Babylonian, floor) and min, per specs/PAIR.md.
library AmmMath {
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x;
            unchecked {
                x = y / 2 + 1;
                while (x < z) {
                    z = x;
                    x = (y / x + x) / 2;
                }
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
