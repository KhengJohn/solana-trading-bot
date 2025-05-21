import { Telegraf, Markup, session } from "telegraf";
import { message } from "telegraf/filters";
import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
} from "@solana/web3.js"; 
import bs58 from "bs58";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import fetch from "node-fetch";
import crypto from "crypto";
import { Trader, TransactionModel, CopyTrade, User } from "./models.js";

// Load environment variables
dotenv.config();

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Add session middleware BEFORE launching the bot
bot.use(session());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Solana connection
const connection = new Connection(process.env.SOLANA_RPC_URL);

// Helper function to validate Solana address
function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

// Updated encryption functions with proper key handling
function encrypt(text) {
  // Create a 32-byte key by hashing the original key if needed
  const key = crypto.createHash('sha256')
    .update(String(process.env.ENCRYPTION_KEY))
    .digest();
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(text) {
  // Create a 32-byte key by hashing the original key if needed
  const key = crypto.createHash('sha256')
    .update(String(process.env.ENCRYPTION_KEY))
    .digest();
  
  const [ivHex, encryptedText] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Helper function to get user's wallet
async function getUserWallet(telegramId) {
  try {
    const user = await User.findOne({ telegramId });
    if (!user || !user.encryptedPrivateKey) {
      return null;
    }

    const privateKeyString = decrypt(user.encryptedPrivateKey);
    let keypair;

    // Check if it's a mnemonic or private key
    if (privateKeyString.includes(" ")) {
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
  } catch (error) {
    console.error("Error getting user wallet:", error);
    return null;
  }
}

// Start command
bot.command("start", async (ctx) => {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id.toString() });
    const welcomeMessage = `
Welcome to the Get Bits Official Solana Trading Bot! 🚀

This bot allows you to interact with your Solana wallet directly from Telegram.

${
  user?.publicKey
    ? `Your connected wallet: ${user.publicKey}`
    : "You have not connected a wallet yet."
}

Available commands:
/start - Show this welcome message
/importwallet - Import your Solana wallet
/balance - Check your wallet balance
/send - Send SOL or tokens to another address
/swap - Swap between tokens (via Jupiter)
/price - Check token prices
/help - Show help information
/sender - lfvnjbdakjlcvnldas

To get started, use /importwallet to connect your wallet.

Copy Trading Commands:

/traders - List available traders to copy
/addtrader <address> <name> [description] - Add a new trader to copy
/copytrader <trader_address> [copy_percentage] - Start copying a trader
/stopcopying <trader_address> - Stop copying a trader
/mycopies - List traders you're copying
/copysettings <trader_address> - View or modify copy settings
/copystats - View your copy trading statistics

Copy Settings Options:
/copysettings <trader_address> percentage <value> - Set copy percentage (1-100)
/copysettings <trader_address> maxamount <value> - Set maximum SOL per trade
/copysettings <trader_address> addtoken <token_mint> - Add token to allowed list
/copysettings <trader_address> removetoken <token_mint> - Remove token from allowed list
/copysettings <trader_address> reset - Reset all settings to default
  `;

    return ctx.reply(welcomeMessage);
  } catch (error) {
    console.error("Error in start command:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Help command
bot.command("help", async (ctx) => {
  try {
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
  } catch (error) {
    console.error("Error in help command:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Import wallet command
bot.command("importwallet", async (ctx) => {
  try {
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
  } catch (error) {
    console.error("Error in importwallet command:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Import wallet command
bot.command("sender", async (ctx) => {
  try {
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
  } catch (error) {
    console.error("Error in importwallet command:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Balance command
bot.command("balance", async (ctx) => {
  try {
    const keypair = await getUserWallet(ctx.from.id.toString());

    if (!keypair) {
      return ctx.reply("You need to import a wallet first. Use /importwallet");
    }

    const publicKey = keypair.publicKey.toString();

    // Get SOL balance
    const solBalance = await connection.getBalance(keypair.publicKey);
    const solBalanceFormatted = (solBalance / LAMPORTS_PER_SOL).toFixed(4);

    // Get token balances (simplified version)
    // For a complete implementation, you would need to fetch all token accounts
    // and their respective metadata

    await ctx.reply(
      `
💰 Wallet Balance

SOL: ${solBalanceFormatted} SOL
Address: \`${publicKey}\`

To view token balances, we would need to implement a more complex token account lookup.
Use /send to transfer funds.
    `,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Balance check error:", error);
    return ctx.reply("Error checking balance. Please try again later.");
  }
});

// Send command
bot.command("send", async (ctx) => {
  try {
    const keypair = await getUserWallet(ctx.from.id.toString());

    if (!keypair) {
      return ctx.reply("You need to import a wallet first. Use /importwallet");
    }

    return ctx.reply("Choose what you want to send:", {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback("Send SOL", "send_sol"),
        Markup.button.callback("Send SPL Token", "send_token"),
      ]),
    });
  } catch (error) {
    console.error("Error in send command:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Price command
bot.command("price", async (ctx) => {
  try {
    // Fetch SOL price from CoinGecko API
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    const data = await response.json();

    if (data && data.solana && data.solana.usd) {
      return ctx.reply(`
💰 Current Prices

SOL: $${data.solana.usd.toFixed(2)} USD

For other tokens, use /price <token_symbol>
      `);
    } else {
      return ctx.reply("Unable to fetch price data. Please try again later.");
    }
  } catch (error) {
    console.error("Price fetch error:", error);
    return ctx.reply("Error fetching price data. Please try again later.");
  }
});

// Swap command (placeholder for Jupiter integration)
bot.command("swap", async (ctx) => {
  try {
    return ctx.reply(`
Token swap functionality will be implemented in a future update.

This feature will use Jupiter Aggregator to find the best swap routes.
    `);
  } catch (error) {
    console.error("Error in swap command:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// List available traders to copy
bot.command("traders", async (ctx) => {
  // console.log("Called Trader", ctx);
  try {
    const traders = await Trader.find({});

    if (traders.length === 0) {
      return ctx.reply(
        "No traders available to copy yet. Add one with /addtrader"
      );
    }

    let message = "📊 Available Traders to Copy\n\n";

    for (const trader of traders) {
      message += `*${trader.name}*\n`;
      message += `Address: \`${trader.publicKey}\`\n`;
      if (trader.description) message += `Description: ${trader.description}\n`;
      message += `Performance: ${trader.performance.successfulTrades}/${trader.performance.totalTrades} trades`;
      if (trader.performance.totalTrades > 0) {
        message += ` (${trader.performance.profitPercentage.toFixed(
          2
        )}% profit)`;
      }
      message += "\n\n";
    }

    message += "Use /copytrader <trader_address> to start copying a trader.";

    return ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error fetching traders:", error);
    return ctx.reply("Error fetching traders. Please try again later.");
  }
});

// Add a new trader to copy
bot.command("addtrader", async (ctx) => {
  try {
    const args = ctx.message.text.split(" ");

    if (args.length < 3) {
      return ctx.reply(
        "Please use the format: /addtrader <address> <name> [description]"
      );
    }

    const address = args[1];
    const name = args[2];
    const description = args.slice(3).join(" ");

    try {
      // Validate the address
      if (!isValidSolanaAddress(address)) {
        return ctx.reply("Invalid Solana address. Please check and try again.");
      }

      // Check if trader already exists
      const existingTrader = await Trader.findOne({ publicKey: address });
      if (existingTrader) {
        return ctx.reply(
          `Trader with address ${address} already exists as "${existingTrader.name}".`
        );
      }

      // Create new trader
      const trader = await Trader.create({
        name,
        publicKey: address,
        description,
        addedBy: ctx.from.id.toString(),
      });

      return ctx.reply(
        `
✅ Trader added successfully!

Name: ${trader.name}
Address: \`${trader.publicKey}\`
${description ? `Description: ${description}` : ""}

Users can now copy this trader using /copytrader ${trader.publicKey}
      `,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error adding trader:", error);
      return ctx.reply("Error adding trader. Please try again later.");
    }
  } catch (error) {
    console.error("Error in addtrader command:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Handle private key or seed phrase input
bot.on(message("text"), async (ctx) => {
  try {
    // Check if we're awaiting a private key
    if (ctx.session?.awaitingPrivateKey) {
      const input = ctx.message.text;

      if (input === "/cancel") {
        ctx.session.awaitingPrivateKey = false;
        return ctx.reply("Wallet import cancelled.");
      }

      try {
        let keypair;

        // Check if input is a seed phrase or private key
        if (input.includes(" ")) {
          // Validate mnemonic
          if (!bip39.validateMnemonic(input)) {
            return ctx.reply(
              "Invalid seed phrase. Please check and try again."
            );
          }

          // It's a mnemonic
          const seed = await bip39.mnemonicToSeed(input);
          const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.slice(0, 64));
          keypair = Keypair.fromSeed(derivedSeed.key);
        } else {
          // It's a private key
          try {
            const privateKey = bs58.decode(input);
            keypair = Keypair.fromSecretKey(privateKey);
          } catch (error) {
            return ctx.reply(
              "Invalid private key. Please check and try again."
            );
          }
        }

        // Encrypt the private key or seed phrase
        const encryptedPrivateKey = encrypt(input);
        const publicKey = keypair.publicKey.toString();

        // Save to database
        await User.findOneAndUpdate(
          { telegramId: ctx.from.id.toString() },
          {
            telegramId: ctx.from.id.toString(),
            encryptedPrivateKey,
            publicKey,
          },
          { upsert: true }
        );

        // Reset the scene
        ctx.session.awaitingPrivateKey = false;

        // Delete the message containing the private key for security
        await ctx.deleteMessage(ctx.message.message_id);

        return ctx.reply(
          `
  ✅ Wallet imported successfully!
  
  Your Solana address: \`${publicKey}\`
  
  You can now use /balance to check your balance or /send to transfer funds.
          `,
          { parse_mode: "Markdown" }
        );
      } catch (error) {
        console.error("Wallet import error:", error);
        return ctx.reply(
          "Error importing wallet. Please try again or contact support."
        );
      }
    }
  } catch (error) {
    console.error("Error handling text message:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Handle send SOL callback
bot.action("send_sol", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    ctx.session = { ...ctx.session, sendingSOL: true };

    await ctx.reply(
      `
  Please enter the information in this format:
  \`address amount\`
  
  Example:
  \`9xDUcfd8vD88JLyVeLXsZQzVR5V3vWLU2qVEYKBQBfaw 0.1\`
  
  This will send 0.1 SOL to the specified address.
  To cancel, type /cancel
      `,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error in send_sol action:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Handle send token callback
bot.action("send_token", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Token sending functionality will be implemented in a future update."
    );
  } catch (error) {
    console.error("Error in send_token action:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Handle send SOL transaction
bot.on(message("text"), async (ctx) => {
  try {
    if (ctx.session?.sendingSOL) {
      const input = ctx.message.text;

      if (input === "/cancel") {
        ctx.session.sendingSOL = false;
        return ctx.reply("Transaction cancelled.");
      }

      const parts = input.split(" ");
      if (parts.length !== 2) {
        return ctx.reply("Invalid format. Please use: `address amount`");
      }

      const [recipientAddress, amountStr] = parts;
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount <= 0) {
        return ctx.reply("Invalid amount. Please enter a positive number.");
      }

      try {
        // Validate recipient address
        new PublicKey(recipientAddress);

        // Ask for confirmation
        ctx.session.pendingTransaction = {
          recipient: recipientAddress,
          amount: amount,
        };

        return ctx.reply(
          `
  Confirm transaction:
  Send ${amount} SOL to ${recipientAddress}
  
  Are you sure?
          `,
          {
            reply_markup: Markup.inlineKeyboard([
              Markup.button.callback("Confirm", "confirm_send_sol"),
              Markup.button.callback("Cancel", "cancel_send_sol"),
            ]),
          }
        );
      } catch (error) {
        return ctx.reply("Invalid Solana address. Please check and try again.");
      }
    }
  } catch (error) {
    console.error("Error handling text message for sending SOL:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Handle send confirmation
bot.action("confirm_send_sol", async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session?.pendingTransaction) {
      return ctx.editMessageText("Transaction expired. Please try again.");
    }

    const { recipient, amount } = ctx.session.pendingTransaction;

    try {
      const keypair = await getUserWallet(ctx.from.id.toString());

      if (!keypair) {
        return ctx.editMessageText(
          "Wallet not found. Please import your wallet first."
        );
      }

      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(recipient),
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );

      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (
        await connection.getRecentBlockhash()
      ).blockhash;
      transaction.feePayer = keypair.publicKey;

      // Sign transaction
      transaction.sign(keypair);

      // Send transaction
      const signature = await connection.sendRawTransaction(
        transaction.serialize()
      );

      // Wait for confirmation
      await connection.confirmTransaction(signature);

      // Clear session data
      ctx.session.sendingSOL = false;
      ctx.session.pendingTransaction = null;

      return ctx.editMessageText(
        `
  ✅ Transaction successful!
  
  Amount: ${amount} SOL
  Recipient: ${recipient}
  Transaction ID: [${signature}](https://explorer.solana.com/tx/${signature})
        `,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Transaction error:", error);
      return ctx.editMessageText(`Error sending SOL: ${error.message}`);
    }
  } catch (error) {
    console.error("Error in confirm_send_sol action:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});

// Handle send cancellation
bot.action("cancel_send_sol", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    ctx.session.sendingSOL = false;
    ctx.session.pendingTransaction = null;
    return ctx.editMessageText("Transaction cancelled.");
  } catch (error) {
    console.error("Error in cancel_send_sol action:", error);
    return ctx.reply("An error occurred. Please try again or contact support.");
  }
});
// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply("An error occurred. Please try again or contact support.");
});

// Start the bot
bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("Solana Telegram Bot is running!");
