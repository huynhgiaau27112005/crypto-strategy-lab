import { Spot } from '@binance/spot';

const spotClient = new Spot({
  apiKey: process.env.BINANCE_API_KEY,
  privateKey: process.env.BINANCE_PRIVATE_KEY,
});

const accountInfo = await spotClient.restAPI.getAccount();
