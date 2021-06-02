// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./Ownable.sol";
import "./BEP20.sol";

contract MockBEP20 is BEP20, Ownable {

    constructor(string memory name,string memory symbol,uint256 supply) BEP20(name, symbol) {
        _mint(msg.sender, supply);
    }

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}


