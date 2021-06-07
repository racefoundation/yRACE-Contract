# yRace-contracts
---
## Development

### Clone repository
```bash
git clone repo-url 
```
### Install Dependencies
```bash
npm install
```

### Start local blockchain
```bash
ganache-cli
```

### Compile Contracts

```bash
truffle compile
```

### Run Tests

```bash
truffle test
```

### About contracts :

### yRaceToken contract
yRace token is a BEP20 compatible token present on the Binance Smart Chain. The contract inherits methods from the BEP20 contract and Ownable contract.

### yRaceSeedMaster contract
yRaceSeedMaster contract is the master contract that holds the seed pool addresses and makes it possible for users to deposit seed pool tokens and earn yRace tokens in return after the staking period has ended. The staking period for the seed pools has a duration of 7 days. The users can stake multiple times for which their reward will be calculated accordingly and the entire reward sum will be given to the user when they harvest the tokens after the sale ends. Users can withdraw their staked tokens during the staking period, but their rewards will be locked until the sale ends. After the staking period ends, users can harvest their tokens and will be rewarded with yRace tokens on the basis of their amount staked and duration for which they were staked for.

### yRaceLPMaster contract

yRaceLPMaster contract is the master contract that holds the LP pool addresses and makes it possible for users to deposit LP pool tokens and earn yRace tokens in return. The deposit and withdraw operations are a little different from that of the yRaceSeedMaster contract. Here, the users can deposit multiple times and everytime they deposit(or withdraw), except the first deposit, the yRace token rewards that are generated till that time are sent to users account instead of summing up. Users are able to partially withdraw their tokens too. 

