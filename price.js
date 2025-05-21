import fetch from 'node-fetch';

// Get SOL price
export async function getSolPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    
    if (data && data.solana && data.solana.usd) {
      return data.solana.usd;
    } else {
      throw new Error('Unable to fetch SOL price');
    }
  } catch (error) {
    throw error;
  }
}

// Get token price by symbol
export async function getTokenPrice(symbol) {
  try {
    // This is a simplified implementation
    // In a real-world scenario, you would need to map symbols to CoinGecko IDs
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`);
    const data = await response.json();
    
    if (data && data[symbol.toLowerCase()] && data[symbol.toLowerCase()].usd) {
      return data[symbol.toLowerCase()].usd;
    } else {
      throw new Error(`Unable to fetch price for ${symbol}`);
    }
  } catch (error) {
    throw error;
  }
}

// Get multiple token prices
export async function getMultipleTokenPrices(symbols) {
  try {
    const ids = symbols.map(s => s.toLowerCase()).join(',');
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    const data = await response.json();
    
    const prices = {};
    for (const symbol of symbols) {
      if (data && data[symbol.toLowerCase()] && data[symbol.toLowerCase()].usd) {
        prices[symbol] = data[symbol.toLowerCase()].usd;
      } else {
        prices[symbol] = null;
      }
    }
    
    return prices;
  } catch (error) {
    throw error;
  }
}