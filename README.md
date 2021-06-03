# yRace-contracts
---
## Development

### Install Dependencies
```bash
npm install
```
### Clone repository
```bash
git clone repo-url 
```

### Truffle config

```bash
    module.exports = {
    networks: {
        development: {
         host: "127.0.0.1",     
         port: 8545,            
         network_id: "*",       
        },
    },
    compilers: {
        solc: {
        version: "0.8.3",
        settings: {
            optimizer: {
            enabled: true,
            runs: 200
            }
        }
        }
    }
    };
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
yRaceSeedMaster contract is the master contract that holds the seed pool addresses and makes it possible for users to deposit seed pool tokens and earn yRace tokens in return after the staking period has ended. The staking period for the seed pools has a duration of 7 days. Users can only stake during these 7 days. After the staking period ends, users can withdraw their tokens and will be rewarded with yRace tokens on the basis of their amount staked and duration for which they were staked for.

### yRaceLPMaster contract

yRaceLPMaster contract is the master contract that holds the lp pool addresses and makes it possible for users to deposit seed pool tokens and earn yRace tokens in return. The deposit and withdraw operations are different from that of the yRaceSeedMaster contract. Here, the users can deposit multiple times and everytime they deposit(or withdraw), except the first deposit, the yRace token rewards that are generated till that time are sent to users account instead of summing up. Users are able to partially withdraw their tokens too. 

