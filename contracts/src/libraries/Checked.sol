// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Checked uint256 arithmetic that reverts with the exact strings observed in the
/// mainnet bytecode (specs/PAIR.md), instead of Solidity 0.8 panics. Keeps revert data
/// byte-identical for integrators that match on reason strings.
library Checked {
    function add(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x + y;
        }
        require(z >= x, "ds-math-add-overflow");
    }

    function sub(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require(y <= x, "ds-math-sub-underflow");
        unchecked {
            z = x - y;
        }
    }

    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x * y;
        }
        require(y == 0 || z / y == x, "ds-math-mul-overflow");
    }

    /// @dev Division by zero in the original hits INVALID with empty revert data.
    function div(uint256 x, uint256 y) internal pure returns (uint256) {
        require(y != 0);
        unchecked {
            return x / y;
        }
    }
}
