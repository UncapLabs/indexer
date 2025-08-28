# Position Indexer

## Overview

This indexer tracks and calculates incentive points for users of the Uncap protocol - a Liquity V2 fork on Starknet that accepts Bitcoin wrappers as collateral. The system incentivizes protocol usage through a points mechanism that will eventually be redeemable for tokens.

## Architecture

The indexer is built using [Checkpoint](https://github.com/checkpoint-labs/checkpoint/), an indexing framework by SnapshotLabs. It monitors on-chain events to maintain real-time tracking of user positions across various DeFi protocols and calculates accrued points based on position values and configured weights.

## How Points Are Calculated

### Point Weights

Each tracked position type has an associated weight defined as **points per second per dollar** (`points/second/$`). For example:
- A weight of `2` means a user earns 2 points per second for each dollar deposited in that position
- Weights are configurable and stored in a configuration file

### Tracked Positions

The system currently monitors the following position types:
- **Stability Pool deposits** - Direct deposits into the Uncap stability pool
- **Liquidity Pool positions** - Ekubo DEX positions in:
  - USDU/BTC pairs
  - USDU/USDC pairs
- **Money Market deposits** - Deposits and borrows on Vesu

*Note: The list of tracked positions may expand as the protocol evolves.*

## Data Structure

### Per-User Storage

For each user, the indexer maintains:

#### Position-Specific Data
For every position type (stability pool, LP, money market, etc.):
- **Current value** - Dollar value currently deposited
- **Points earned** - Total points accumulated for this position
- **Earning rate** - Current points per second rate

#### Aggregate Data
- **Total points** - Sum of all points earned across all positions
- **Total value** - Combined dollar value of all positions
- **Total rate** - Aggregate earning rate (points per second)
- **Last update time** - Timestamp of the most recent data update

### Point Calculation Formula

When querying current points for a user, the backend calculates:

```
current_points = user.total_points + user.rate * (now() - user.last_update_time)
```

This formula ensures points continue accruing between indexer updates.

## Update Mechanism

When a user's position changes:

1. **Update the modified position**: Recalculate dollar value, points earned, and earning rate for the affected position

2. **Update other positions' points**: Calculate accrued points for all other positions since the last update (dollar values and rates remain unchanged)

3. **Recalculate aggregates**: Update total points, total value, total rate, and timestamp

This approach ensures all positions maintain accurate point accrual even when only one position changes.

## Configuration

Position weights and tracking parameters are defined in the configuration file. Administrators can adjust weights to incentivize specific protocol activities without requiring code changes.

## Technical Considerations

### Volatile LP Handling
Current implementation treats LP positions at their snapshot values. Future iterations may incorporate more sophisticated handling of volatile liquidity pool positions to account for impermanent loss and price fluctuations.

## Development

### Prerequisites
- Node.js and yarn
- Access to Starknet RPC endpoint
- Checkpoint framework

### Installation
```bash
yarn install
```

### Configuration
Edit the configuration file to set:
- RPC endpoints
- Position weights
- Contract addresses for tracked protocols

### Running the Indexer
```bash
yarn dev  # Development mode
yarn start  # Production mode
```
