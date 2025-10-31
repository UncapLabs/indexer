import { Trove } from '../.checkpoint/models';

const START_BLOCK = '3245544';

const COLLATERAL_MAPPING: Record<string, string> = {
  '0': 'WBTC',
  '1': 'xWBTC'
};

// Price cache with 5-minute expiry
interface PriceCache {
  price: number;
  timestamp: number;
}

let wbtcPriceCache: PriceCache | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function getWBTCPrice(): Promise<number | null> {
  // Check if cache is still valid
  if (wbtcPriceCache && Date.now() - wbtcPriceCache.timestamp < CACHE_DURATION_MS) {
    console.log('Using cached WBTC price:', wbtcPriceCache.price);
    return wbtcPriceCache.price;
  }

  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) {
    console.log('CMC_API_KEY not configured, skipping price fetch');
    return null;
  }

  try {
    const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';
    const response = await fetch(`${url}?symbol=WBTC&convert=USD`, {
      method: 'GET',
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch WBTC price:', response.statusText);
      return null;
    }

    const data = await response.json();
    const price = data.data.WBTC.quote.USD.price;

    // Update cache
    wbtcPriceCache = {
      price,
      timestamp: Date.now()
    };

    console.log('Fetched fresh WBTC price:', price);
    return price;
  } catch (error) {
    console.error('Error fetching WBTC price from CoinMarketCap:', error);
    return null;
  }
}

export async function logToTelegram(
  created: boolean,
  batched: boolean,
  trove: Trove,
  collId: string,
  blockNumber: number
): Promise<void> {
  // Only send notifications on mainnet
  const chain = process.env.chain;
  if (chain !== 'mainnet') {
    console.log(`Skipping Telegram notification: chain is ${chain}, not mainnet`);
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Skip if Telegram credentials are not configured
  if (!botToken || !chatId) {
    throw new Error('Telegram credentials not configured');
  }

  // Skip if START_BLOCK is set and current block is below it
  const startBlock = process.env.START_BLOCK || START_BLOCK;
  if (startBlock) {
    const startBlockNum = parseInt(startBlock, 10);
    if (blockNumber < startBlockNum) {
      console.log(`Skipping notification: block ${blockNumber} < START_BLOCK ${startBlockNum}`);
      return;
    }
  }

  try {
    const collateralName = COLLATERAL_MAPPING[collId] || `Unknown (${collId})`;

    // Format values for display
    const interestRate = (Number(trove.interestRate) / 1e16).toFixed(2);
    const debt = (Number(trove.debt) / 1e18).toFixed(2);
    const depositBTC = Number(trove.deposit) / 1e18;

    // Get WBTC price and calculate USD value
    let depositInfo = `${depositBTC.toFixed(5)} BTC`;
    if (collateralName === 'WBTC') {
      const wbtcPrice = await getWBTCPrice();
      if (wbtcPrice) {
        const depositUSD = depositBTC * wbtcPrice;
        depositInfo = `${depositBTC.toFixed(5)} BTC ($${depositUSD.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })})`;
      }
    }

    // Determine title based on criteria:
    // - If created=true, it's a Position Created
    // - If debt=0, it's a Position Closed
    // - Otherwise, it's a Position Updated
    let title: string;
    if (created) {
      title = '🆕 Position Created';
    } else if (Number(debt) === 0) {
      title = '🔒 Position Closed';
    } else {
      title = '🔄 Position Updated';
    }

    // Build message with borrower and optional batch info
    const messageLines = [
      '━━━━━━━━━━━━━━━━━━━━',
      title,
      '',
      `👤 Borrower: ${trove.borrower}`,
      `💎 Collateral: ${collateralName}`,
      `📊 Interest Rate: ${interestRate}%`,
      `💰 Debt: ${debt}`,
      `🔒 Deposit: ${depositInfo}`
    ];

    // Add batch address if trove is part of a batch
    if (trove.interestBatch) {
      const batchAddress = trove.interestBatch.split(':')[1]; // Extract address from batch ID
      messageLines.push(`🎯 Batch: ${batchAddress}`);
    }

    messageLines.push('━━━━━━━━━━━━━━━━━━━━');
    const message = messageLines.join('\n');

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Failed to send Telegram notification:', errorData);
    } else {
      console.log(`Telegram notification sent for borrower ${trove.borrower}`);
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}
