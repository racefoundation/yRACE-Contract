const { expectRevert, time, constants } = require('@openzeppelin/test-helpers')
const YraceToken = artifacts.require('YraceToken')
const YraceLPMaster = artifacts.require('YraceLPMaster')
const MockBEP20 = artifacts.require('MockBEP20')

contract('YraceLPMaster', ([alice, bob, carol, dev, eliah, minter,feeAddress]) => {
    beforeEach(async () => {
        this.YraceToken = await YraceToken.new({ from: alice })
    })

    it('should set correct state variables', async () => {
        this.master = await YraceLPMaster.new(this.YraceToken.address, 10,100,500,feeAddress, { from: alice })
        await this.YraceToken.setMaster(this.master.address, { from: alice })

        assert.equal(await this.master.yRace().valueOf(), this.YraceToken.address)
        assert.equal((await this.master.REWARD_PER_BLOCK()).valueOf(), 10)
        assert.equal((await this.master.START_BLOCK()).valueOf(), 100)
        assert.equal((await this.master.BLOCKS_PER_STAGE()).valueOf(), 500)
        assert.equal((await this.master.feeAddress()).valueOf(), feeAddress)

    })

    it('should allow only master farmer can mint', async () => {
        this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 100,500,feeAddress, { from: alice })
        await this.YraceToken.setMaster(minter, { from: alice })

        assert.equal((await this.YraceToken.yRaceMaster()).valueOf(), minter)
        await expectRevert(
            (this.YraceToken.mint(alice, '10000000000', { from: alice })),
            "YraceToken: only master farmer can mint")

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
            this.master = await YraceLPMaster.new(this.YraceToken.address, 100, 100,500,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address,1000, true, { from: alice})
            assert.equal((await this.master.poolInfo(0)).lpToken.valueOf(), this.lp.address)
            assert.equal((await this.master.poolInfo(0)).allocPoint.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).lastRewardBlock.valueOf(), '100')
            assert.equal((await this.master.poolInfo(0)).rewardPerShare.valueOf(), '0')
            assert.equal((await this.master.poolInfo(0)).depositFeeBP.valueOf(), '1000')
            assert.equal((await this.master.poolId1(this.lp.address)).valueOf(), '1')

            await expectRevert(
                this.master.add('100', this.lp.address,1000, true, { from: alice}),
                "YraceLPMaster::add: lp pool is already in pool"
            )
            await expectRevert(
                this.master.add('100', this.lp2.address,500, true, { from: bob}),
                "Ownable: caller is not the owner"
            )

            await this.master.add('300', this.lp2.address,700, true, { from: alice})
            assert.equal((await this.master.poolInfo(1)).lpToken.valueOf(), this.lp2.address)
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '300')
            assert.equal((await this.master.poolInfo(1)).lastRewardBlock.valueOf(), '100')
            assert.equal((await this.master.poolInfo(1)).rewardPerShare.valueOf(), '0')
            assert.equal((await this.master.poolInfo(1)).depositFeeBP.valueOf(), '700')
            assert.equal((await this.master.poolId1(this.lp2.address)).valueOf(), '2')

            assert.equal((await this.master.totalAllocPoint()).valueOf(), '400')

            await this.master.set(1, 400,500, true, { from: alice})
            assert.equal((await this.master.poolInfo(1)).allocPoint.valueOf(), '400')
            assert.equal((await this.master.poolInfo(1)).depositFeeBP.valueOf(), '500')
            assert.equal((await this.master.totalAllocPoint()).valueOf(), '500')
        })

        it('should allow emergency withdraw', async () => {
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 100,100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address,1000, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await time.advanceBlockTo(110);
            await this.master.deposit(0, '100',constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            await this.master.emergencyWithdraw(0, { from: bob })
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '990')
        })

        it('should correct deposit', async () => {
           this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 150,100,feeAddress, { from: alice })
           await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('200', this.lp.address,1000, true)
            await this.master.add('200', this.lp2.address,500, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp.approve(this.master.address, '1000', { from: carol })

            await expectRevert(
                this.master.deposit(0, '100',constants.ZERO_ADDRESS, { from: bob }),
                "YraceLPMaster: Staking period has not started"
            )    

            await time.advanceBlockTo(149);
        
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '90')

            await time.advanceBlockTo(160);
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), "499")
            assert.equal((await this.master.userInfo(0, bob)).rewardDebt.valueOf(), "0")
            assert.equal((await this.master.poolInfo(0)).rewardPerShare.valueOf(), "0")

            await this.master.deposit(0, 50,constants.ZERO_ADDRESS, { from: carol })
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '950')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '135')

            assert.notEqual((await this.master.poolInfo(0)).rewardPerShare.valueOf(), "0")
        })

        it('should correct pending YraceToken & balance', async () => {
            // 10 per block farming rate starting at block 200
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 200, 100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.YraceToken.transferOwnership(this.master.address, { from: alice })
            await this.master.add('200', this.lp.address,1000, true)
            await this.master.add('200', this.lp2.address,500, true)
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp.approve(this.master.address, '1000', { from: carol })

            await expectRevert(
                this.master.deposit(0, '100',constants.ZERO_ADDRESS, { from: bob }),
                "YraceLPMaster: Staking period has not started"
            )    

            await time.advanceBlockTo(199);
        
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '90')

            await time.advanceBlockTo(210);
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), '499')
            await time.advanceBlockTo(220)
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), '999')

            await time.advanceBlockTo(249)
            await this.master.updatePool(0) //250
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), '2500')

            await time.advanceBlockTo(259)
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob }) //260
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), '0') // when deposit, it will automatic harvest
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(),'2999')

            assert.equal((await this.YraceToken.balanceOf(this.master.address)).valueOf(), "1")

            await time.advanceBlockTo(270)
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), '500')

            await time.advanceBlockTo(280)
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), '1000')

            await time.advanceBlockTo(299)
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: carol }) // 300
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), '2000')
            assert.equal((await this.master.pendingReward(0, carol)).valueOf(), '0')
            
            await time.advanceBlockTo(310)
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), '2167')
            assert.equal((await this.master.pendingReward(0, carol)).valueOf(), '84')

            await time.advanceBlockTo(320)
            assert.equal((await this.master.pendingReward(0, bob)).valueOf(), '2334')
            assert.equal((await this.master.pendingReward(0, carol)).valueOf(), '167') 
        })

        it('should not distribute YraceToken if no one deposit', async () => {
            // 10 per block farming rate starting at block 400 
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 400,100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.YraceToken.transferOwnership(this.master.address, { from: alice })
            await this.master.add('100', this.lp.address,1000, true)
            await this.master.add('100', this.lp2.address,500, true)

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
            await this.master.deposit(0, '100',constants.ZERO_ADDRESS, { from: bob }) 
            assert.equal((await this.lp.balanceOf(this.master.address)).valueOf(), '90')
            assert.equal((await this.YraceToken.totalSupply()).valueOf(), 0)
            assert.equal((await this.YraceToken.balanceOf(bob)).valueOf(), '0')
            assert.equal((await this.YraceToken.balanceOf(dev)).valueOf(), '0')
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900')

            await time.advanceBlockTo('479')
            await this.master.withdraw(0,'50', { from: bob })
            assert.equal(await this.YraceToken.balanceOf(bob).valueOf(),'999')
        })

        it('should properly distribute tokens', async () => {
            // 10 blocks == 1000 tokens,,,500 per pool
           this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 600,100,feeAddress, { from: alice })
           await this.YraceToken.setMaster(this.master.address, { from: alice })

            await this.master.add('100', this.lp.address,1000, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })
            await this.lp.approve(this.master.address, '1000', { from: carol })
            await this.lp.approve(this.master.address, '1000', { from: dev })

            await this.master.add('100', this.lp2.address,500, true)
            await this.lp2.approve(this.master.address, '1000', { from: eliah })

            await time.advanceBlockTo('599')
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: alice }) //500
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: bob })   //501
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: carol }) //502
            await this.master.deposit(0, 100,constants.ZERO_ADDRESS, { from: dev })   //503

            await this.master.deposit(1, 100,constants.ZERO_ADDRESS, { from: eliah }) //504

          // ----- claiming anytime after sale start 
            await time.advanceBlockTo('649')
            // console.log((await this.master.poolInfo(0)).rewardPerShare.valueOf()/1000000000000)

            await this.master.withdraw(0,90, { from: alice })           //550
            assert.equal(await this.YraceToken.balanceOf(alice),'679');

            await this.master.withdraw(0,90, { from: bob })             //551
            assert.equal(await this.YraceToken.balanceOf(bob),'646');

            await this.master.withdraw(0,90, { from: carol })           //552
            assert.equal(await this.YraceToken.balanceOf(carol),'646');

            await this.master.withdraw(0,90, { from: dev })             //553
            assert.equal(await this.YraceToken.balanceOf(dev),'679');

            await this.master.withdraw(1,90, { from: eliah })           //554
            assert.equal(await this.YraceToken.balanceOf(eliah),'2499');          

            await expectRevert(
                this.master.withdraw(0,0, { from: bob }),
                "YraceMaster: No tokens staked"
            )

        })

        it('should properly distribute at different deposit amounts', async () => {
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 700,100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address,1000, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address,500, true)
             await this.lp2.approve(this.master.address, '1000', { from: eliah })

             // console.log(await time.latestBlock());
             await time.advanceBlockTo('699')
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice })  //700
             await this.master.deposit(0, 20,constants.ZERO_ADDRESS, { from: bob })    //701
             await this.master.deposit(0, 30,constants.ZERO_ADDRESS, { from: carol })  //702
             await this.master.deposit(0, 40,constants.ZERO_ADDRESS, { from: dev })    //703
             await this.master.deposit(1, 10,constants.ZERO_ADDRESS, { from: eliah })  //704
 
           // ----- claiming anytime after sale end (equal distribution)

             await time.advanceBlockTo('749')
 
             await this.master.withdraw(0,9, { from: alice })            //750
             assert.equal(await this.YraceToken.balanceOf(alice),'309');

             await this.master.withdraw(0,18, { from: bob })              //751
             assert.equal(await this.YraceToken.balanceOf(bob),'532');

             await this.master.withdraw(0,27, { from: carol })            //752
             assert.equal(await this.YraceToken.balanceOf(carol),'769');

            await this.master.withdraw(0,36, { from: dev })              //753
            assert.equal(await this.YraceToken.balanceOf(dev),'1040');
            
            await this.master.withdraw(1,9, { from: eliah })            //754
            assert.equal(await this.YraceToken.balanceOf(eliah),'2500');
        })

        it('should distribute properly when multiple deposit', async () => {
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 800,100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address,1000, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: eliah })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address,1000, true)
 
             // console.log(await time.latestBlock());
             await time.advanceBlockTo('799')
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice }) 
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })
             await time.advanceBlockTo('849')
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice })

            // ----- claiming anytime after sale end (equal distribution)
             await time.advanceBlockTo('899')
             await this.master.withdraw(0,9, { from: alice })
             assert.equal(await this.YraceToken.balanceOf(alice),'2941');
 
             await this.master.withdraw(0,9, { from: bob })
             assert.equal(await this.YraceToken.balanceOf(bob),'2071');         
        }) 

        it('should allow deposit and partial withdraw at any time', async () => {
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 1000,100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address,1000, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
             await this.lp.approve(this.master.address, '1000', { from: carol })
             await this.lp.approve(this.master.address, '1000', { from: dev })
 
             await this.master.add('100', this.lp2.address,500, true)
             await this.lp2.approve(this.master.address, '1000', { from: eliah })

             // console.log(await time.latestBlock());
             await time.advanceBlockTo('1150')
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice })  //1151
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })    
             await this.master.deposit(1, 10,constants.ZERO_ADDRESS, { from: eliah })  

             await time.advanceBlockTo('1200')
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: alice }) 

             await time.advanceBlockTo('1250')
             await this.master.withdraw(0,9, { from: alice })            
             assert.equal(await this.YraceToken.balanceOf(alice),'1132');

             await this.master.withdraw(0,9, { from: bob })             
             assert.equal(await this.YraceToken.balanceOf(bob),'865');
             
            await this.master.withdraw(1,9, { from: eliah })           
            assert.equal(await this.YraceToken.balanceOf(eliah),'1970');

            await time.advanceBlockTo('1300')
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: carol })  //1301
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: dev })

            await time.advanceBlockTo('1350')
            await this.master.withdraw(0,9, { from: carol })            
            assert.equal(await this.YraceToken.balanceOf(carol),'85');

            await this.master.withdraw(0,9, { from: alice })  
            assert.equal(await this.YraceToken.balanceOf(alice),'1951');
        })

        
        it('should pay to referrer address if a user is referred by it', async () => {
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 1400,100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
             await this.master.add('100', this.lp.address,1000, true)
             await this.lp.approve(this.master.address, '1000', { from: alice })
             await this.lp.approve(this.master.address, '1000', { from: bob })
 
             await this.master.add('100', this.lp2.address,500, true)
 
             await time.advanceBlockTo('1399')
             await this.master.deposit(0, 10,carol, { from: alice }) 
             await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })
             assert.equal(await this.YraceToken.balanceOf(carol),'0'); 

             await time.advanceBlockTo('1450')
             await this.master.withdraw(0,5, { from: alice })
             await this.master.withdraw(0,9, { from: bob })

             await time.advanceBlockTo('1500')
             await this.master.withdraw(0,4, { from: alice })

             assert.equal(await this.YraceToken.balanceOf(alice),'3740'); 
             assert.equal(await this.YraceToken.balanceOf(bob),'1285'); 
             assert.equal(await this.YraceToken.balanceOf(carol),'73'); 
        }) 

        
        it('should not be referred by multiple referrers', async () => {
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 1550,100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
 
            await this.master.add('100', this.lp.address,1000, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await this.master.add('100', this.lp2.address,500, true)

            await time.advanceBlockTo('1549')
            await this.master.deposit(0, 10,carol, { from: alice }) 
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })
            await time.advanceBlockTo('1599')
            await this.master.deposit(0, 10,dev, { from: alice })

            await time.advanceBlockTo('1649')
            await this.master.withdraw(0,18, { from: alice })
            await this.master.withdraw(0,9, { from: bob })

            assert.equal(await this.YraceToken.balanceOf(alice),'2941'); 
            assert.equal(await this.YraceToken.balanceOf(bob),'2084'); 
            assert.equal(await this.YraceToken.balanceOf(carol),'58');
            assert.equal(await this.YraceToken.balanceOf(dev),'0');         
        }) 

        it('should allow original fee address to change feeAddress', async () => {
            this.master = await YraceLPMaster.new(this.YraceToken.address, 10, 1700,100,feeAddress, { from: alice })
            await this.YraceToken.setMaster(this.master.address, { from: alice })
            await expectRevert(
                this.master.setFeeAddress(dev, { from: alice }),
                "YraceLPMaster: forbidden from change"    
            )
            await expectRevert(
                this.master.setFeeAddress(constants.ZERO_ADDRESS, { from: feeAddress }),
                "YraceLPMaster: fee address cant be zero address"    
            )

            await this.master.setFeeAddress(eliah, { from: feeAddress })
            assert.equal(await this.lp.balanceOf(eliah),'1000');

            await this.master.add('100', this.lp.address,1000, true)
            await this.lp.approve(this.master.address, '1000', { from: alice })
            await this.lp.approve(this.master.address, '1000', { from: bob })

            await this.master.add('100', this.lp2.address,500, true)

            await time.advanceBlockTo('1699')
            await this.master.deposit(0, 10,carol, { from: alice }) 
            await this.master.deposit(0, 10,constants.ZERO_ADDRESS, { from: bob })
            await time.advanceBlockTo('1749')
            await this.master.deposit(0, 10,dev, { from: alice })

            await time.advanceBlockTo('1799')
            await this.master.withdraw(0,18, { from: alice })
            await this.master.withdraw(0,9, { from: bob })

            assert.equal(await this.YraceToken.balanceOf(alice),'2941'); 
            assert.equal(await this.YraceToken.balanceOf(bob),'2084'); 
            assert.equal(await this.YraceToken.balanceOf(carol),'58');
            assert.equal(await this.YraceToken.balanceOf(dev),'0');
            
            assert.equal(await this.lp.balanceOf(eliah),'1003');
        }) 

    })
})