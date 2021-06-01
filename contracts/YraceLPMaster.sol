// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./mocks/Ownable.sol";
import "./libs/SafeBEP20.sol";
import "./libs/SafeMath.sol";
import "./YraceToken.sol";


contract YraceLPMaster is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of yRaces
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.rewardPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `rewardPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IBEP20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool.
        uint256 lastRewardBlock;
        uint256 rewardPerShare;   //amount of yRace per pool token
        uint16 depositFeeBP;      // Deposit fee in basis points
    }

    // The yRace TOKEN!
    YraceToken public yRace;
    // yRace tokens created per block.
    uint256 public REWARD_PER_BLOCK;
    // Number of blocks in each stage before stage 4 (will be 200,000)
    uint256 public BLOCKS_PER_STAGE;
    // Stages start block number
    uint256 private STAGE2;
    uint256 private STAGE3;
    uint256 private STAGE4;
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // poolId1 count from 1, subtraction 1 before using with poolInfo
    mapping(address => uint256) public poolId1; 
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when yRace mining starts.
    uint256 public START_BLOCK;
    // Referral Bonus in basis points. Initially set to 2%
    uint256 public refBonusBP = 200;
    // Max referral commission rate: 20%.
    uint16 public constant MAXIMUM_REFERRAL_BP = 2000;
    // Deposit Fee address
    address public feeAddress;
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
        uint256 _BLOCKS_PER_STAGE,
        address _feeAddress
    ) {
        yRace = _yRace;
        REWARD_PER_BLOCK = _rewardPerBlock;
        START_BLOCK = _START_BLOCK;
        BLOCKS_PER_STAGE = _BLOCKS_PER_STAGE; 
        STAGE2 = START_BLOCK.add(BLOCKS_PER_STAGE);
        STAGE3 = STAGE2.add(BLOCKS_PER_STAGE);
        STAGE4 = STAGE3.add(BLOCKS_PER_STAGE);
        feeAddress = _feeAddress;
    }

    // -------- For manage pool ---------
    function add(uint256 _allocPoint, IBEP20 _lpToken,uint16 _depositFeeBP, bool _withUpdate) public onlyOwner {
        require(_depositFeeBP <= 10000, "add: invalid deposit fee basis points");
        require(poolId1[address(_lpToken)] == 0, "YraceLPMaster::add: lp pool is already in pool");
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
            rewardPerShare: 0,
            depositFeeBP:_depositFeeBP
        }));
    }

    function set(uint256 _pid, uint256 _allocPoint,uint16 _depositFeeBP, bool _withUpdate) public onlyOwner {
        require(_depositFeeBP <= 10000, "add: invalid deposit fee basis points");
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].depositFeeBP = _depositFeeBP;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 reward = multiplier.mul(REWARD_PER_BLOCK).mul(pool.allocPoint).div(totalAllocPoint);
        yRace.mint(address(this), reward);
        pool.rewardPerShare = pool.rewardPerShare.add(reward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to Master for yRace allocation.
    function deposit(uint256 _pid, uint256 _amount, address _referrer) public {
        require(block.number>=START_BLOCK,"YraceLPMaster: Staking period has not started");
        require(_referrer == address(_referrer),"YraceLPMaster: Invalid referrer address");

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending =
                user.amount.mul(pool.rewardPerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                safeTransferReward(msg.sender, pending);
                payReferralCommission(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            setReferral(msg.sender, _referrer);
            pool.lpToken.safeTransferFrom(address(msg.sender),address(this),_amount);
            if (pool.depositFeeBP > 0) {
                uint256 depositFee = _amount.mul(pool.depositFeeBP).div(10000);
                pool.lpToken.safeTransfer(feeAddress, depositFee);
                user.amount = user.amount.add(_amount).sub(depositFee);
            } 
            else {
                user.amount = user.amount.add(_amount);
            }
        }
        user.rewardDebt = user.amount.mul(pool.rewardPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from Master.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "YraceLPMaster : Withdraw not good");
        require(user.amount != 0 , "YraceMaster: No tokens staked");
        updatePool(_pid);
        uint256 pending =
            user.amount.mul(pool.rewardPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            safeTransferReward(msg.sender, pending);
            payReferralCommission(msg.sender, pending);
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.rewardPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe yRace transfer function, just in case if rounding error causes pool to not have enough yRaces.
    function safeTransferReward(address _to, uint256 _amount) internal {
        uint256 yRaceBal = yRace.balanceOf(address(this));
        if (_amount > yRaceBal) {
            yRace.transfer(_to, yRaceBal);
        } else {
            yRace.transfer(_to, _amount);
        }
    }

    function getStakedAmount(uint _pid, address _user) public view returns (uint256) {
        UserInfo storage user = userInfo[_pid][_user];
        return user.amount;
    }
    // Return reward multiplier over the given _from to _to block.
      function getMultiplier(uint256 _from, uint256 _to)public view returns (uint256)
    {
        // Temporary variable for calculating rewards
        uint256 bonus = 0;
        if (_to <= START_BLOCK || _from >= _to) {
            return 0;
        } 
        else if (_to > START_BLOCK && _to <= STAGE2) {
            if (_from <= START_BLOCK) {
                return _to.sub(START_BLOCK).mul(10);
            } else {
                return _to.sub(_from).mul(10);
            }
        } 
        else if (_to > STAGE2 && _to <= STAGE3) {
            if (_from <= START_BLOCK) {
                bonus = BLOCKS_PER_STAGE.mul(10);
                return bonus.add(_to.sub(STAGE2).mul(5));
            } else if (_from > START_BLOCK && _from <= STAGE2) {
                bonus = STAGE2.sub(_from).mul(10);
                return bonus.add(_to.sub(STAGE2).mul(5));
            } else {
                return _to.sub(_from).mul(5);
            }
        } 
        else if (_to > STAGE3 && _to <= STAGE4) {
            if (_from <= START_BLOCK) {
                bonus = BLOCKS_PER_STAGE.mul(10);
                bonus = bonus.add(BLOCKS_PER_STAGE.mul(5));
                return bonus.add(_to.sub(STAGE3).mul(3));
            } else if (_from > START_BLOCK && _from <= STAGE2) {
                bonus = STAGE2.sub(_from).mul(10);
                bonus = bonus.add(BLOCKS_PER_STAGE.mul(5));
                return bonus.add(_to.sub(STAGE3).mul(3));
            } else if (_from > STAGE2 && _from <= STAGE3) {
                bonus = STAGE3.sub(_from).mul(5);
                return bonus.add(_to.sub(STAGE3).mul(3));
            } else {
                return _to.sub(_from).mul(3);
            }
        } 
        else if (_to > STAGE4) {
            if (_from <= START_BLOCK) {
                bonus = BLOCKS_PER_STAGE.mul(10);
                bonus = bonus.add(BLOCKS_PER_STAGE.mul(5));
                bonus = bonus.add(BLOCKS_PER_STAGE.mul(3));
                return bonus.add(_to.sub(STAGE4));
            } else if (_from > START_BLOCK && _from <= STAGE2) {
                bonus = STAGE2.sub(_from).mul(10);
                bonus = bonus.add(BLOCKS_PER_STAGE.mul(5));
                bonus = bonus.add(BLOCKS_PER_STAGE.mul(3));
                return bonus.add(_to.sub(STAGE4));
            } else if (_from > STAGE2 && _from <= STAGE3) {
                bonus = STAGE3.sub(_from).mul(5);
                bonus = bonus.add(BLOCKS_PER_STAGE.mul(3));
                return bonus.add(_to.sub(STAGE4));
            } else if (_from > STAGE3 && _from <= STAGE4) {
                bonus = STAGE4.sub(_from).mul(3);
                return bonus.add(_to.sub(STAGE4));
            } else{
                return bonus.add(_to.sub(_from));
            }
        }
        return 0;
    }

    // View function to see pending yRaces on frontend.
    function pendingReward(uint256 _pid, address _user)external view returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 rewardPerShare = pool.rewardPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock,block.number);
            uint256 reward = multiplier.mul(REWARD_PER_BLOCK).mul(pool.allocPoint).div(totalAllocPoint);
            rewardPerShare = rewardPerShare.add(reward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(rewardPerShare).div(1e12).sub(user.rewardDebt);
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
    
    // Referral Bonus in basis points.
    // Initially set to 2%, this this the ability to increase or decrease the Bonus percentage based on
    // community voting and feedback.
    function updateReferralBonusBp(uint256 _newRefBonus) public onlyOwner {
        require(_newRefBonus <= MAXIMUM_REFERRAL_BP, "YraceLPMaster : invalid referral bonus basis points");
        require(_newRefBonus != refBonusBP, "YraceLPMaster  : same bonus bp set");
        uint256 previousRefBonus = refBonusBP;
        refBonusBP = _newRefBonus;
        emit ReferralBonusChanged(previousRefBonus, _newRefBonus);
    }

    function setFeeAddress(address _feeAddress) public {
        require(msg.sender == feeAddress, "YraceLPMaster: forbidden from change");
        require(_feeAddress != address(0), "YraceLPMaster: fee address cant be zero address");
        feeAddress = _feeAddress;
    }
}