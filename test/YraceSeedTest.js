const { expectRevert, time, BN } = require('@openzeppelin/test-helpers')
const YraceToken = artifacts.require('YraceToken')
const YraceSeedMaster = artifacts.require('YraceSeedMaster')
const MockBEP20 = artifacts.require('MockBEP20')

contract('YraceSeedMaster', ([alice, bob, carol, dev, eliah, minter, receiveInit]) => {
    beforeEach(async () => {
        this.YraceToken = await YraceToken.new({ from: alice })

    })

    it('should set correct state variables', async () => {
        this.master = await YraceSeedMaster.new(this.YraceToken.address, 100, 5, { from: alice })
        await this.YraceToken.setMaster(this.master.address, { from: alice })
        
        const yRace = await this.master.yRace()
        assert.equal(yRace.valueOf(), this.YraceToken.address)

        assert.equal((await this.master.REWARD_PER_BLOCK()).valueOf(), 100)
        assert.equal((await this.master.START_BLOCK()).valueOf(), 5)
        assert.equal((await this.master.END_BLOCK()).valueOf(), 200005)
    })

    it('should allow only master farmer can mint', async () => {
        this.master = await YraceSeedMaster.new(this.YraceToken.address, 1234, 100, { from: alice })
        await this.YraceToken.setMaster(minter, { from: alice })

        assert.equal((await this.YraceToken.yRaceSeedMaster()).valueOf(), minter)
        await expectRevert(
            (this.YraceToken.mint(alice, '10000000000', { from: alice })),
            "only master farmer can mint")

        await this.YraceToken.mint(alice, '10000000000', { from: minter })
        assert.equal((await this.YraceToken.balanceOf(alice)).valueOf(), "10000000000")

    })

    context('With LP token added to the field', () => {
        beforeEach(async () => {
            this.lp = await MockBEP20.new('Token1', 'TK1', '10000000000', { from: minter })
            await this.lp.transfer(alice, '1000', { from: minter })
            await this.lp.transfer(bob, '1000', { from: minter })
            await this.lp.transfer(carol, '1000', { from: minter })
            await this.lp.transfer(dev, '1000', { from: minter })
            await this.lp.transfer(eliah, '1000', { from: minter })
            this.lp2 = await MockBEP20.new('Token2', 'TK2', '10000000000', { from: minter })
            await this.lp2.transfer(alice, '1000', { from: minter })
            await this.lp2.transfer(bob, '1000', { from: minter })
            await this.lp2.transfer(carol, '1000', { from: minter })
            await this.lp2.transfer(dev, '1000', { from: minter })
            await this.lp2.transfer(eliah, '1000', { from: minter })
        })

        it('should correct add new pool and set pool', async () => {
            // 100 per block, start at block 100
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 100, 100, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, true, { from: alice})
            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.lp.address)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).lastRewardBlock.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).rewardPerShare.valueOf(), '0')
            assert.equal((await this.master.poolId1(this.lp.address)).valueOf(), '1')

            await expectRevert(
                this.master.add('100', this.lp.address, true, { from: alice}),
                "YraceSeedMaster::add: seed pool is already in pool"
            )
            await expectRevert(
                this.master.add('100', this.lp2.address, true, { from: bob}),
                "Ownable: caller is not the owner"
            )

            await this.master.add('300', this.lp2.address, true, { from: alice})
            assert.equal((await this.master.poolInfo(1)).lpToken.valueOf(), this.lp2.address)
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '300')
            assert.equal((await this.master.poolInfo(1)).lastRewardBlock.valueOf().toString(), '100')
            assert.equal((await this.master.poolInfo(1)).rewardPerShare.valueOf(), '0')
            assert.equal((await this.master.poolId1(this.lp2.address)).valueOf(), '2')

            assert.equal((await this.master.totalAllocPoint()).valueOf(), '400')

            await this.master.set(1, 400, true, { from: alice})
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '400')
            assert.equal((await this.master.totalAllocPoint()).valueOf(), '500')

            await time.advanceBlockTo(101);
            assert.equal((await this.master.getNewRewardPerBlock(0)).valueOf(), "100")
            assert.equal((await this.master.getNewRewardPerBlock(1)).valueOf(), "20")
            assert.equal((await this.master.getNewRewardPerBlock(2)).valueOf(), "80")
        })

        it('should allow emergency withdraw', async () => {
            // 211713 per block farming rate starting at block 100
            //this.master = await LuaMasterFarmer.new(this.lua.address, dev, '100', '100', '900', { from: alice })
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 211713, 100, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await time.advanceBlockTo(110);
            await this.master.deposit(0, '100', { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            await this.master.emergencyWithdraw(0, { from: bob })
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000')
        })

        it('should correct deposit', async () => {
           this.master = await YraceSeedMaster.new(this.YraceToken.address, 20, 100, { from: alice })
           await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await expectRevert(
                this.master.deposit(0, '100', { from: bob }),
                "Staking period has not started"
            )    

            await time.advanceBlockTo(110);

            await this.master.deposit(0, 100, { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '100')

            // assert.equal((await this.master.pendingReward(0, bob)).valueOf(), "0")
            assert.equal((await this.master.userInfo(0, bob)).rewardDebt.valueOf(), "0")
            assert.equal((await this.master.poolInfo(0)).rewardPerShare.valueOf(), "0")

            await this.lp.approve(this.master.address, '1000', { from: carol })
            await this.master.deposit(0, 50, { from: carol })
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '950')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '150')
            
            console.log((await this.master.poolInfo(0)).rewardPerShare.valueOf())

        })

        it('should give out YraceToken only after end of staking period', async () => {
            // 20 per block farming rate starting at block 400 
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 20, 400, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await time.advanceBlockTo('390')
            await this.YraceToken.transferOwnership(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, true)
            await this.master.add('100', this.lp2.address, true)  

            await this.lp.approve(this.master.address, '1000', { from: bob }) 
            await this.lp.approve(this.master.address, '1000', { from: carol }) 

            await time.advanceBlockTo('399')            
            await this.master.deposit(0, '10', { from: bob }) // 400
            await this.master.deposit(0, '10', { from: carol })
            await time.advanceBlockTo('700')

            await this.master.withdraw(0, { from: bob }), // block 296

            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')

            await time.advanceBlockTo('1000');
            await this.master.withdraw(0, { from: bob })
            console.log(await this.YraceToken.balanceOf(bob))
            console.log(await this.master.seedPoolAmount())

            await this.master.withdraw(0, { from: bob })
            await this.master.withdraw(0, { from: bob })
            // console.log(await this.YraceToken.balanceOf(bob).valueOf())

        })

        it('should not distribute YraceToken if no one deposit', async () => {
            // 20 per block farming rate starting at block 500 
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 20, 500, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.YraceToken.transferOwnership(this.master.address, { from: alice })
            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await time.advanceBlockTo('510')
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            await time.advanceBlockTo('520')
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            await time.advanceBlockTo('530')
            await this.master.updatePool(0) // block 531
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.YraceToken.balanceOf(dev)).valueOf(), '0')
            await this.master.deposit(0, '10', { from: bob }) // block 532
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '10')
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.YraceToken.balanceOf(dev)).valueOf(), '0')
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '990')

            await time.advanceBlockTo('1000')
            await this.master.withdraw(0, { from: bob })
            assert.notEqual((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
        })

        it('should equally distribute', async () => {
           this.master = await YraceSeedMaster.new(this.YraceToken.address, 20, 200, { from: alice })
           await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp.approve(this.master.address, '1000', { from: carol })
            await this.lp.approve(this.master.address, '1000', { from: eliah })
            await this.lp.approve(this.master.address, '1000', { from: dev })

            await this.master.add('100', this.lp2.address, true)
            await this.lp2.approve(this.master.address, '1000', { from: alice })
            await this.lp2.approve(this.master.address, '1000', { from: bob })
            await this.lp2.approve(this.master.address, '1000', { from: carol })
            await this.lp2.approve(this.master.address, '1000', { from: eliah })
            await this.lp2.approve(this.master.address, '1000', { from: dev })

            // console.log(await time.latestBlock());
            await time.advanceBlockTo('199')
            await this.master.deposit(0, 10, { from: alice })
            await this.master.deposit(0, 10, { from: bob })
            await this.master.deposit(0, 10, { from: carol })
            await this.master.deposit(0, 10, { from: dev })
            await this.master.deposit(1, 10, { from: eliah })

          // ----- claiming anytime after sale end (equal distribution)


            await time.advanceBlockTo('900')

            await this.master.withdraw(0, { from: alice })
            console.log(await this.YraceToken.balanceOf(alice));
            console.log(await this.master.seedPoolAmount());

            await this.master.withdraw(0, { from: bob })
            console.log(await this.YraceToken.balanceOf(bob));
            console.log(await this.master.seedPoolAmount());

            await this.master.withdraw(0, { from: carol })
            console.log(await this.YraceToken.balanceOf(carol));
            console.log(await this.master.seedPoolAmount());

            await this.master.withdraw(0, { from: dev })
            console.log(await this.YraceToken.balanceOf(dev));
            console.log(await this.master.seedPoolAmount());

            await this.master.withdraw(1, { from: eliah })
            console.log(await this.YraceToken.balanceOf(eliah));
            console.log(await this.master.seedPoolAmount());            

            console.log(await this.YraceToken.balanceOf(this.master.address));

            // multiple withdraw (OK)
            await expectRevert(
                this.master.withdraw(0, { from: alice }),
                "YraceMaster: No tokens staked"
            );
            console.log(await this.YraceToken.balanceOf(alice));
            console.log(await this.master.seedPoolAmount());


        })

        it('should properly distribute at different deposit amounts', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 20, 200, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address, true)
             await this.lp2.approve(this.master.address, '1000', { from: eliah })

             // console.log(await time.latestBlock());
             await time.advanceBlockTo('199')
             await this.master.deposit(0, 10, { from: alice })
             await this.master.deposit(0, 20, { from: bob })
             await this.master.deposit(0, 30, { from: carol })
             await this.master.deposit(0, 40, { from: dev })
             await this.master.deposit(1, 10, { from: eliah })
 
           // ----- claiming anytime after sale end (equal distribution)

             await time.advanceBlockTo('900')
 
             await this.master.withdraw(0, { from: alice })
             console.log(await this.YraceToken.balanceOf(alice)); //~500
             console.log(await this.master.seedPoolAmount());
 
             await this.master.withdraw(0, { from: bob })
             console.log(await this.YraceToken.balanceOf(bob));   //~1000
             console.log(await this.master.seedPoolAmount());
 
             await this.master.withdraw(0, { from: carol })
             console.log(await this.YraceToken.balanceOf(carol)); //~1500
             console.log(await this.master.seedPoolAmount());
 
             await this.master.withdraw(0, { from: dev })
             console.log(await this.YraceToken.balanceOf(dev));   //~2000
             console.log(await this.master.seedPoolAmount());
 
             await this.master.withdraw(1, { from: eliah })
             console.log(await this.YraceToken.balanceOf(eliah)); //~5000
             console.log(await this.master.seedPoolAmount());            
 
             console.log(await this.YraceToken.balanceOf(this.master.address));
 
         })

        it('should distribute properly when multiple deposit', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 20, 200, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: eliah })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address, true)
 
             // console.log(await time.latestBlock());
             await time.advanceBlockTo('299')
             await this.master.deposit(0, 10, { from: alice }) 
             await this.master.deposit(0, 10, { from: bob })
             await time.advanceBlockTo('499')
             console.log(await this.master.pendingReward(0,alice ));
             await this.master.deposit(0, 10, { from: alice })
             console.log(await this.master.pendingReward(0, alice));
           // ----- claiming anytime after sale end (equal distribution)
           await time.advanceBlockTo('599')
           await this.master.deposit(0, 10, { from: alice })
           console.log(await this.master.pendingReward(0, alice));
             await time.advanceBlockTo('900')
             console.log(await this.master.pendingReward(0,alice ));
             await this.master.withdraw(0, { from: alice })
             console.log(await this.YraceToken.balanceOf(alice)); //2333
             console.log(await this.master.seedPoolAmount());
 
             await this.master.withdraw(0, { from: bob })
             console.log(await this.YraceToken.balanceOf(bob));  //1666
             console.log(await this.master.seedPoolAmount());            
 
             console.log(await this.YraceToken.balanceOf(this.master.address));
        }) 

    })
})