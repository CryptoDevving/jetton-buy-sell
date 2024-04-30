# Jetton Buy/Sell scripts

## Installation

```bash
git clone https://github.com/0xmusashi/jetton-buy-sell.git
cd jetton-buy-sell
npm i
```

## Create environment variables

```bash
cp .env.example .env
```

Then fill these variables in the new .env file:
- WALLET_MNEMONIC: the mnenomic phrases of sender account
- TONCENTER_API_KEY: your TonCenter API key

## Run the script

```bash
npm run trade
```