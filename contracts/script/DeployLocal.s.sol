// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {RebornFactory} from "../src/RebornFactory.sol";
import {RebornRouter} from "../src/RebornRouter.sol";
import {MockToken} from "../src/helpers/MockToken.sol";

/// @notice Local-only deployment (anvil, chain id 31337). Uses an unlocked anvil account, so no
/// private key is ever passed or stored. Refuses to run on any other chain.
contract DeployLocal is Script {
    function run() external {
        require(block.chainid == 31337, "DeployLocal: anvil only");
        address weth = vm.envOr("WETH", address(0));
        vm.startBroadcast();
        if (weth == address(0)) weth = address(new MockToken("Wrapped Ether (mock)", "WETH"));
        RebornFactory factory = new RebornFactory(msg.sender);
        RebornRouter router = new RebornRouter(address(factory), weth);
        MockToken alpha = new MockToken("Alpha", "ALPHA");
        MockToken beta = new MockToken("Beta", "BETA");
        alpha.mint(msg.sender, 1e27);
        beta.mint(msg.sender, 1e27);
        alpha.approve(address(router), type(uint256).max);
        beta.approve(address(router), type(uint256).max);
        router.addLiquidity(address(alpha), address(beta), 1e24, 5e23, 0, 0, msg.sender, block.timestamp + 600);
        vm.stopBroadcast();
        console.log("factory", address(factory));
        console.log("router ", address(router));
        console.log("alpha  ", address(alpha));
        console.log("beta   ", address(beta));
        console.log("pair   ", factory.getPair(address(alpha), address(beta)));
    }
}
