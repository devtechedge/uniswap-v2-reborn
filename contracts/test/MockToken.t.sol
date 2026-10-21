// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/helpers/MockToken.sol";

contract MockTokenTest is Test {
    MockToken internal t;
    address internal alice = address(0xA11CE);

    function setUp() public {
        t = new MockToken("A", "A");
        t.mint(alice, 100);
    }

    function test_transferFromRespectsAllowance() public {
        vm.prank(alice);
        t.approve(address(this), 40);
        t.transferFrom(alice, address(1), 40);
        assertEq(t.balanceOf(address(1)), 40);
        vm.expectRevert(bytes("MockToken: ALLOWANCE"));
        t.transferFrom(alice, address(1), 1);
    }

    function test_infiniteAllowanceIsNotDecremented() public {
        vm.prank(alice);
        t.approve(address(this), type(uint256).max);
        t.transferFrom(alice, address(1), 10);
        assertEq(t.allowance(alice, address(this)), type(uint256).max);
    }

    function test_balanceCheck() public {
        vm.prank(alice);
        vm.expectRevert(bytes("MockToken: BALANCE"));
        t.transfer(address(1), 101);
    }
}
