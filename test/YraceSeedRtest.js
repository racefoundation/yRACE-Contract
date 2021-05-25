const { expectRevert, time, constants } = require('@openzeppelin/test-helpers')
const YraceToken = artifacts.require('YraceToken')
const YraceSeedMaster = artifacts.require('YraceSeedMaster')
const MockBEP20 = artifacts.require('MockBEP20')

contract('YraceSeedMaster', ([alice, bob, carol, dev, eliah, minter, receiveInit]) => {
    beforeEach(async () => {
        this.YraceToken = await YraceToken.new({ from: alice })

    })

    it('should set correct state variables', async () => {
        this.master = await YraceSeedMaster.new(this.YraceToken.address, 100, 5,505,10000, { from: alice })
        await this.YraceToken.setMaster(this.master.address, { from: alice })
        
        const yRace = await this.master.yRace()
        assert.equal(yRace.valueOf(), this.YraceToken.address)

        assert.equal((await this.master.REWARD_PER_BLOCK()).valueOf(), 100)
        assert.equal((await this.master.START_BLOCK()).valueOf(), 5)
        assert.equal((await this.master.END_BLOCK()).valueOf(), 505)
        assert.equal((await this.master.seedPoolAmount()).valueOf(), 10000)
    })

    it('should allow only master farmer can mint', async () => {
        this.master = await YraceSeedMaster.new(this.YraceToken.address, 1234, 100,500,10000, { from: alice })
        await this.YraceToken.setMaster(minter, { from: alice })

        assert.equal((await this.YraceToken.yRaceMaster()).valueOf(), minter)
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
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 100, 100,500,10000, { from: alice })
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
        })

        // it('should allow emergency withdraw', async () => {
        //     this.master = await YraceSeedMaster.new(this.YraceToken.address, 211713, 100, { from: alice })
        //     await this.YraceToken.setMaster(this.master.address, { from: alice })

        //     await this.master.add('100', this.lp.address, true)
        //     await this.lp.approve(this.master.address, '1000', { from: bob })

        //     await time.advanceBlockTo(110);
        //     await this.master.deposit(0, '100', { from: bob })
        //     assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
        //     await this.master.emergencyWithdraw(0, { from: bob })
        //     assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
        //     assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000')
        // })

        it('should correct deposit', async () => {
           this.master = await YraceSeedMaster.new(this.YraceToken.address, 20, 100,600,10000, { from: alice })
           await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })

            // await expectRevert(
            //     this.master.deposit(0, '100', { from: bob }),
            //     "Staking period has not started"
            // )    

            await time.advanceBlockTo(110);

            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '100')

            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), "0")
            assert.equal((await this.master.userInfo(0, bob)).rewardDebt.valueOf(), "0")
            assert.equal((await this.master.poolInfo(0)).rewardPerShare.valueOf(), "0")

            await this.lp.approve(this.master.address, '1000', { from: carol })
            await this.master.deposit(0, 50,constants.ZERO_ADDRESS, { from: carol })
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '950')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '150')
            
            // console.log((await this.master.poolInfo(0)).rewardPerShare.valueOf())

        })

        it('should give out YraceToken only after end of staking period', async () => {
            // 10 per block farming rate starting at block 200 
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 200,300,1000, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            // await time.advanceBlockTo('190')
            await this.YraceToken.transferOwnership(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, true)
            await this.master.add('100', this.lp2.address, true)  

            await this.lp.approve(this.master.address, '1000', { from: bob }) 
            await this.lp.approve(this.master.address, '1000', { from: carol }) 

            await time.advanceBlockTo('199')            
            await this.master.deposit(0, '10',constants.ZERO_ADDRESS, { from: bob }) // 200
            await this.master.deposit(0, '10',constants.ZERO_ADDRESS, { from: carol })
            await time.advanceBlockTo('250')

            await expectRevert(
                this.master.withdraw(0, { from: bob }), 
                "YraceMaster: Staking period is in progress"
            )
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
            
            await time.advanceBlockTo('300')
            await this.master.withdraw(0, { from: bob })
            assert.equal(await this.YraceToken.balanceOf(bob).valueOf(),'252')

        })

        it('should not distribute YraceToken if no one deposit', async () => {
            // 10 per block farming rate starting at block 400 
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 400,500,1000, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.YraceToken.transferOwnership(this.master.address, { from: alice })
            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await time.advanceBlockTo('430')
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            await time.advanceBlockTo('440')
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            await time.advanceBlockTo('450')
            await this.master.updatePool(0) 
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.YraceToken.balanceOf(dev)).valueOf(), '0')
            await time.advanceBlockTo('459')
            await this.master.deposit(0, '10',constants.ZERO_ADDRESS, { from: bob }) 
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '10')
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.YraceToken.balanceOf(dev)).valueOf(), '0')
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '990')

            await time.advanceBlockTo('500')
            await this.master.withdraw(0, { from: bob })
            assert.equal(await this.YraceToken.balanceOf(bob).valueOf(),'400')
        })

        it('should equally distribute', async () => {
           this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 600,700,1000, { from: alice })
           await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp.approve(this.master.address, '1000', { from: carol })
            await this.lp.approve(this.master.address, '1000', { from: dev })

            await this.master.add('100', this.lp2.address, true)
            await this.lp2.approve(this.master.address, '1000', { from: eliah })


            // console.log(await time.latestBlock());
            await time.advanceBlockTo('599')
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice })
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: carol })
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: dev })
            await this.master.deposit(1, 10,constants.ZERO_ADDRESS, { from: eliah })

          // ----- claiming anytime after sale end (equal distribution)


            await time.advanceBlockTo('700')

            await this.master.withdraw(0, { from: alice })
            assert.equal(await this.YraceToken.balanceOf(alice),'130');

            await this.master.withdraw(0, { from: bob })
            assert.equal(await this.YraceToken.balanceOf(bob),'125');

            await this.master.withdraw(0, { from: carol })
            assert.equal(await this.YraceToken.balanceOf(carol),'123');

            await this.master.withdraw(0, { from: dev })
            assert.equal(await this.YraceToken.balanceOf(dev),'121');

            await this.master.withdraw(1, { from: eliah })
            assert.equal(await this.YraceToken.balanceOf(eliah),'480');           

            // multiple withdraw (not OK)
            await expectRevert(
                this.master.withdraw(0, { from: alice }),
                "YraceMaster: No tokens staked"
            );
            assert.notEqual(await this.master.seedPoolAmount(),'0');


        })

        it('should properly distribute at different deposit amounts', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 800,900,1000, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address, true)
             await this.lp2.approve(this.master.address, '1000', { from: eliah })

             // console.log(await time.latestBlock());
             await time.advanceBlockTo('799')
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice })
             await this.master.deposit(0, 20,constants.ZERO_ADDRESS, { from: bob })
             await this.master.deposit(0, 30,constants.ZERO_ADDRESS, { from: carol })
             await this.master.deposit(0, 40,constants.ZERO_ADDRESS, { from: dev })
             await this.master.deposit(1, 10,constants.ZERO_ADDRESS, { from: eliah })
 
           // ----- claiming anytime after sale end (equal distribution)

             await time.advanceBlockTo('900')
 
             await this.master.withdraw(0, { from: alice })
             assert.equal(await this.YraceToken.balanceOf(alice),'55');
             await this.master.withdraw(0, { from: bob })
             assert.equal(await this.YraceToken.balanceOf(bob),'101');
             await this.master.withdraw(0, { from: carol })
             assert.equal(await this.YraceToken.balanceOf(carol),'148');
             await this.master.withdraw(0, { from: dev })
             assert.equal(await this.YraceToken.balanceOf(dev),'194');
             await this.master.withdraw(1, { from: eliah })
             assert.equal(await this.YraceToken.balanceOf(eliah),'480');
         })

        it('should distribute properly when multiple deposit', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 1000,1100,1000, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: eliah })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address, true)
 
             // console.log(await time.latestBlock());
             await time.advanceBlockTo('999')
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice }) 
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })
             await time.advanceBlockTo('1050')
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice })

            // ----- claiming anytime after sale end (equal distribution)
             await time.advanceBlockTo('1100')
             await this.master.withdraw(0, { from: alice })
             assert.equal(await this.YraceToken.balanceOf(alice),'293');
 
             await this.master.withdraw(0, { from: bob })
             assert.equal(await this.YraceToken.balanceOf(bob),'206');         
        }) 

        it('should pay to referrer address if a user is referred by it', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 1200,1300,1000, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
 
             await this.master.add('100', this.lp2.address, true)
 
             await time.advanceBlockTo('1199')
             await this.master.deposit(0, 10,carol, { from: alice }) 
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })
             assert.equal(await this.YraceToken.balanceOf(carol),'0'); 

             await time.advanceBlockTo('1300')
             await this.master.withdraw(0, { from: alice })
             await this.master.withdraw(0, { from: bob })

             assert.equal(await this.YraceToken.balanceOf(alice),'252'); 
             assert.equal(await this.YraceToken.balanceOf(bob),'247'); 
             assert.equal(await this.YraceToken.balanceOf(carol),'5'); 
        }) 

        it('should update referral bonus properly', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 1400,1500,1000, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await this.master.add('100', this.lp2.address, true)

            await time.advanceBlockTo('1399')
            await this.master.deposit(0, 10,carol, { from: alice }) 
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })        

            await expectRevert(
                this.master.updateReferralBonus(3000),
                "YraceMaster: invalid referral bonus basis points"
            )
            await expectRevert(
                this.master.updateReferralBonus(200),
                "YraceMaster: same bonus set"
            )

            await this.master.updateReferralBonus(1000)

            assert.equal(await this.YraceToken.balanceOf(carol),'0'); 

            await time.advanceBlockTo('1500')
            await this.master.withdraw(0, { from: alice })
            await this.master.withdraw(0, { from: bob })

            assert.equal(await this.YraceToken.balanceOf(alice),'252'); 
            assert.equal(await this.YraceToken.balanceOf(bob),'247'); 
            assert.equal(await this.YraceToken.balanceOf(carol),'25');         
        }) 

        it('should not be referred by multiple referrers', async () => {
            this.master = await YraceSeedMaster.new(this.YraceToken.address, 10, 1600,1700,1000, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
            await this.master.add('100', this.lp.address, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await this.master.add('100', this.lp2.address, true)

            await time.advanceBlockTo('1599')
            await this.master.deposit(0, 10,carol, { from: alice }) 
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })
            await time.advanceBlockTo('1649')
            await this.master.deposit(0, 10,dev, { from: alice })

            assert.equal(await this.YraceToken.balanceOf(carol),'0'); 
            assert.equal(await this.YraceToken.balanceOf(dev),'0');   
            
            await time.advanceBlockTo('1700')
            await this.master.withdraw(0, { from: alice })
            await this.master.withdraw(0, { from: bob })

            assert.equal(await this.YraceToken.balanceOf(alice),'293'); 
            assert.equal(await this.YraceToken.balanceOf(bob),'205'); 
            assert.equal(await this.YraceToken.balanceOf(carol),'5');
            assert.equal(await this.YraceToken.balanceOf(dev),'0');         
        }) 

    })
})