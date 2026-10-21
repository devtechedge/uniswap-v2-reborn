// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PoolLibrary} from "./libraries/PoolLibrary.sol";
import {SafeTransfers} from "./libraries/SafeTransfers.sol";
import {IRebornFactory, IRebornPair, IERC20Min, IWETH9} from "./interfaces/IReborn.sol";

/// @notice Liquidity and swap router, clean-room from specs/ROUTER02.md.
/// Like the original it keeps no storage: factory, WETH and the pair code hash are immutables.
contract RebornRouter {
    address public immutable factory;
    address public immutable WETH;
    bytes32 public immutable pairCodeHash;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        _;
    }

    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
        pairCodeHash = IRebornFactory(_factory).pairCodeHash();
    }

    receive() external payable {
        require(msg.sender == WETH); // only unwraps; mirrors the original assert (empty revert)
    }

    function _pair(address a, address b) private view returns (address) {
        return PoolLibrary.pairFor(factory, pairCodeHash, a, b);
    }

    // ---------------------------------------------------------------- liquidity

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) private returns (uint256 amountA, uint256 amountB) {
        if (IRebornFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IRebornFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = PoolLibrary.getReserves(factory, pairCodeHash, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = PoolLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "UniswapV2Router: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = PoolLibrary.quote(amountBDesired, reserveB, reserveA);
                require(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "UniswapV2Router: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = _pair(tokenA, tokenB);
        SafeTransfers.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        SafeTransfers.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IRebornPair(pair).mint(to);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        (amountToken, amountETH) =
            _addLiquidity(token, WETH, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
        address pair = _pair(token, WETH);
        SafeTransfers.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWETH9(WETH).deposit{value: amountETH}();
        require(IWETH9(WETH).transfer(pair, amountETH));
        liquidity = IRebornPair(pair).mint(to);
        if (msg.value > amountETH) SafeTransfers.safeTransferETH(msg.sender, msg.value - amountETH);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = _pair(tokenA, tokenB);
        IRebornPair(pair).transferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = IRebornPair(pair).burn(to);
        (address token0,) = PoolLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "UniswapV2Router: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "UniswapV2Router: INSUFFICIENT_B_AMOUNT");
    }

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        (amountToken, amountETH) = removeLiquidity(
            token, WETH, liquidity, amountTokenMin, amountETHMin, address(this), deadline
        );
        SafeTransfers.safeTransfer(token, to, amountToken);
        IWETH9(WETH).withdraw(amountETH);
        SafeTransfers.safeTransferETH(to, amountETH);
    }

    function _permit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        uint256 value = approveMax ? type(uint256).max : liquidity;
        IRebornPair(_pair(tokenA, tokenB)).permit(msg.sender, address(this), value, deadline, v, r, s);
    }

    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 amountA, uint256 amountB) {
        _permit(tokenA, tokenB, liquidity, deadline, approveMax, v, r, s);
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
    }

    function removeLiquidityETHWithPermit(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 amountToken, uint256 amountETH) {
        _permit(token, WETH, liquidity, deadline, approveMax, v, r, s);
        (amountToken, amountETH) = removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to, deadline);
    }

    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountETH) {
        (, amountETH) = removeLiquidity(token, WETH, liquidity, amountTokenMin, amountETHMin, address(this), deadline);
        SafeTransfers.safeTransfer(token, to, IERC20Min(token).balanceOf(address(this)));
        IWETH9(WETH).withdraw(amountETH);
        SafeTransfers.safeTransferETH(to, amountETH);
    }

    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 amountETH) {
        _permit(token, WETH, liquidity, deadline, approveMax, v, r, s);
        amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
            token, liquidity, amountTokenMin, amountETHMin, to, deadline
        );
    }

    // ---------------------------------------------------------------- swaps

    function _swap(uint256[] memory amounts, address[] memory path, address _to) private {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = PoolLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? _pair(output, path[i + 2]) : _to;
            IRebornPair(_pair(input, output)).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = PoolLibrary.getAmountsOut(factory, pairCodeHash, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
        SafeTransfers.safeTransferFrom(path[0], msg.sender, _pair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = PoolLibrary.getAmountsIn(factory, pairCodeHash, amountOut, path);
        require(amounts[0] <= amountInMax, "UniswapV2Router: EXCESSIVE_INPUT_AMOUNT");
        SafeTransfers.safeTransferFrom(path[0], msg.sender, _pair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[0] == WETH, "UniswapV2Router: INVALID_PATH");
        amounts = PoolLibrary.getAmountsOut(factory, pairCodeHash, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
        IWETH9(WETH).deposit{value: amounts[0]}();
        require(IWETH9(WETH).transfer(_pair(path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "UniswapV2Router: INVALID_PATH");
        amounts = PoolLibrary.getAmountsIn(factory, pairCodeHash, amountOut, path);
        require(amounts[0] <= amountInMax, "UniswapV2Router: EXCESSIVE_INPUT_AMOUNT");
        SafeTransfers.safeTransferFrom(path[0], msg.sender, _pair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWETH9(WETH).withdraw(amounts[amounts.length - 1]);
        SafeTransfers.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "UniswapV2Router: INVALID_PATH");
        amounts = PoolLibrary.getAmountsOut(factory, pairCodeHash, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
        SafeTransfers.safeTransferFrom(path[0], msg.sender, _pair(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWETH9(WETH).withdraw(amounts[amounts.length - 1]);
        SafeTransfers.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline)
        external
        payable
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[0] == WETH, "UniswapV2Router: INVALID_PATH");
        amounts = PoolLibrary.getAmountsIn(factory, pairCodeHash, amountOut, path);
        require(amounts[0] <= msg.value, "UniswapV2Router: EXCESSIVE_INPUT_AMOUNT");
        IWETH9(WETH).deposit{value: amounts[0]}();
        require(IWETH9(WETH).transfer(_pair(path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        if (msg.value > amounts[0]) SafeTransfers.safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    // Fee-on-transfer variants: each hop's input is measured from the pair balance delta.
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) private {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = PoolLibrary.sortTokens(input, output);
            IRebornPair pair = IRebornPair(_pair(input, output));
            uint256 amountOutput;
            {
                (uint256 reserve0, uint256 reserve1,) = pair.getReserves();
                (uint256 reserveInput, uint256 reserveOutput) =
                    input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
                uint256 balance = IERC20Min(input).balanceOf(address(pair));
                require(balance >= reserveInput, "ds-math-sub-underflow");
                amountOutput = PoolLibrary.getAmountOut(balance - reserveInput, reserveInput, reserveOutput);
            }
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
            address to = i < path.length - 2 ? _pair(output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function _received(address token, address to, uint256 before) private view returns (uint256) {
        uint256 nowBal = IERC20Min(token).balanceOf(to);
        require(nowBal >= before, "ds-math-sub-underflow");
        return nowBal - before;
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) {
        SafeTransfers.safeTransferFrom(path[0], msg.sender, _pair(path[0], path[1]), amountIn);
        address last = path[path.length - 1];
        uint256 before = IERC20Min(last).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(_received(last, to, before) >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) {
        require(path[0] == WETH, "UniswapV2Router: INVALID_PATH");
        IWETH9(WETH).deposit{value: msg.value}();
        require(IWETH9(WETH).transfer(_pair(path[0], path[1]), msg.value));
        address last = path[path.length - 1];
        uint256 before = IERC20Min(last).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(_received(last, to, before) >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) {
        require(path[path.length - 1] == WETH, "UniswapV2Router: INVALID_PATH");
        SafeTransfers.safeTransferFrom(path[0], msg.sender, _pair(path[0], path[1]), amountIn);
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint256 amountOut = IERC20Min(WETH).balanceOf(address(this));
        require(amountOut >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
        IWETH9(WETH).withdraw(amountOut);
        SafeTransfers.safeTransferETH(to, amountOut);
    }

    // ---------------------------------------------------------------- views

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256) {
        return PoolLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256) {
        return PoolLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256) {
        return PoolLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory) {
        return PoolLibrary.getAmountsOut(factory, pairCodeHash, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory) {
        return PoolLibrary.getAmountsIn(factory, pairCodeHash, amountOut, path);
    }
}
