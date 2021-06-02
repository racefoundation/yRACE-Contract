const YraceToken = artifacts.require("YraceToken");
const YraceSeedMaster = artifacts.require("YraceSeedMaster");

module.exports = async function (deployer) {
  deployer.deploy(YraceToken);
  const YraceTkn = await YraceToken.deployed();
  deployer.deploy(YraceSeedMaster,YraceTkn.address,100,5,100,10000,YraceTkn.address);
  console.log(YraceTkn.address);
};