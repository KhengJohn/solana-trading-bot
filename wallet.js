import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, createTransferInstruction, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import config from './config.js';
import { User } from './models.js';
import { encrypt, decrypt } from './security.js';

// Solana connection
const connection = new Connection(config.solanaRpcUrl);

// Get user's wallet from database
export async function getUserWallet(telegramId) {
  const user = await User.findOne({ telegramId });
  if (!user || !user.encryptedPrivateKey) {
    return null;
  }
  
  const privateKeyString = decrypt(user.encryptedPrivateKey);
  let keypair;
  
  // Check if it's a mnemonic or private key
  if (privateKeyString.includes(' ')) {
    // It's a mnemonic
    const seed = await bip39.mnemonicToSeed(privateKeyString);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.slice(0, 64));
    keypair = Keypair.fromSeed(derivedSeed.key);
  } else {
    // It's a private key
    const privateKey = bs58.decode(privateKeyString);
    keypair = Keypair.fromSecretKey(privateKey);
  }
  
  return keypair;
}

// Import wallet (private key or seed phrase)
export async function importWallet(telegramId, privateKeyOrSeed) {
  try {
    let keypair;
    
    // Check if input is a seed phrase or private key
    if (privateKeyOrSeed.includes(' ')) {
      // Validate mnemonic
      if (!bip39.validateMnemonic(privateKeyOrSeed)) {
        throw new Error('Invalid seed phrase');
      }
      
      // It's a mnemonic
      const seed = await bip39.mnemonicToSeed(privateKeyOrSeed);
      const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.slice(0, 64));
      keypair = Keypair.fromSeed(derivedSeed.key);
    } else {
      // It's a private key
      try {
        const privateKey = bs58.decode(privateKeyOrSeed);
        keypair = Keypair.fromSecretKey(privateKey);
      } catch (error) {
        throw new Error('Invalid private key');
      }
    }
    
    // Encrypt the private key or seed phrase
    const encryptedPrivateKey = encrypt(privateKeyOrSeed);
    const publicKey = keypair.publicKey.toString();
    
    // Save to database
    await User.findOneAndUpdate(
      { telegramId },
      { 
        telegramId,
        encryptedPrivateKey,
        publicKey
      },
      { upsert: true }
    );
    
    return { publicKey };
  } catch (error) {
    throw error;
  }
}

// Get SOL balance
export async function getSolBalance(publicKey) {
  try {
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    throw error;
  }
}

// Get token accounts
export async function getTokenAccounts(publicKey) {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(publicKey),
      { programId: TOKEN_PROGRAM_ID }
    );
    
    return accounts.value.map(accountInfo => {
      const parsedInfo = accountInfo.account.data.parsed.info;
      const tokenAmount = parsedInfo.tokenAmount;
      
      return {
        mint: parsedInfo.mint,
        address: accountInfo.pubkey.toString(),
        amount: tokenAmount.uiAmount,
        decimals: tokenAmount.decimals
      };
    }).filter(token => token.amount > 0);
  } catch (error) {
    throw error;
  }
}

// Send SOL
export async function sendSol(keypair, recipient, amount) {
  try {
    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(recipient),
        lamports: amount * LAMPORTS_PER_SOL
      })
    );
    
    // Set recent blockhash and fee payer
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.feePayer = keypair.publicKey;
    
    // Sign transaction
    transaction.sign(keypair);
    
    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    // Wait for confirmation
    await connection.confirmTransaction(signature);
    
    return signature;
  } catch (error) {
    throw error;
  }
}

// Send SPL token
export async function sendToken(keypair, recipient, mint, amount) {
  try {
    // Get source token account
    const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      new PublicKey(mint),
      keypair.publicKey
    );
    
    // Get destination token account
    const destinationTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      new PublicKey(mint),
      new PublicKey(recipient)
    );
    
    // Get token info to determine decimals
    const tokenInfo = await getAccount(connection, sourceTokenAccount.address);
    const tokenMintInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
    const decimals = tokenMintInfo.value.data.parsed.info.decimals;
    
    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      sourceTokenAccount.address,
      destinationTokenAccount.address,
      keypair.publicKey,
      amount * (10 ** decimals)
    );
    
    // Create and sign transaction
    const transaction = new Transaction().add(transferInstruction);
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.feePayer = keypair.publicKey;
    transaction.sign(keypair);
    
    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    // Wait for confirmation
    await connection.confirmTransaction(signature);
    
    return signature;
  } catch (error) {
    throw error;
  }
}