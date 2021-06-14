// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./mocks/Ownable.sol";
import "./mocks/BEP20.sol";
import "./libs/SafeMath.sol";

contract EraceToken is BEP20("ERace", "eRace"), Ownable {
    using SafeMath for uint256;

    uint256 public cap;           //max cap for eRace (10000e18)
    uint256 public remPoolAmount; // remaining pool amount that can be minted
    address public eRaceMaster;

    constructor(
        uint256 _cap
    ) {
        cap = _cap;
        remPoolAmount = _cap;
    }

    /**
     *@notice Sets eRaceMaster to `_eRaceMaster`. Must only be called by the owner.
     *@param _eRaceMaster Address of master contract to be set
     */
    function setMaster(address _eRaceMaster) public onlyOwner {
        require(
            _eRaceMaster != address(0x0),
            "EraceToken: Master cannot be zero address"
        );
        eRaceMaster = _eRaceMaster;
    }

    /**
     *@notice Creates `_amount` token to `_to`. Must only be called by the master farmer.
     *@param _to Address to which tokens are minted
     *@param _amount Amount of tokens to be minted
     */
    function mint(address _to, uint256 _amount) public {
        require(
            msg.sender == eRaceMaster,
            "EraceToken: only master farmer can mint"
        );
        require(remPoolAmount >= _amount, "EraceToken: mint amount exceeds cap");
        remPoolAmount = remPoolAmount.sub(_amount);
        _mint(_to, _amount);
    }
    
    /**
     *@notice Burns `_amount` token from `_from` address. 
     *@param _amount Amount of tokens to be burned
     */
    function burn(uint256 _amount) public {
        _burn(msg.sender, _amount);
    }
}
