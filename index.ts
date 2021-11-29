import { DefaultLogger, RestClient, WebsocketClient } from "ftx-api";
import { Config } from "./Config.js";

const config = new Config();

const key = config.key;
const secret = config.secret;
const subAccountName = config.subAccountName;
const market = config.market;

const longActive = config.longActive;
const longTrailValue = config.longTrailValue;

const shortActive = config.shortActive;
const shortTrailValue = config.shortTrailValue;

const restClientOptions = { subAccountName: subAccountName };

async function start() {
  const client = new RestClient(key, secret, restClientOptions);

  let totalBalanceLTC;
  let totalBalanceUSDT;
  let currPrice;
  let trailValue;

  // 1. Cancel all Orders
  await client.cancelAllOrders({ market: market }).catch(console.error);

  // 2. Get total balance
  let _balance = await client.getBalances().catch(console.error);

  for (const balance of _balance.result) {
    if (balance.coin === "LTC") {
      totalBalanceLTC = balance.total;
    } else if (balance.coin === "USDT") {
      totalBalanceUSDT = balance.total;
    }
  }

  console.log(
    `[INFO] Balance LTC: ${totalBalanceLTC} - Balance USDT: ${totalBalanceUSDT}`
  );

  // 3. Get current market prices
  let marketLTC = await client.getMarket(market).catch(console.error);

  currPrice = marketLTC.result.price;

  //console.log(`[INFO] lastPrice: ${lastPrice}, currBid: ${currBid}, currAsk: ${currAsk}, currPrice: ${currPrice}`);

  // Decide to go long or short
  if (totalBalanceLTC > 0.1 && longActive) {
    // go long
    trailValue = (currPrice * longTrailValue) / 100 * -1;
    try {
      await client
        .placeTriggerOrder({
          market: market,
          side: "sell",
          size: totalBalanceLTC,
          type: "trailingStop",
          trailValue: trailValue,
        })
        .catch(console.error);

      console.log(
        `[ORDER PLACED] SELL Order for ${market}: sell ${totalBalanceLTC} LTC with a trigger price of ${
          currPrice + trailValue
        }, current price ${currPrice}`
      );
    } catch (err) {
      console.warn(`[ALERT] SELL Order not successful ${err}`);
    }
  } else if (shortActive) {
    // go short
    trailValue = ((currPrice * shortTrailValue) / 100);
    try {
      await client
        .placeTriggerOrder({
          market: market,
          side: "buy",
          size: totalBalanceUSDT / currPrice,
          type: "trailingStop",
          trailValue: trailValue,
        })
        .catch(console.error);

      console.log(
        `[ORDER PLACED] BUY Order for ${market}: buy ${
          totalBalanceLTC / currPrice
        } LTC with a trigger price of ${currPrice + trailValue}, current price ${currPrice}`
      );
    } catch (err) {
      console.warn(`[ALERT] BUY Order not successful ${err}`);
    }
  }else {
    console.warn(`[ALERT] No buy or sell order placed`);
  }
}

async function connect() {
  // Turn debugging off
  DefaultLogger.silly = () => {};
  DefaultLogger.debug = () => {};
  DefaultLogger.notice = () => {};
  DefaultLogger.info = () => {};

  // Prepare a ws connection (connection init is automatic once ws client is instanced)
  const ws = new WebsocketClient(
    { key: key, secret: secret, subAccountName: subAccountName },
    DefaultLogger
  );

  // append event listeners
  ws.on("update", (msg) => handleResponse(msg));
  ws.on("error", (msg) => console.log("err: ", msg));

  // Subscribe to to topics
  // ws.subscribe(['fills', 'orders']);
  ws.subscribe(["orders"]);

  await start();
}

async function handleResponse(msg: any) {
  if (msg.data != undefined) {
    // console.log('Message: ', msg);
    if (msg.channel === "orders") {
      if (msg.data.status === "closed") {
        console.log(
          `[ORDER FILLED] ${msg.data.market}: ${msg.data.side} of ${msg.data.size} LTC for ${msg.data.avgFillPrice} USDT filled`
        );
        start();
    }
    }
  }
}

connect();
