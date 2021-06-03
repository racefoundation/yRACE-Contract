// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "./mocks/Ownable.sol";
import "./mocks/BEP20.sol";

contract YraceToken is BEP20("yRace", "yRace"), Ownable {
    address public yRaceMaster;

    /**
     *@notice Sets yRaceMaster to `_yRaceMaster`. Must only be called by the owner.
     *@param _yRaceMaster Address of master contract to be set
     */

    function setMaster(address _yRaceMaster) public onlyOwner {
        require(
            _yRaceMaster != address(0x0),
            "YraceToken: Master cannot be zero address"
        );
        yRaceMaster = _yRaceMaster;
    }

    /**
     *@notice Creates `_amount` token to `_to`. Must only be called by the master farmer.
     *@param _to Address to which tokens are minted
     *@param _amount Amount of tokens to be minted
     */
    function mint(address _to, uint256 _amount) public {
        require(
            msg.sender == yRaceMaster,
            "YraceToken: only master farmer can mint"
        );
        _mint(_to, _amount);
    }
}
