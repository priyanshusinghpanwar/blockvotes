# Blockchain Demo Module (Ganache + Solidity)

This package deploys the `ElectionProofRegistry` smart contract used by the API server for:
- vote batch anchoring (`merkle_root`)
- election finalization proof (`final_merkle_root`, `tally_hash`)

## 1) Start Ganache

Run Ganache locally (GUI or CLI) on:
- RPC URL: `http://127.0.0.1:7545`
- Chain ID: `1337` (default in this setup)

## 2) Set deploy key in terminal

Use one Ganache account private key:

```powershell
$env:BLOCKCHAIN_PRIVATE_KEY = "0x<ganache-private-key>"
$env:GANACHE_RPC_URL = "http://127.0.0.1:7545"
$env:BLOCKCHAIN_CHAIN_ID = "1337"
```

## 3) Compile and deploy contract

```powershell
cd E:\Project\Block-Chain\Block-Chain
pnpm --filter @workspace/blockchain run compile
pnpm --filter @workspace/blockchain run deploy:ganache
```

Deployment metadata will be written to:

`artifacts/api-server/src/blockchain/registry-deployment.json`

Copy the deployed address into API server env:

`artifacts/api-server/.env`

```env
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
BLOCKCHAIN_PRIVATE_KEY=0x<ganache-private-key>
BLOCKCHAIN_CONTRACT_ADDRESS=0x<deployed-contract-address>
BLOCKCHAIN_AUTO_ANCHOR_ON_VOTE=false
```
