// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "./mocks/Ownable.sol";
import "./libs/SafeBEP20.sol";
import "./libs/SafeMath.sol";
import "./YraceToken.sol";

contract YraceSeedMaster is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 rewardToClaim; //Total reward to be claimed
        //
        // We do some fancy math here. Basically, any point in time, the amount of yRaces
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.rewardPerShare) - user.rewardDebt

        // Whenever a user deposits tokens to a seed pool. Here's what happens:
        //   1. The pool's `rewardPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User.s pending rewards is added to user's 'rewardToClaim'
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IBEP20 lpToken; // seed pool contract address
        uint256 allocPoint;
        uint256 lastRewardBlock;
        uint256 rewardPerShare; //amount of yRace per pool token
        uint16 depositFeeBP; // Deposit fee in basis points
    }

    // The yRace TOKEN!
    YraceToken public yRace;
    // yRace tokens created per block.
    uint256 public REWARD_PER_BLOCK;
    //start of staking period
    uint256 public START_BLOCK;
    // start of claiming period
    uint256 public END_BLOCK;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    //Total maximum rewards from seed pool
    uint256 public seedPoolAmount;
    // Referral Bonus in basis points. Initially set to 2% (1% = 100 BP)
    uint256 public refBonusBP = 200;
    // Deposit Fee address
    address public feeAddress;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // poolId1 count from 1, subtraction 1 before using with poolInfo
    mapping(address => uint256) public poolId1;
    // Info of each user that stakes LP tokens. pid => user address => info
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Referral Mapping
    mapping(address => address) public referrers; // account_address -> referrer_address
    mapping(address => uint256) public referredCount; // referrer_address -> num_of_referred

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Referral(address indexed _referrer, address indexed _user);
    event ReferralPaid(
        address indexed _user,
        address indexed _userTo,
        uint256 _reward
    );

    constructor(
        YraceToken _yRace,
        uint256 _rewardPerBlock,
        uint256 _START_BLOCK,
        uint256 _END_BLOCK,
        uint256 _seedPoolAmount,
        address _feeAddress
    ) {
        yRace = _yRace;
        REWARD_PER_BLOCK = _rewardPerBlock;
        START_BLOCK = _START_BLOCK;
        END_BLOCK = _END_BLOCK;
        seedPoolAmount = _seedPoolAmount;
        feeAddress = _feeAddress;
    }

    modifier validDepositFeeBP(uint16 _depositFeeBP) {
        require(
            _depositFeeBP <= 10000,
            "add: invalid deposit fee basis points"
        );
        _;
    }

    // -------- For manage pool ---------
    /**
     *@notice Adds new seed pool to poolInfo
     *@param _allocPoint Allocation points for pool to be added
     *@param _lpToken Contract address of pool
     *@param _depositFeeBP Represents deposit fee for pool in basis points
     *@param _withUpdate If true, runs massUpdatePool()
     */
    function add(
        uint256 _allocPoint,
        IBEP20 _lpToken,
        uint16 _depositFeeBP,
        bool _withUpdate
    ) public onlyOwner validDepositFeeBP(_depositFeeBP) {
        require(
            poolId1[address(_lpToken)] == 0,
            "YraceSeedMaster::add: seed pool is already in pool"
        );
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock =
            block.number > START_BLOCK ? block.number : START_BLOCK;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolId1[address(_lpToken)] = poolInfo.length + 1;
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                rewardPerShare: 0,
                depositFeeBP: _depositFeeBP
            })
        );
    }

    /**
     *@notice Modifies an added seed pool
     *@param _pid Pool ID of pool to be updated
     *@param _allocPoint Allocation points for pool to be updated
     *@param _depositFeeBP Deposit fee for updated pool in basis points
     *@param _withUpdate If true, runs massUpdatePool()
     */
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        uint16 _depositFeeBP,
        bool _withUpdate
    ) public onlyOwner validDepositFeeBP(_depositFeeBP) {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].depositFeeBP = _depositFeeBP;
    }

    /**
     *@notice runs updatePool() for all pools
     */
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    /**
     *@notice Mint tokens for master contract and updates pools to have latest rewardPerShare
     *@param _pid Pool Id of pool to be updated
     */
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        //won't mine until sale starts after start block
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        //total staked in pool
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 reward =
            getPoolReward(pool.lastRewardBlock, block.number, pool.allocPoint);
        if (yRace.yRaceMaster() == address(this))
            yRace.mint(address(this), reward);
        seedPoolAmount = seedPoolAmount.sub(reward);
        //amount of yRace per token
        pool.rewardPerShare = pool.rewardPerShare.add(
            reward.mul(1e12).div(lpSupply)
        );
        pool.lastRewardBlock = block.number;
    }

    /**
     *@notice Deposits `_amount` from user's balance to pool `_pid`
     *@param _pid Pool ID of pool in which amount will be deposited
     *@param _amount Number of tokens to be deposited
     *@param _referrer Address of the referrer, if any
     */
    function deposit(
        uint256 _pid,
        uint256 _amount,
        address _referrer
    ) public {
        require(
            block.number >= START_BLOCK,
            "YraceSeedMaster: Staking period has not started"
        );
        require(
            block.number < END_BLOCK,
            "YraceSeedMaster: Staking period has ended"
        );

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending =
                user.amount.mul(pool.rewardPerShare).div(1e12).sub(
                    user.rewardDebt
                );
            user.rewardToClaim += pending;
        }
        if (_amount > 0) {
            setReferral(msg.sender, _referrer);
            pool.lpToken.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
            if (pool.depositFeeBP > 0) {
                uint256 depositFee = _amount.mul(pool.depositFeeBP).div(10000);
                pool.lpToken.safeTransfer(feeAddress, depositFee);
                user.amount = user.amount.add(_amount).sub(depositFee);
            } else {
                user.amount = user.amount.add(_amount);
            }
        }

        user.rewardDebt = user.amount.mul(pool.rewardPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    /**
     *@notice Withdraws `_amount` nu. of tokens from pool `_pid`
     *@param _pid Pool ID of pool from which amount will be withdrawn
     *@param _amount Amount to be withdrawn
     */
    function withdraw(uint256 _pid,uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount != 0, "YraceSeedMaster: No tokens staked");
        require(user.amount >= _amount, "YraceSeedMaster : Withdraw not good");
        updatePool(_pid);
        uint256 pending =
            user.amount.mul(pool.rewardPerShare).div(1e12).sub(user.rewardDebt);
        user.rewardToClaim += pending;

        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.rewardPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, user.amount);
    }

    /**
     *@notice Withdraws all tokens from pool `_pid` and sends yRace reward tokens and staked tokens to user
     *@param _pid Pool ID of pool from which tokens will be withdrawn
     */
    function harvest(uint256 _pid) public {
        require(
            block.number >= END_BLOCK,
            "YraceSeedMaster: Staking period is in progress"
        );

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
    
        updatePool(_pid);
        uint256 pending =
            user.amount.mul(pool.rewardPerShare).div(1e12).sub(user.rewardDebt);
        user.rewardToClaim += pending;  

        require(user.rewardToClaim != 0, "YraceSeedMaster: No rewards to claim");

        if (user.rewardToClaim > 0) {
            safeTransferReward(msg.sender, user.rewardToClaim);
            payReferralCommission(msg.sender, user.rewardToClaim);
        }
        
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        user.amount = 0;
        user.rewardToClaim = 0;
    }


    /**
     *@notice To avoid rounding error causing pool to not have enough yRaces.
     *@param _to Address to which amount is transferred
     *@param _amount Amount to be transferred
     */
    function safeTransferReward(address _to, uint256 _amount) internal {
        uint256 bal = yRace.balanceOf(address(this));
        if (_amount > bal) {
            yRace.transfer(_to, bal);
        } else {
            yRace.transfer(_to, _amount);
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
     *@notice Returns amount of yRace to be minted for pool for duration of `_from` to `_to` block
     *@param _from Block number from which multiplier is to calculated
     *@param _to Block number till which multiplier is to calculated
     *@param _allocPoint Allocation points for the pool
     */
    function getPoolReward(
        uint256 _from,
        uint256 _to,
        uint256 _allocPoint
    ) public view returns (uint256) {
        uint256 multiplier = getMultiplier(_from, _to);
        uint256 amount =
            multiplier.mul(REWARD_PER_BLOCK).mul(_allocPoint).div(
                totalAllocPoint
            );
        return seedPoolAmount < amount ? seedPoolAmount : amount;
    }

    /**
     *@notice Returns number of seed pools
     */
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /**
     *@notice Returns amount staked by address `_user` in pool `_pid`
     *@param _pid Pool ID
     *@param _user User address
     */
    function getStakedAmount(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        UserInfo storage user = userInfo[_pid][_user];
        return user.amount;
    }

    /**
     *@notice Returns total reward generated for the user `_user` in pool `_pid`
     *@param _pid Pool ID
     *@param _user User address
     */
    function pendingReward(uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 rewardPerShare = pool.rewardPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply > 0) {
            uint256 reward =
                getPoolReward(
                    pool.lastRewardBlock,
                    block.number,
                    pool.allocPoint
                );
            rewardPerShare = rewardPerShare.add(reward.mul(1e12).div(lpSupply));
        }
        return
            user.rewardToClaim +
            user.amount.mul(rewardPerShare).div(1e12).sub(user.rewardDebt);
    }

    /**
     *@notice Sets Referral Address for a user
     *@param _user User address
     *@param _referrer Referrer address
     */
    function setReferral(address _user, address _referrer) internal {
        if (
            _referrer == address(_referrer) &&
            referrers[_user] == address(0) &&
            _referrer != address(0) &&
            _referrer != _user
        ) {
            referrers[_user] = _referrer;
            referredCount[_referrer] += 1;
            emit Referral(_user, _referrer);
        }
    }

    /**
     *@notice Gets Referral Address for a user
     *@param _user User address
     */
    function getReferral(address _user) public view returns (address) {
        return referrers[_user];
    }

    /**
     *@notice Pays referral commission to the referrer who referred this user.
     *@param _user User address
     *@param _pending Pending rewards of user
     */
    function payReferralCommission(address _user, uint256 _pending) internal {
        address referrer = getReferral(_user);
        if (referrer != address(0) && referrer != _user && refBonusBP > 0) {
            uint256 refBonusEarned = _pending.mul(refBonusBP).div(10000);
            yRace.mint(referrer, refBonusEarned);
            emit ReferralPaid(_user, referrer, refBonusEarned);
        }
    }

    /**
     *@notice Sets fee address
     *@param _feeAddress New fee address
     */
    function setFeeAddress(address _feeAddress) public {
        require(
            msg.sender == feeAddress,
            "YraceSeedMaster: forbidden from change"
        );
        require(
            _feeAddress != address(0),
            "YraceSeedMaster: fee address cant be zero address"
        );
        feeAddress = _feeAddress;
    }
}
