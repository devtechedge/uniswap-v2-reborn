// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "../src/helpers/MockToken.sol";
import {FlashBorrower} from "../src/helpers/FlashBorrower.sol";
import {RebornFactory} from "../src/RebornFactory.sol";
import {RebornPair} from "../src/RebornPair.sol";
import {RebornRouter} from "../src/RebornRouter.sol";

contract WETHStub {
    mapping(address => uint256) public balanceOf;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 wad) external {
        balanceOf[msg.sender] -= wad;
        payable(msg.sender).transfer(wad);
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        balanceOf[f] -= v;
        balanceOf[to] += v;
        return true;
    }
}

contract RebornTest is Test {
    RebornFactory internal factory;
    RebornRouter internal router;
    WETHStub internal weth;
    MockToken internal a;
    MockToken internal b;
    address internal alice = address(0xA11CE);
    address internal admin = address(0xAD);

    function setUp() public {
        factory = new RebornFactory(admin);
        weth = new WETHStub();
        router = new RebornRouter(address(factory), address(weth));
        a = new MockToken("A", "A");
        b = new MockToken("B", "B");
        if (address(a) > address(b)) (a, b) = (b, a);
        for (uint256 i; i < 2; i++) {
            MockToken t = i == 0 ? a : b;
            t.mint(alice, 1e30);
            vm.prank(alice);
            t.approve(address(router), type(uint256).max);
        }
        vm.deal(alice, 1e24);
    }

    function _add(uint256 x, uint256 y) internal returns (RebornPair) {
        vm.prank(alice);
        router.addLiquidity(address(a), address(b), x, y, 0, 0, alice, block.timestamp);
        return RebornPair(factory.getPair(address(a), address(b)));
    }

    function test_pairAddressMatchesCreate2() public {
        RebornPair p = _add(1e18, 1e18);
        bytes32 salt = keccak256(abi.encodePacked(address(a), address(b)));
        address expected = address(
            uint160(uint256(keccak256(abi.encodePacked(hex"ff", address(factory), salt, factory.pairCodeHash()))))
        );
        assertEq(address(p), expected);
        assertEq(p.token0(), address(a));
    }

    function test_firstMintLocksMinimumLiquidity() public {
        RebornPair p = _add(4e18, 1e18);
        assertEq(p.balanceOf(address(0)), 1000);
        assertEq(p.balanceOf(alice), 2e18 - 1000);
    }

    function test_createPairErrors() public {
        vm.expectRevert(bytes("UniswapV2: IDENTICAL_ADDRESSES"));
        factory.createPair(address(a), address(a));
        vm.expectRevert(bytes("UniswapV2: ZERO_ADDRESS"));
        factory.createPair(address(0), address(a));
        factory.createPair(address(a), address(b));
        vm.expectRevert(bytes("UniswapV2: PAIR_EXISTS"));
        factory.createPair(address(b), address(a));
        vm.expectRevert(bytes("UniswapV2: FORBIDDEN"));
        factory.setFeeTo(alice);
    }

    function test_swapRevertsOnK() public {
        RebornPair p = _add(10e18, 10e18);
        vm.prank(alice);
        a.transfer(address(p), 1e18);
        vm.expectRevert(bytes("UniswapV2: K"));
        p.swap(0, 0.91e18, alice, "");
        p.swap(0, 0.9e18, alice, "");
    }

    function test_flashSwapAndReentrancyLock() public {
        RebornPair p = _add(10e18, 10e18);
        FlashBorrower bor = new FlashBorrower();
        a.mint(address(bor), 1e18);
        vm.expectRevert(bytes("UniswapV2: LOCKED"));
        p.swap(1e17, 0, address(bor), abi.encode(address(a), uint256(2e17), true));
        vm.expectRevert(bytes("UniswapV2: K"));
        p.swap(1e17, 0, address(bor), abi.encode(address(a), uint256(1e17), false));
        p.swap(1e17, 0, address(bor), abi.encode(address(a), uint256(100300902708124374), false));
    }

    function test_twapAccumulates() public {
        RebornPair p = _add(2e18, 1e18);
        vm.warp(block.timestamp + 100);
        p.sync();
        assertEq(p.price0CumulativeLast(), (uint256(1e18) << 112) / 2e18 * 100);
        assertEq(p.price1CumulativeLast(), (uint256(2e18) << 112) / 1e18 * 100);
    }

    function test_protocolFee() public {
        vm.prank(admin);
        factory.setFeeTo(address(0xFEE));
        RebornPair p = _add(1000e18, 1000e18);
        address[] memory path = new address[](2);
        for (uint256 i; i < 10; i++) {
            (path[0], path[1]) = i % 2 == 0 ? (address(a), address(b)) : (address(b), address(a));
            vm.prank(alice);
            router.swapExactTokensForTokens(100e18, 0, path, alice, block.timestamp);
        }
        _add(1e18, 1e18);
        assertGt(p.balanceOf(address(0xFEE)), 0);
    }

    function test_ethRoundTrip() public {
        vm.prank(alice);
        router.addLiquidityETH{value: 5e18}(address(a), 10e18, 0, 0, alice, block.timestamp);
        address[] memory path = new address[](2);
        (path[0], path[1]) = (address(a), address(weth));
        uint256 before = alice.balance;
        vm.prank(alice);
        router.swapExactTokensForETH(1e18, 0, path, alice, block.timestamp);
        assertGt(alice.balance, before);
    }

    function test_deadlineAndSlippage() public {
        _add(1e18, 1e18);
        address[] memory path = new address[](2);
        (path[0], path[1]) = (address(a), address(b));
        vm.startPrank(alice);
        vm.expectRevert(bytes("UniswapV2Router: EXPIRED"));
        router.swapExactTokensForTokens(1e15, 0, path, alice, block.timestamp - 1);
        vm.expectRevert(bytes("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokens(1e15, 1e15, path, alice, block.timestamp);
        vm.stopPrank();
    }

    function testFuzz_swapMatchesQuote(uint96 r0, uint96 r1, uint96 amountIn) public {
        vm.assume(r0 > 1e6 && r1 > 1e6 && amountIn > 0);
        _add(r0, r1);
        address[] memory path = new address[](2);
        (path[0], path[1]) = (address(a), address(b));
        (uint256 ra, uint256 rb) = (uint256(r0), uint256(r1));
        uint256 quoted = router.getAmountOut(amountIn, ra, rb);
        vm.assume(quoted > 0);
        uint256 before = b.balanceOf(alice);
        vm.prank(alice);
        router.swapExactTokensForTokens(amountIn, 0, path, alice, block.timestamp);
        assertEq(b.balanceOf(alice) - before, quoted);
    }

    function testFuzz_getAmountInIsMinimal(uint96 rIn, uint96 rOut, uint96 out) public view {
        vm.assume(rIn > 0 && rOut > 1 && out > 0 && out < rOut);
        uint256 need = router.getAmountIn(out, rIn, rOut);
        assertGe(router.getAmountOut(need, rIn, rOut), out);
        if (need > 1) assertLt(router.getAmountOut(need - 1, rIn, rOut), out);
    }

    function testFuzz_burnReturnsProRata(uint96 x, uint96 y, uint8 pct) public {
        vm.assume(x > 1e9 && y > 1e9 && pct > 0 && pct <= 100);
        RebornPair p = _add(x, y);
        uint256 lp = p.balanceOf(alice) * pct / 100;
        vm.assume(lp > 0);
        vm.startPrank(alice);
        p.approve(address(router), lp);
        (uint256 outA, uint256 outB) = router.removeLiquidity(address(a), address(b), lp, 0, 0, alice, block.timestamp);
        vm.stopPrank();
        assertLe(outA, x);
        assertLe(outB, y);
    }
}
