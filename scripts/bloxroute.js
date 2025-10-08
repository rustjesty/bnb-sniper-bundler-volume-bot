require("dotenv").config();

const { ethers: hardhatEther } = require("hardhat");
const { ethers, keccak256, getCreate2Address } = require("ethers");
const axios = require("axios");

const { Token, Percent } = require("@uniswap/sdk-core");
const { abi: UniswapV3FactoryABI } = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json');

const { encodeSqrtRatioX96, Pool, Position, TickMath, NonfungiblePositionManager, nearestUsableTick } = require("@uniswap/v3-sdk");
const JSBI = require('jsbi');
const { SwapRouterAbi } = require("./abi");
const { defaultAbiCoder } = require("@ethersproject/abi");
const { BLOXROUTE_ENDPOINT } = require("../constants");

// ----- CONFIGURATION ----- //
const API_ENDPOINT = BLOXROUTE_ENDPOINT;
const AUTHORIZATION_HEADER = process.env.AUTHORIZATION_HEADER; // Replace with your auth token
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey || !AUTHORIZATION_HEADER) {
  throw new Error("Private key or AUTHORIZATION_HEADER is missing in .env file!");
}


// bundle includes : deployig token -> approving this token to nfpm -> approving wbnb to nfpm -> creating pool -> initialize it -> add liquidity -> buy a token 

async function main() {
  const currentBlock = await provider.getBlockNumber();
  const futureBlock = currentBlock + 5; // Adjust this as needed
  const FUTURE_BLOCK_HEX = '0x' + futureBlock.toString(16);

  let gasPrice = await provider.send("eth_gasPrice", []);
  gasPrice = BigInt(gasPrice.toString()) * 120n / 100n;       // currently incresing gasprice by 50%
  let nonce = await provider.getTransactionCount(wallet.address);

  // first token tx T0
  const deployParamsT0 = [
    name,
    symbol,
    supply * 10n ** 18n
  ];

  /// main code

}

main()