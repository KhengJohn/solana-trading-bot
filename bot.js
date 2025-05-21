import { Telegraf, Markup, session } from 'telegraf';
import { message } from 'telegraf/filters';
import mongoose from 'mongoose';
import config from './config.js';
import { User, Transaction } from './models.js';
import * as wallet from './wallet.js';
import * as price from './price.js';
import * as swap from './swap.js';
import { isValidSolanaAddress } from './security.js';
import { PublicKey } from '@solana/web3.js';

// Initialize bot
const bot = new Telegraf(config.telegramToken);

// Use session middleware
bot.use(session());

// Connect to MongoDB
mongoose.connect(config.mongodbUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Start command
bot.command('start', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id.toString() });
  const welcomeMessage = `
Welcome to the Solana Trading Bot! 🚀

This bot allows you to interact with your Solana wallet directly from Telegram.

${user?.publicKey ? `Your connected wallet: ${user.publicKey}` : 'You have not connected a wallet yet.'}

Available commands:
/start - Show this welcome message
/importwallet - Import your Solana wallet
/balance - Check your wallet balance
/send - Send SOL or tokens to another address
/swap - Swap between tokens (via Jupiter)
/price - Check token prices
/help - Show help information

To get started, use /importwallet to connect your wallet.
  `;
  
  return ctx.reply(welcomeMessage);
});

// Help command
bot.command('help', async (ctx) => {
  return ctx.reply(`
Solana Trading Bot Help 📚

Commands:
/start - Show welcome message
/importwallet - Import your Solana wallet using private key or seed phrase
/balance - Check your SOL and token balances
/send - Send SOL or tokens to another address
/swap - Swap between tokens using Jupiter
/price - Check current token prices
/help - Show this help message

Security Tips:
• Never share your private key or seed phrase with anyone
• Always double-check addresses before sending
• Use small amounts for testing
• The bot encrypts your keys but use at your own risk

For more help, contact @YourSupportHandle
  `);
});

// Import wallet command
bot.command('importwallet', async (ctx) => {
  await ctx.reply(`
⚠️ SECURITY WARNING ⚠️

You are about to import your wallet's private key or seed phrase.
This information gives COMPLETE control over your funds.

While we encrypt this data, please understand the risks:
1. Only use this bot if you trust the developers
2. Consider using a separate wallet with limited funds
3. NEVER share your private key or seed phrase with anyone else

To proceed, please send your private key or seed phrase.
To cancel, type /cancel
  `);
  
  // Set the scene for the next message
  ctx.session = { ...ctx.session, awaitingPrivateKey: true };
});

// Handle private key or seed phrase input
bot.on(message('text'), async (ctx) => {
  // Check if we're awaiting a private key
  if (ctx.session?.awaitingPrivateKey) {
    const input = ctx.message.text;
    
    if (input === '/cancel') {
      ctx.session.awaitingPrivateKey = false;
      return ctx.reply('Wallet import cancelled.');
    }
    
    try {
      const result = await wallet.importWallet(ctx.from.id.toString(), input);
      
      // Reset the scene
      ctx.session.awaitingPrivateKey = false;
      
      // Delete the message containing the private key for security
      await ctx.deleteMessage(ctx.message.message_id);
      
      return ctx.reply(`
✅ Wallet imported successfully!

Your Solana address: \`${result.publicKey}\`

You can now use /balance to check your balance or /send to transfer funds.
      `, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Wallet import error:', error);
      return ctx.reply(`Error importing wallet: ${error.message}`);
    }
  }
  
  // Handle send SOL transaction
  if (ctx.session?.sendingSOL) {
    const input = ctx.message.text;
    
    if (input === '/cancel') {
      ctx.session.sendingSOL = false;
      return ctx.reply('Transaction cancelled.');
    }
    
    const parts = input.split(' ');
    if (parts.length !== 2) {
      return ctx.reply('Invalid format. Please use: `address amount`');
    }
    
    const [recipientAddress, amountStr] = parts;
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Invalid amount. Please enter a positive number.');
    }
    
    try {
      // Validate recipient address
      if (!isValidSolanaAddress(recipientAddress)) {
        return ctx.reply('Invalid Solana address. Please check and try again.');
      }
      
      // Ask for confirmation
      ctx.session.pendingTransaction = {
        recipient: recipientAddress,
        amount: amount
      };
      
      return ctx.reply(`
Confirm transaction:
Send ${amount} SOL to ${recipientAddress}

Are you sure?
      `, {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('Confirm', 'confirm_send_sol'),
          Markup.button.callback('Cancel', 'cancel_send_sol')
        ])
      });
    } catch (error) {
      return ctx.reply('Invalid Solana address. Please check and try again.');
    }
  }
  
  // Handle send token transaction
  if (ctx.session?.sendingToken) {
    const input = ctx.message.text;
    
    if (input === '/cancel') {
      ctx.session.sendingToken = false;
      return ctx.reply('Transaction cancelled.');
    }
    
    const parts = input.split(' ');
    if (parts.length !== 3) {
      return ctx.reply('Invalid format. Please use: `address token_mint amount`');
    }
    
    const [recipientAddress, tokenMint, amountStr] = parts;
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Invalid amount. Please enter a positive number.');
    }
    
    try {
      // Validate recipient address and token mint
      if (!isValidSolanaAddress(recipientAddress) || !isValidSolanaAddress(tokenMint)) {
        return ctx.reply('Invalid address or token mint. Please check and try again.');
      }
      
      // Ask for confirmation
      ctx.session.pendingTokenTransaction = {
        recipient: recipientAddress,
        tokenMint: tokenMint,
        amount: amount
      };
      
      return ctx.reply(`
Confirm token transaction:
Send ${amount} tokens (mint: ${tokenMint}) to ${recipientAddress}

Are you sure?
      `, {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('Confirm', 'confirm_send_token'),
          Markup.button.callback('Cancel', 'cancel_send_token')
        ])
      });
    } catch (error) {
      return ctx.reply('Invalid input. Please check and try again.');
    }
  }
  
  // Handle swap input
  if (ctx.session?.swapping) {
    const input = ctx.message.text;
    
    if (input === '/cancel') {
      ctx.session.swapping = false;
      return ctx.reply('Swap cancelled.');
    }
    
    const parts = input.split(' ');
    if (parts.length !== 3) {
      return ctx.reply('Invalid format. Please use: `from_token to_token amount`');
    }
    
    const [fromToken, toToken, amountStr] = parts;
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Invalid amount. Please enter a positive number.');
    }
    
    try {
      // Find tokens by symbol
      const fromTokenInfo = await swap.findTokenBySymbol(fromToken);
      const toTokenInfo = await swap.findTokenBySymbol(toToken);
      
      if (!fromTokenInfo || !toTokenInfo) {
        return ctx.reply('One or both tokens not found. Please check the symbols and try again.');
      }
      
      // Get quote
      const quote = await swap.getSwapQuote(
        fromTokenInfo.address,
        toTokenInfo.address,
        amount * (10 ** fromTokenInfo.decimals)
      );
      
      // Ask for confirmation
      ctx.session.pendingSwap = {
        fromToken: fromTokenInfo,
        toToken: toTokenInfo,
        amount: amount,
        expectedOutput: quote.outAmount / (10 ** toTokenInfo.decimals)
      };
      
      return ctx.reply(`
Swap Quote:
${amount} ${fromTokenInfo.symbol} → ${ctx.session.pendingSwap.expectedOutput.toFixed(6)} ${toTokenInfo.symbol}

Proceed with swap?
      `, {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('Confirm', 'confirm_swap'),
          Markup.button.callback('Cancel', 'cancel_swap')
        ])
      });
    } catch (error) {
      console.error('Swap quote error:', error);
      return ctx.reply(`Error getting swap quote: ${error.message}`);
    }
  }
});

// Balance command
bot.command('balance', async (ctx) => {
  try {
    const keypair = await wallet.getUserWallet(ctx.from.id.toString());
    
    if (!keypair) {
      return ctx.reply('You need to import a wallet first. Use /importwallet');
    }
    
    const publicKey = keypair.publicKey.toString();
    
    // Get SOL balance
    const solBalance = await wallet.getSolBalance(publicKey);
    
    // Get token balances
    const tokenAccounts = await wallet.getTokenAccounts(publicKey);
    
    let message = `
💰 Wallet Balance

SOL: ${solBalance.toFixed(4)} SOL
Address: \`${publicKey}\`
    `;
    
    if (tokenAccounts.length > 0) {
      message += '\nToken Balances:\n';
      
      for (const token of tokenAccounts) {
        message += `${token.amount} (mint: ${token.mint})\n`;
      }
    } else {
      message += '\nNo token balances found.';
    }
    
    message += '\nUse /send to transfer funds.';
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Balance check error:', error);
    return ctx.reply(`Error checking balance: ${error.message}`);
  }
});

// Send command
bot.command('send', async (ctx) => {
  const keypair = await wallet.getUserWallet(ctx.from.id.toString());
  
  if (!keypair) {
    return ctx.reply('You need to import a wallet first. Use /importwallet');
  }
  
  return ctx.reply('Choose what you want to send:', {
    reply_markup: Markup.inlineKeyboard([
      Markup.button.callback('Send SOL', 'send_sol'),
      Markup.button.callback('Send SPL Token', 'send_token')
    ])
  });
});

// Handle send SOL callback
bot.action('send_sol', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { ...ctx.session, sendingSOL: true };
  
  await ctx.reply(`
Please enter the information in this format:
\`address amount\`

Example:
\`9xDUcfd8vD88JLyVeLXsZQzVR5V3vWLU2qVEYKBQBfaw 0.1\`

This will send 0.1 SOL to the specified address.
To cancel, type /cancel
  `, { parse_mode: 'Markdown' });
});

// Handle send token callback
bot.action('send_token', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { ...ctx.session, sendingToken: true };
  
  await ctx.reply(`
Please enter the information in this format:
\`address token_mint amount\`

Example:
\`9xDUcfd8vD88JLyVeLXsZQzVR5V3vWLU2qVEYKBQBfaw EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 10\`

This will send 10 USDC to the specified address.
To cancel, type /cancel
  `, { parse_mode: 'Markdown' });
});

// Handle send confirmation
bot.action('confirm_send_sol', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (!ctx.session?.pendingTransaction) {
    return ctx.editMessageText('Transaction expired. Please try again.');
  }
  
  const { recipient, amount } = ctx.session.pendingTransaction;
  
  try {
    const keypair = await wallet.getUserWallet(ctx.from.id.toString());
    
    if (!keypair) {
      return ctx.editMessageText('Wallet not found. Please import your wallet first.');
    }
    
    // Send SOL
    const signature = await wallet.sendSol(keypair, recipient, amount);
    
    // Save transaction to database
    await Transaction.create({
      telegramId: ctx.from.id.toString(),
      type: 'SEND',
      signature,
      amount,
      token: 'SOL',
      recipient
    });
    
    // Clear session data
    ctx.session.sendingSOL = false;
    ctx.session.pendingTransaction = null;
    
    return ctx.editMessageText(`
✅ Transaction successful!

Amount: ${amount} SOL
Recipient: ${recipient}
Transaction ID: [${signature}](https://explorer.solana.com/tx/${signature})
    `, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Transaction error:', error);
    return ctx.editMessageText(`Error sending SOL: ${error.message}`);
  }
});

// Handle token send confirmation
bot.action('confirm_send_token', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (!ctx.session?.pendingTokenTransaction) {
    return ctx.editMessageText('Transaction expired. Please try again.');
  }
  
  const { recipient, tokenMint, amount } = ctx.session.pendingTokenTransaction;
  
  try {
    const keypair = await wallet.getUserWallet(ctx.from.id.toString());
    
    if (!keypair) {
      return ctx.editMessageText('Wallet not found. Please import your wallet first.');
    }
    
    // Send token
    const signature = await wallet.sendToken(keypair, recipient, tokenMint, amount);
    
    // Save transaction to database
    await Transaction.create({
      telegramId: ctx.from.id.toString(),
      type: 'SEND',
      signature,
      amount,
      token: tokenMint,
      recipient
    });
    
    // Clear session data
    ctx.session.sendingToken = false;
    ctx.session.pendingTokenTransaction = null;
    
    return ctx.editMessageText(`
✅ Token transaction successful!

Amount: ${amount} tokens
Token Mint: ${tokenMint}
Recipient: ${recipient}
Transaction ID: [${signature}](https://explorer.solana.com/tx/${signature})
    `, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Token transaction error:', error);
    return ctx.editMessageText(`Error sending token: ${error.message}`);
  }
});

// Handle send cancellation
bot.action('cancel_send_sol', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.sendingSOL = false;
  ctx.session.pendingTransaction = null;
  return ctx.editMessageText('Transaction cancelled.');
});

// Handle token send cancellation
bot.action('cancel_send_token', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.sendingToken = false;
  ctx.session.pendingTokenTransaction = null;
  return ctx.editMessageText('Token transaction cancelled.');
});

// Price command
bot.command('price', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ');
    
    if (args.length === 1) {
      // No specific token, get SOL price
      const solPrice = await price.getSolPrice();
      
      return ctx.reply(`
💰 Current Prices

SOL: $${solPrice.toFixed(2)} USD

For other tokens, use /price <token_symbol>
      `);
    } else {
      // Get specific token price
      const symbol = args[1].toUpperCase();
      try {
        const tokenPrice = await price.getTokenPrice(symbol);
        
        return ctx.reply(`
💰 Current Price

${symbol}: $${tokenPrice.toFixed(2)} USD
        `);
      } catch (error) {
        return ctx.reply(`Unable to fetch price for ${symbol}. Please check the symbol and try again.`);
      }
    }
  } catch (error) {
    console.error('Price fetch error:', error);
    return ctx.reply('Error fetching price data. Please try again later.');
  }
});

// Swap command
bot.command('swap', async (ctx) => {
  const keypair = await wallet.getUserWallet(ctx.from.id.toString());
  
  if (!keypair) {
    return ctx.reply('You need to import a wallet first. Use /importwallet');
  }
  
  ctx.session = { ...ctx.session, swapping: true };
  
  return ctx.reply(`
Please enter the swap details in this format:
\`from_token to_token amount\`

Example:
\`SOL USDC 0.1\`

This will swap 0.1 SOL for USDC.
To cancel, type /cancel
  `, { parse_mode: 'Markdown' });
});

// Handle swap confirmation
bot.action('confirm_swap', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (!ctx.session?.pendingSwap) {
    return ctx.editMessageText('Swap request expired. Please try again.');
  }
  
  const { fromToken, toToken, amount, expectedOutput } = ctx.session.pendingSwap;
  
  try {
    const keypair = await wallet.getUserWallet(ctx.from.id.toString());
    
    if (!keypair) {
      return ctx.editMessageText('Wallet not found. Please import your wallet first.');
    }
    
    // Execute swap
    const result = await swap.executeSwap(
      keypair,
      fromToken.address,
      toToken.address,
      amount * (10 ** fromToken.decimals)
    );
    
    // Save transaction to database
    await Transaction.create({
      telegramId: ctx.from.id.toString(),
      type: 'SWAP',
      signature: result.signature,
      amount,
      token: fromToken.symbol
    });
    
    // Clear session data
    ctx.session.swapping = false;
    ctx.session.pendingSwap = null;
    
    const actualOutput = result.outputAmount / (10 ** toToken.decimals);
    
    return ctx.editMessageText(`
✅ Swap successful!

Swapped: ${amount} ${fromToken.symbol} → ${actualOutput.toFixed(6)} ${toToken.symbol}
Transaction ID: [${result.signature}](https://explorer.solana.com/tx/${result.signature})
    `, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Swap error:', error);
    return ctx.editMessageText(`Error executing swap: ${error.message}`);
  }
});

// Handle swap cancellation
bot.action('cancel_swap', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.swapping = false;
  ctx.session.pendingSwap = null;
  return ctx.editMessageText('Swap cancelled.');
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('An error occurred. Please try again or contact support.');
});

// Start the bot
bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Solana Telegram Bot is running!');