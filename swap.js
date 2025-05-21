import fetch from 'node-fetch';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import config from './config.js';

const connection = new Connection(config.solanaRpcUrl);

// Get token list
export async function getTokenList() {
  try {
    const response = await fetch(config.tokenListUrl);
    return await response.json();
  } catch (error) {
    throw error;
  }
}

// Get swap quote
export async function getSwapQuote(inputMint, outputMint, amount) {
  try {
    const response = await fetch(`${config.jupiterApiUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`);
    return await response.json();
  } catch (error) {
    throw error;
  }
}

// Execute swap
export async function executeSwap(keypair, inputMint, outputMint, amount) {
  try {
    // Get quote
    const quoteResponse = await getSwapQuote(inputMint, outputMint, amount);
    
    // Get swap transaction
    const swapResponse = await fetch(`${config.jupiterApiUrl}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: keypair.publicKey.toString()
      })
    });
    
    const swapData = await swapResponse.json();
    
    // Deserialize and sign transaction
    const transaction = Transaction.from(Buffer.from(swapData.swapTransaction, 'base64'));
    transaction.sign(keypair);
    
    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    // Wait for confirmation
    await connection.confirmTransaction(signature);
    
    return {
      signature,
      inputAmount: amount,
      outputAmount: quoteResponse.outAmount
    };
  } catch (error) {
    throw error;
  }
}

// Find token by symbol
export async function findTokenBySymbol(symbol) {
  try {
    const tokenList = await getTokenList();
    return tokenList.find(token => 
      token.symbol.toLowerCase() === symbol.toLowerCase()
    );
  } catch (error) {
    throw error;
  }
}