// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ShitToken2 is ERC20 {
    constructor() ERC20("ShitToken2", "ST1") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}