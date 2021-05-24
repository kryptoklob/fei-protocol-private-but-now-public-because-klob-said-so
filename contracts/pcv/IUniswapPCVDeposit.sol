// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "./IPCVDeposit.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title a PCV Deposit interface
/// @author Fei Protocol
interface IUniswapPCVDeposit is IPCVDeposit {
    // ----------- Events -----------

    event MaxBasisPointsFromPegLPUpdate(uint256 oldMaxBasisPointsFromPegLP, uint256 newMaxBasisPointsFromPegLP);

    event WithdrawERC20(
        address indexed _caller,
        address indexed _token,
        address indexed _to,
        uint256 _amount
    );

    // ----------- Governor only state changing api -----------

    function setMaxBasisPointsFromPegLP(uint256 amount) external;

    // ----------- PCV Controller only state changing api -----------

    function withdrawERC20(IERC20 token, address to, uint256 amount) external;

    // ----------- Getters -----------

    function router() external view returns (IUniswapV2Router02);

    function liquidityOwned() external view returns (uint256);

    function maxBasisPointsFromPegLP() external view returns (uint256);
}

