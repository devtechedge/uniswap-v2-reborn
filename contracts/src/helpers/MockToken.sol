// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal ERC-20 used as pool tokens in tests and the differential harness.
/// Open mint, infinite-approval shortcut, string reverts the TypeScript model mirrors.
contract MockToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to, uint256 value) external {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 current = allowance[from][msg.sender];
        if (current != type(uint256).max) {
            require(current >= value, "MockToken: ALLOWANCE");
            unchecked {
                allowance[from][msg.sender] = current - value;
            }
        }
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) private {
        uint256 bal = balanceOf[from];
        require(bal >= value, "MockToken: BALANCE");
        unchecked {
            balanceOf[from] = bal - value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
