// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Checked} from "./Checked.sol";
import {IRebornPair} from "../interfaces/IReborn.sol";

/// @notice Router-side pool math and address derivation, from specs/ROUTER02.md.
/// Revert strings keep the "UniswapV2Library:" prefix the original emits.
library PoolLibrary {
    using Checked for uint256;

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2Library: ZERO_ADDRESS");
    }

    function pairFor(address factory, bytes32 codeHash, address tokenA, address tokenB)
        internal
        pure
        returns (address)
    {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        return address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(hex"ff", factory, keccak256(abi.encodePacked(token0, token1)), codeHash))
                )
            )
        );
    }

    function getReserves(address factory, bytes32 codeHash, address tokenA, address tokenB)
        internal
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1,) = IRebornPair(pairFor(factory, codeHash, tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256) {
        require(amountA > 0, "UniswapV2Library: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        return amountA.mul(reserveB).div(reserveA);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        require(amountIn > 0, "UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn.mul(997);
        return amountInWithFee.mul(reserveOut).div(reserveIn.mul(1000).add(amountInWithFee));
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        require(amountOut > 0, "UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn.mul(amountOut).mul(1000);
        uint256 denominator = reserveOut.sub(amountOut).mul(997);
        return numerator.div(denominator).add(1);
    }

    function getAmountsOut(address factory, bytes32 codeHash, uint256 amountIn, address[] memory path)
        internal
        view
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "UniswapV2Library: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            (uint256 rIn, uint256 rOut) = getReserves(factory, codeHash, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], rIn, rOut);
        }
    }

    function getAmountsIn(address factory, bytes32 codeHash, uint256 amountOut, address[] memory path)
        internal
        view
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "UniswapV2Library: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 rIn, uint256 rOut) = getReserves(factory, codeHash, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], rIn, rOut);
        }
    }
}
