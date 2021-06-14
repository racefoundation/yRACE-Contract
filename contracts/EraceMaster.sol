// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./mocks/Ownable.sol";
import "./libs/SafeBEP20.sol";
import "./libs/SafeMath.sol";
import "./EraceToken.sol";

contract EraceMaster is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 rewardToClaim; //Total reward to be claimed
        //
        // We do some fancy math here. Basically, any point in time, the amount of eRaces
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * YracePool.rewardPerShare) - user.rewardDebt

        // Whenever a user deposits tokens to a seed YracePool. Here's what happens:
        //   1. The YracePool's `rewardPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User.s pending rewards is added to user's 'rewardToClaim'
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each YracePool.
    struct PoolInfo {
        IBEP20 lpToken;         //  YracePool contract address
        uint256 lastRewardBlock;
        uint256 rewardPerShare; //amount of eRace per yRace token
    }

    // The eRace TOKEN!
    EraceToken public eRace;
    // eRace tokens created per block.
    uint256 public REWARD_PER_BLOCK;
    //start of staking period
    uint256 public START_BLOCK;
    // start of claiming period
    uint256 public END_BLOCK;
    // Info of YracePool.
    PoolInfo public YracePool;
    // Info of each user that stakes LP tokens. ser address => info
    mapping(address => UserInfo) public userInfo;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    constructor(
        EraceToken _eRace,
        uint256 _rewardPerBlock,
        uint256 _START_BLOCK,
        uint256 _END_BLOCK,
        IBEP20 yRace
    ) {
        eRace = _eRace;
        REWARD_PER_BLOCK = _rewardPerBlock;
        START_BLOCK = _START_BLOCK;
        END_BLOCK = _END_BLOCK;
        YracePool =  PoolInfo(yRace,START_BLOCK,0);
    }


    /**
     *@notice Mint tokens for master contract and updates pools to have latest rewardPerShare
     */
    function updatePool() public {
        //won't mine until sale starts after start block
        if (block.number <= YracePool.lastRewardBlock) {
            return;
        }
        //total staked in YracePool
        uint256 lpSupply = YracePool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            YracePool.lastRewardBlock = block.number;
            return;
        }
        uint256 reward =
            getPoolReward(YracePool.lastRewardBlock, block.number);
        eRace.mint(address(this), reward);
        //amount of eRace per token
        YracePool.rewardPerShare = YracePool.rewardPerShare.add(
            reward.mul(1e12).div(lpSupply)
        );
        YracePool.lastRewardBlock = block.number;
    }

    /**
     *@notice Deposits `_amount` from user's balance to YracePool `_pid`
     *@param _amount Number of tokens to be deposited
     */
    function deposit(
        uint256 _amount
    ) public {
        require(
            block.number >= START_BLOCK,
            "EraceMaster: Staking period has not started"
        );
        require(
            block.number < END_BLOCK,
            "EraceMaster: Staking period has ended"
        );

        UserInfo storage user = userInfo[msg.sender];
        updatePool();
        if (user.amount > 0) {
            uint256 pending =
                user.amount.mul(YracePool.rewardPerShare).div(1e12).sub(
                    user.rewardDebt
                );
            user.rewardToClaim += pending;
        }
        if (_amount > 0) {
            YracePool.lpToken.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );            
            user.amount = user.amount.add(_amount);
        }
        
        user.rewardDebt = user.amount.mul(YracePool.rewardPerShare).div(1e12);
        emit Deposit(msg.sender, _amount);
    }

    /**
     *@notice Withdraws `_amount` nu. of tokens from YracePool `_pid`
     *@param _amount Amount to be withdrawn
     */
    function withdraw(uint256 _amount) public {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount != 0, "EraceMaster: No tokens staked");
        require(user.amount >= _amount, "EraceMaster : Withdraw not good");
        updatePool();
        uint256 pending =
            user.amount.mul(YracePool.rewardPerShare).div(1e12).sub(user.rewardDebt);
        user.rewardToClaim += pending;

        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            YracePool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(YracePool.rewardPerShare).div(1e12);
        emit Withdraw(msg.sender, user.amount);
    }

    /**
     *@notice Withdraws all tokens from YracePool `_pid` and sends eRace reward tokens and staked tokens to user
     */
    function harvest() public {
        require(
            block.number >= END_BLOCK,
            "EraceMaster: Staking period is in progress"
        );

        UserInfo storage user = userInfo[msg.sender];
        updatePool();
        uint256 pending =
            user.amount.mul(YracePool.rewardPerShare).div(1e12).sub(user.rewardDebt);
        user.rewardToClaim += pending;  

        require(user.rewardToClaim != 0, "EraceMaster: No rewards to claim");

        if (user.rewardToClaim > 0) {
            safeTransferReward(msg.sender, user.rewardToClaim);
        }
        
        YracePool.lpToken.safeTransfer(address(msg.sender), user.amount);
        user.amount = 0;
        user.rewardToClaim = 0;
        user.rewardDebt = 0;
    }


    /**
     *@notice To avoid rounding error causing YracePool to not have enough eRaces.
     *@param _to Address to which amount is transferred
     *@param _amount Amount to be transferred
     */
    function safeTransferReward(address _to, uint256 _amount) internal {
        uint256 bal = eRace.balanceOf(address(this));
        if (_amount > bal) {
            eRace.transfer(_to, bal);
        } else {
            eRace.transfer(_to, _amount);
        }
    }

    /**
     *@notice Returns reward multiplier over the given `_from` to `_to` block.
     *@param _from Block number from which multiplier is to calculated
     *@param _to Block number till which multiplier is to calculated
     */
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        if (_to <= START_BLOCK || _from >= _to) {
            return 0;
        } else if (_to > START_BLOCK && _to <= END_BLOCK) {
            if (_from <= START_BLOCK) {
                return _to.sub(START_BLOCK);
            } else {
                return _to.sub(_from);
            }
        } else {
            if (_from <= END_BLOCK) {
                return END_BLOCK.sub(_from);
            } else {
                return 0;
            }
        }
    }

    /**
     *@notice Returns amount of eRace to be minted for YracePool for duration of `_from` to `_to` block
     *@param _from Block number from which multiplier is to calculated
     *@param _to Block number till which multiplier is to calculated
     */
    function getPoolReward(
        uint256 _from,
        uint256 _to
    ) public view returns (uint256) {
        uint256 multiplier = getMultiplier(_from, _to);
        uint256 amount =
            multiplier.mul(REWARD_PER_BLOCK);
        uint256 amountCanMint = eRace.remPoolAmount();
        return amountCanMint < amount ? amountCanMint : amount;
    }

    /**
     *@notice Returns amount staked by address `_user` in YracePool `_pid`
     *@param _user User address
     */
    function getStakedAmount(address _user)
        public
        view
        returns (uint256)
    {
        UserInfo storage user = userInfo[_user];
        return user.amount;
    }

    /**
     *@notice Returns total reward generated for the user `_user` in YracePool `_pid`
     *@param _user User address
     */
    function pendingReward( address _user)
        external
        view
        returns (uint256)
    {
        UserInfo storage user = userInfo[_user];
        uint256 rewardPerShare = YracePool.rewardPerShare;
        uint256 lpSupply = YracePool.lpToken.balanceOf(address(this));
        if (block.number > YracePool.lastRewardBlock && lpSupply > 0) {
            uint256 reward =
                getPoolReward(
                    YracePool.lastRewardBlock,
                    block.number
                );
            rewardPerShare = rewardPerShare.add(reward.mul(1e12).div(lpSupply));
        }
        return
            user.rewardToClaim +
            user.amount.mul(rewardPerShare).div(1e12).sub(user.rewardDebt);
    }
}
