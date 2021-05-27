// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "./Ownable.sol";
import "./SafeBEP20.sol";
import "./SafeMath.sol";
import "./YraceToken.sol";


contract YraceSeedMaster is Ownable { 
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    struct UserInfo {
        uint256 amount;         // How many LP tokens the user has provided.
        uint256 rewardDebt;     // Reward debt. See explanation below.
        uint256 rewardToClaim;  //Total reward to be claimed
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
        IBEP20 lpToken;          // seed pool contract address
        uint256 allocPoint;      
        uint256 lastRewardBlock; 
        uint256 rewardPerShare; //amount of yRace per pool token
    }

    YraceToken public yRace;
    
    uint256 public REWARD_PER_BLOCK;
    uint256 public START_BLOCK;      //start of staking period
    uint256 public END_BLOCK;          // start of claiming period

    // Info of each pool.
    PoolInfo[] public poolInfo;
    mapping(address => uint256) public poolId1; // poolId1 count from 1, subtraction 1 before using with poolInfo
    // Info of each user that stakes LP tokens. pid => user address => info
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    //Total maximum rewards from seed pool
    uint256 public seedPoolAmount;
    // Referral Bonus in basis points. Initially set to 2% (1% = 100 BP)
    uint256 public refBonusBP = 200;
    // Max referral commission rate: 20%.
    uint16 public constant MAXIMUM_REFERRAL_BP = 2000;
    // Referral Mapping
    mapping(address => address) public referrers; // account_address -> referrer_address
    mapping(address => uint256) public referredCount; // referrer_address -> num_of_referred


    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event SendReward(address indexed user, uint256 indexed pid, uint256 amount);
    event Referral(address indexed _referrer, address indexed _user);
    event ReferralPaid(address indexed _user, address indexed _userTo, uint256 _reward);
    event ReferralBonusChanged(uint256 _old, uint256 _new);

    constructor(
        YraceToken _yRace,
        uint256 _rewardPerBlock,
        uint256 _START_BLOCK,
        uint256 _END_BLOCK,
        uint256 _seedPoolAmount
    ){
        yRace = _yRace;
        REWARD_PER_BLOCK = _rewardPerBlock;
        START_BLOCK = _START_BLOCK;
        END_BLOCK = _END_BLOCK;
        seedPoolAmount = _seedPoolAmount;
    }

    // -------- For manage pool ---------
    function add(uint256 _allocPoint, IBEP20 _lpToken, bool _withUpdate) public onlyOwner {
        require(poolId1[address(_lpToken)] == 0, "YraceSeedMaster::add: seed pool is already in pool");
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > START_BLOCK ? block.number : START_BLOCK;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolId1[address(_lpToken)] = poolInfo.length + 1;
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            rewardPerShare: 0
        }));
    }

    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) { //won't mine until sale starts after start block
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this)); //total staked in pool
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 reward = getPoolReward(pool.lastRewardBlock, block.number, pool.allocPoint); 
        if(yRace.yRaceMaster()==address(this))
        yRace.mint(address(this), reward);
        seedPoolAmount = seedPoolAmount.sub(reward);     
        pool.rewardPerShare = pool.rewardPerShare.add(reward.mul(1e12).div(lpSupply)); //amount of yRace per token
        pool.lastRewardBlock = block.number;
    }

    //Deposit Pool tokens into master contract for yRace allocation with referral.
    function deposit(uint256 _pid, uint256 _amount, address _referrer) public {
        require(block.number>=START_BLOCK,"YraceMaster: Staking period has not started");
        require(block.number<END_BLOCK,"YraceMaster: Staking period has ended");
        require(_referrer == address(_referrer),"YraceMaster: Invalid referrer address");

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending =user.amount.mul(pool.rewardPerShare).div(1e12).sub(user.rewardDebt);
            user.rewardToClaim += pending;
        }
        if (_amount > 0) {
            setReferral(msg.sender, _referrer);
            pool.lpToken.safeTransferFrom(address(msg.sender),address(this),_amount);
            user.amount = user.amount.add(_amount);
        }
        
        user.rewardDebt = user.amount.mul(pool.rewardPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    function withdraw(uint256 _pid) public {
        require(block.number>=END_BLOCK,"YraceMaster: Staking period is in progress");
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        
        require( user.amount != 0 , "YraceMaster: No tokens staked");
            
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.rewardPerShare).div(1e12).sub(user.rewardDebt);
        user.rewardToClaim +=pending;

        if(user.rewardToClaim > 0) {
            safeTransferReward(msg.sender, user.rewardToClaim);
            payReferralCommission(msg.sender, user.rewardToClaim);
        }
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        user.amount = 0;

        emit Withdraw(msg.sender, _pid, user.amount);
    }

    function safeTransferReward(address _to, uint256 _amount) internal {
        uint256 bal = yRace.balanceOf(address(this));
        if (_amount > bal) {
            yRace.transfer(_to, bal);
        } else {
            yRace.transfer(_to, _amount);
        }
    }

    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
		if (_to <= START_BLOCK || _from >= _to) {
			return 0;
		} 
        else if (_to > START_BLOCK && _to <= END_BLOCK) {
			if (_from <= START_BLOCK) {
				return _to.sub(START_BLOCK);
			} 
            else {
				return _to.sub(_from);
			}
		} 
        else {
            if(_from <= END_BLOCK) {
                return END_BLOCK.sub(_from);
            } 
            else {
                return 0;
            }
        }
    }

    function getPoolReward(uint256 _from, uint256 _to, uint256 _allocPoint) public view returns (uint) {
        uint256 multiplier = getMultiplier(_from, _to);
        uint256 amount = multiplier.mul(REWARD_PER_BLOCK).mul(_allocPoint).div(totalAllocPoint);
        uint256 amountCanMint = seedPoolAmount;
        return amountCanMint < amount ? amountCanMint : amount;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function getStakedAmount(uint _pid, address _user) public view returns (uint256) {
        UserInfo storage user = userInfo[_pid][_user];
        return user.amount;
    }
    function pendingReward(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 rewardPerShare = pool.rewardPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply > 0) {
            uint256 reward = getPoolReward(pool.lastRewardBlock, block.number, pool.allocPoint);
            rewardPerShare = rewardPerShare.add(reward.mul(1e12).div(lpSupply));
        }
        return user.rewardToClaim + user.amount.mul(rewardPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Set Referral Address for a user
    function setReferral(address _user, address _referrer) internal {
        if (_referrer == address(_referrer) && referrers[_user] == address(0) && _referrer != address(0) && _referrer != _user) {
            referrers[_user] = _referrer;
            referredCount[_referrer] += 1;
            emit Referral(_user, _referrer);
        }
    }

    // Get Referral Address for a Account
    function getReferral(address _user) public view returns (address) {
        return referrers[_user];
    }

    // Pay referral commission to the referrer who referred this user.
    function payReferralCommission(address _user, uint256 _pending) internal {
        address referrer = getReferral(_user);
        if (referrer != address(0) && referrer != _user && refBonusBP > 0) {
            uint256 refBonusEarned = _pending.mul(refBonusBP).div(10000);
            yRace.mint(referrer, refBonusEarned);
            emit ReferralPaid(_user, referrer, refBonusEarned);
        }
    }
}