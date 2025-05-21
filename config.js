import dotenv from 'dotenv';
dotenv.config();

export default {
  // Bot configuration
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  
  // MongoDB configuration
  mongodbUri: process.env.MONGODB_URI,
  
  // Solana configuration
  solanaRpcUrl: process.env.SOLANA_RPC_URL,
  
  // Security
  encryptionKey: process.env.ENCRYPTION_KEY,
  
  // Jupiter API (for swaps)
  jupiterApiUrl: 'https://quote-api.jup.ag/v4',
  
  // Token list API
  tokenListUrl: 'https://token.jup.ag/strict',
};