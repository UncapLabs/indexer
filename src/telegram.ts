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
  trove: Trove,
  collId: string,
  blockNumber: number
): Promise<void> {
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

    // Determine title based on debt and created status
    let title: string;
    if (Number(debt) === 0) {
      title = '🔒 Trove Closed';
    } else if (created) {
      title = '🆕 Trove Created';
    } else {
      title = '🔄 Trove Updated';
    }

    const message = `━━━━━━━━━━━━━━━━━━━━
${title}

📋 Trove ID: ${trove.troveId}
💎 Collateral: ${collateralName}
📊 Interest Rate: ${interestRate}%
💰 Debt: ${debt}
🔒 Deposit: ${depositInfo}
━━━━━━━━━━━━━━━━━━━━`;

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
      console.log(`Telegram notification sent for trove ${trove.troveId}`);
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}
