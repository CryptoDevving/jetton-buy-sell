import TonWeb from "tonweb";
import { fromNano, toNano, Address, TonClient, WalletContractV4, internal, Cell } from "@ton/ton";
import { mnemonicToWalletKey } from "@ton/crypto";
import { DEX, pTON } from "@ston-fi/sdk";
import { JettonMinter } from "../wrappers/JettonMinter";
import { JettonWallet } from "../wrappers/JettonWallet";
import schedule from "node-schedule";
import { JETTON_MINTER_ADDRESS } from "../config";
import { sleep, randomInRange } from "../utils";
import dotenv from 'dotenv';
dotenv.config();
const TONCENTER_API_KEY = <string>process.env.TONCENTER_API_KEY;
const TONCENTER_API = 'https://toncenter.com/api/v2/jsonRPC';
const WALLET_MNEMONIC = <string>process.env.WALLET_MNEMONIC;
const WAIT_BEFORE_SELL = 90000; // 1 minute

const router = new DEX.v1.Router({
    tonApiClient: new TonWeb.HttpProvider(TONCENTER_API, { apiKey: TONCENTER_API_KEY }),
});

/**
 * buy WHISK on Stonfi
 */
async function buyStonfi(amount: number, userAddress: any) {
    // swap 1 TON to WHISK but not less than 1 nano WHISK
    const buyParams = await router.buildSwapTonToJettonTxParams({
        userWalletAddress: userAddress,
        proxyTonAddress: pTON.v1.address,
        offerAmount: new TonWeb.utils.BN(toNano(amount).toString()), // TON
        askJettonAddress: JETTON_MINTER_ADDRESS,
        minAskAmount: new TonWeb.utils.BN("1"),
    });
    console.log(`Buying WHISK with ${amount.toString()} TON on Stonfi`);
    return buyParams;
}

/**
 * sell WHISK on Stonfi
 */
async function sellStonfi(amount: bigint, userAddress: any) {
    // swap 'amount' WHISK to TON but not less than 1 nano TON
    const sellParams = await router.buildSwapJettonToTonTxParams({
        userWalletAddress: userAddress,
        offerJettonAddress: JETTON_MINTER_ADDRESS, // WHISK
        offerAmount: new TonWeb.utils.BN(amount.toString()),
        proxyTonAddress: pTON.v1.address,
        minAskAmount: new TonWeb.utils.BN("1"),
    });
    console.log(`Selling ${fromNano(amount).toString()} WHISK for TON on Stonfi`);
    return sellParams;
}

async function trade() {
    const tonweb = new TonWeb(new TonWeb.HttpProvider(TONCENTER_API, { apiKey: TONCENTER_API_KEY }));
    const key = await mnemonicToWalletKey(WALLET_MNEMONIC.split(" "));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });

    const client = new TonClient({
        endpoint: TONCENTER_API,
        apiKey: TONCENTER_API_KEY
    });

    const balance = await client.getBalance(wallet.address);
    const balanceString = fromNano(balance);
    console.log(`current balance: ${balanceString} TON`);

    await sleep(1000);

    const WalletClass = tonweb.wallet.all['v4R2'];
    const tonwebWallet = new WalletClass(tonweb.provider, {
        publicKey: key.publicKey,
        wc: 0
    });

    const USER_ADDRESS = await tonwebWallet.getAddress();

    // for getting WHISK balance
    const minter = new JettonMinter(Address.parse(JETTON_MINTER_ADDRESS));
    const minterContract = client.open(minter);
    const walletAddress = await minterContract.getWalletAddress(wallet.address);
    const userJettonWallet = new JettonWallet(walletAddress);
    const userJettonWalletContract = client.open(userJettonWallet);

    while (true) {
        const buyParams = await buyStonfi(0.1, USER_ADDRESS); // buy WHISK with 0.1 TON

        let seqno = (await tonwebWallet.methods.seqno().call()) || 0;
        try {
            await tonwebWallet.methods.transfer({
                secretKey: key.secretKey,
                toAddress: buyParams.to.toString(),
                amount: buyParams.gasAmount.toString(),
                seqno: seqno | 0,
                payload: buyParams.payload,
                sendMode: 1
            }).send();
        } catch (err) {
            console.log(`Failed to buy WHISK, try again`);
            await tonwebWallet.methods.transfer({
                secretKey: key.secretKey,
                toAddress: buyParams.to.toString(),
                amount: buyParams.gasAmount.toString(),
                seqno: seqno | 0,
                payload: buyParams.payload,
                sendMode: 1
            }).send();
        }

        await sleep(WAIT_BEFORE_SELL);

        let whiskBalance = await userJettonWalletContract.getJettonBalance();
        if (whiskBalance.toString() == '0') {
            await sleep(1500);
            whiskBalance = await userJettonWalletContract.getJettonBalance();
        }
        await sleep(1500);

        const sellParams = await sellStonfi(whiskBalance, USER_ADDRESS);
        seqno = (await tonwebWallet.methods.seqno().call()) || 0;
        try {
            await tonwebWallet.methods.transfer({
                secretKey: key.secretKey,
                toAddress: sellParams.to.toString(),
                amount: sellParams.gasAmount.toString(),
                seqno: seqno | 0,
                payload: sellParams.payload,
                sendMode: 1
            }).send();
        } catch (err) {
            console.log(`Failed to sell WHISK, try again`);
            await tonwebWallet.methods.transfer({
                secretKey: key.secretKey,
                toAddress: sellParams.to.toString(),
                amount: sellParams.gasAmount.toString(),
                seqno: seqno | 0,
                payload: sellParams.payload,
                sendMode: 1
            }).send();
        }

        await sleep(90000);
    }
}

// trade every 1 minutes
trade();
// const job = schedule.scheduleJob('*/3 * * * *', trade);