const { expectRevert, time } = require('@openzeppelin/test-helpers')
const YraceToken = artifacts.require('YraceToken')

contract('YraceToken',function([alice,bob,carol,minter,presale]){
    beforeEach(async () => {
        this.YraceToken = await YraceToken.new({from : alice})
        await this.YraceToken.setMaster(minter, { from: alice })
    })

    it('should have correct setting', async () => {
        assert.equal(await this.YraceToken.name().valueOf(), 'yRace')
        assert.equal(await this.YraceToken.symbol().valueOf(), 'yRace')
        assert.equal(await this.YraceToken.decimals().valueOf(), '18')
    })
    
    it('should allow only owner to set master', async () => {
        await expectRevert(
            this.YraceToken.setMaster(bob, { from: carol }),
            'Ownable: caller is not the owner'
        )
        await this.YraceToken.setMaster(bob, { from: alice })
        assert.equal((await this.YraceToken.yRaceMaster()).valueOf(), bob)
    })

    it('should only allow master to mint token', async () => {
        await this.YraceToken.mint(alice, '100', { from: minter })
        await this.YraceToken.mint(bob, '1000', { from: minter })
        await expectRevert(
            this.YraceToken.mint(carol, '1000', { from: bob }),
            'YraceToken: only master farmer can mint',
        )
        const totalSupply = await this.YraceToken.totalSupply()
        const aliceBal = await this.YraceToken.balanceOf(alice)
        const bobBal = await this.YraceToken.balanceOf(bob)
        const carolBal = await this.YraceToken.balanceOf(carol)
        assert.equal(totalSupply.valueOf(), 1100)
        assert.equal(aliceBal.valueOf(), '100')
        assert.equal(bobBal.valueOf(), '1000')
        assert.equal(carolBal.valueOf(), '0')
    })

    it('should supply token transfers properly', async () => {
        await this.YraceToken.mint(alice, '500', { from: minter })
        await this.YraceToken.transfer(carol, '200', { from: alice })
        await this.YraceToken.transfer(bob, '100', { from: carol })
        const bobBal = await this.YraceToken.balanceOf(bob)
        const carolBal = await this.YraceToken.balanceOf(carol)
        assert.equal(bobBal.valueOf(), '100')
        assert.equal(carolBal.valueOf(), '100')
    })

    it('should fail if you try to do bad transfers', async () => {
        await this.YraceToken.mint(alice, '500', { from: minter })
        await this.YraceToken.transfer(carol, '10', { from: alice })
        await expectRevert(
            this.YraceToken.transfer(bob, '110', { from: carol }),
            'BEP20: transfer amount exceeds balance',
        )
        await expectRevert(
            this.YraceToken.transfer(carol, '1', { from: bob }),
            'BEP20: transfer amount exceeds balance',
        )
    })
});