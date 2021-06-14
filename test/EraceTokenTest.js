const { expectRevert, time } = require('@openzeppelin/test-helpers')
const EraceToken = artifacts.require('EraceToken')

contract('EraceToken',function([alice,bob,carol,minter]){
    beforeEach(async () => {
        this.EraceToken = await EraceToken.new(BigInt(10000e18),{from : alice})
        await this.EraceToken.setMaster(minter, { from: alice })
    })

    it('should have correct setting', async () => {
        assert.equal(await this.EraceToken.name().valueOf(), 'ERace')
        assert.equal(await this.EraceToken.symbol().valueOf(), 'eRace')
        assert.equal(await this.EraceToken.decimals().valueOf(), '18')
        assert.equal(await this.EraceToken.cap().valueOf(), 10000e18)
        assert.equal(await this.EraceToken.remPoolAmount().valueOf(), 10000e18)
    })
    
    it('should allow only owner to set master', async () => {
        await expectRevert(
            this.EraceToken.setMaster(bob, { from: carol }),
            'Ownable: caller is not the owner'
        )
        await this.EraceToken.setMaster(bob, { from: alice })
        assert.equal((await this.EraceToken.eRaceMaster()).valueOf(), bob)
    })

    it('should fail, mint over token', async () => {

        await this.EraceToken.setMaster(bob, { from: alice })
        await expectRevert(
            this.EraceToken.mint(alice, '10000000000000000000001', { from: bob }),
            'EraceToken: mint amount exceeds cap',
        )
    })
    it('should only allow master to mint token', async () => {
        await this.EraceToken.mint(alice, '100', { from: minter })
        await this.EraceToken.mint(bob, '1000', { from: minter })
        await expectRevert(
            this.EraceToken.mint(carol, '1000', { from: bob }),
            'EraceToken: only master farmer can mint',
        )
        const totalSupply = await this.EraceToken.totalSupply()
        const aliceBal = await this.EraceToken.balanceOf(alice)
        const bobBal = await this.EraceToken.balanceOf(bob)
        const carolBal = await this.EraceToken.balanceOf(carol)
        assert.equal(totalSupply.valueOf(), 1100)
        assert.equal(aliceBal.valueOf(), '100')
        assert.equal(bobBal.valueOf(), '1000')
        assert.equal(carolBal.valueOf(), '0')
        assert.equal(await this.EraceToken.remPoolAmount().valueOf(), 10000e18 - 1100)
    })

    it('should supply token transfers properly', async () => {
        await this.EraceToken.mint(alice, '500', { from: minter })
        await this.EraceToken.transfer(carol, '200', { from: alice })
        await this.EraceToken.transfer(bob, '100', { from: carol })
        const bobBal = await this.EraceToken.balanceOf(bob)
        const carolBal = await this.EraceToken.balanceOf(carol)
        assert.equal(bobBal.valueOf(), '100')
        assert.equal(carolBal.valueOf(), '100')
    })

    it('should fail if you try to do bad transfers', async () => {
        await this.EraceToken.mint(alice, '500', { from: minter })
        await this.EraceToken.transfer(carol, '10', { from: alice })
        await expectRevert(
            this.EraceToken.transfer(bob, '110', { from: carol }),
            'BEP20: transfer amount exceeds balance',
        )
        await expectRevert(
            this.EraceToken.transfer(carol, '1', { from: bob }),
            'BEP20: transfer amount exceeds balance',
        )
    })

    it("should allow burn", async () => {
        await this.EraceToken.setMaster(minter, { from: alice })
        await this.EraceToken.mint(bob, '500', { from: minter })

        await expectRevert(
            this.EraceToken.burn(600, { from: bob }),
            "BEP20: burn amount exceeds balance"
        )

        await this.EraceToken.mint(bob, '10000000000000000000', { from: minter })
        await this.EraceToken.burn('500000000000000000', { from: bob })
        assert.equal((await this.EraceToken.balanceOf(bob)).valueOf(), '9500000000000000500')
    })
});