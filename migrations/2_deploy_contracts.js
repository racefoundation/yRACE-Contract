const YraceToken = artifacts.require("YraceToken");
const YraceSeedMaster = artifacts.require("YraceSeedMaster");

module.exports = async function (deployer) {
  deployer.deploy(YraceToken);
  const YraceTkn = await YraceToken.deployed();
  deployer.deploy(YraceSeedMaster,YraceTkn.address,100,5);
  console.log(YraceTkn.address);
};