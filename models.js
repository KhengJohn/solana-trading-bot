import mongoose from 'mongoose';

// Connect to a specific database
const DB = mongoose.connection.useDb('GetBitsOfficialBots');

// User Schema
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  encryptedPrivateKey: { type: String },
  publicKey: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const User = DB.models.User || DB.model('User', userSchema);

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  telegramId: { type: String, required: true },
  type: { type: String, enum: ['SEND', 'RECEIVE', 'SWAP'], required: true },
  signature: { type: String, required: true },
  amount: { type: Number, required: true },
  token: { type: String, default: 'SOL' },
  recipient: { type: String },
  sender: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const TransactionModel = DB.models.Transaction || DB.model('Transaction', transactionSchema);

// Trader Schema
const traderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  publicKey: { type: String, required: true, unique: true },
  description: { type: String },
  performance: {
    totalTrades: { type: Number, default: 0 },
    successfulTrades: { type: Number, default: 0 },
    profitPercentage: { type: Number, default: 0 }
  },
  addedBy: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Trader = DB.models.Trader || DB.model('Trader', traderSchema);

// CopyTrade Schema
const copyTradeSchema = new mongoose.Schema({
  telegramId: { type: String, required: true },
  traderPublicKey: { type: String, required: true },
  active: { type: Boolean, default: true },
  settings: {
    copyPercentage: { type: Number, default: 100 },
    maxAmount: { type: Number },
    allowedTokens: [{ type: String }],
    excludedTokens: [{ type: String }]
  },
  lastCheckedSignature: { type: String },
  createdAt: { type: Date, default: Date.now }
});

copyTradeSchema.index({ telegramId: 1, traderPublicKey: 1 }, { unique: true });

const CopyTrade = DB.models.CopyTrade || DB.model('CopyTrade', copyTradeSchema);

export { Trader, TransactionModel, CopyTrade, User };
