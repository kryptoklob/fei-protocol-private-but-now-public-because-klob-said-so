import { ethers } from 'ethers';
import { TemplatedProposalDescription } from '@custom-types/types';

// Amount of FEI to send to DAO timelock for burning
const AMOUNT_FEI_TO_DAO_TIMELOCK = ethers.constants.WeiPerEther.mul(10_000_000);

// Minimum amount of FEI to be redeemed from Uniswap when liquidity removed
const MIN_FEI_OUT = ethers.constants.WeiPerEther.mul(40_000_000);

// Minimum amount of TRIBE to be redeemed from Uniswap when liquidity removed
const MIN_TRIBE_OUT = ethers.constants.WeiPerEther.mul(280_000_000);

// Amount of additional TRIBE to be sent from Core treasury to new timelock
// to compensate the burning of FEI (to get stable backing to 100%)
const OTC_TRIBE_AMOUNT = ethers.constants.WeiPerEther.mul(67_000_000);

const ido_liquidity_removal: TemplatedProposalDescription = {
  title: 'Remove IDO liquidity from Uniswap V2',
  commands: [
    // 1. Prepare for liquidity removal by accepting timelock beneficiary
    {
      target: 'idoLiquidityTimelock',
      values: '0',
      method: 'acceptBeneficiary()',
      arguments: (addresses) => [],
      description: 'Accept beneficiary for Fei Labs IDO Timelock (Uni-LP)'
    },

    // 2. Unlock, remove and split the liquidity
    {
      target: 'idoLiquidityTimelock',
      values: '0',
      method: 'unlockLiquidity()',
      arguments: (addresses) => [],
      description: 'Release all Fei-Tribe LP tokens to the Tribe DAO timelock'
    },
    {
      target: 'feiTribePair',
      values: '0',
      method: 'transfer(address,uint256)',
      arguments: (addresses) => [addresses.idoLiquidityRemover, '170449948038045919878524525'],
      description: 'Send all FEI-TRIBE LP tokens to the IDO Liquidity withdrawl helper contract'
    },
    {
      target: 'idoLiquidityRemover',
      values: '0',
      method: 'redeemLiquidity(uint256,uint256,uint256)',
      arguments: (addresses) => [AMOUNT_FEI_TO_DAO_TIMELOCK, MIN_FEI_OUT, MIN_TRIBE_OUT],
      description: `
      Remove liquidity from Uniswap pool, convert to FEI and TRIBE. Send 10M FEI to 
      the DAO to be burned, the remaining FEI to the new FEI timelock and all the TRIBE 
      to the new TRIBE timelock.
      `
    },
    // 3. Burn FEI to get to 100% stable backing and allocate TRIBE to cover shortfall
    {
      target: 'fei',
      values: '0',
      method: 'burn(uint256)',
      arguments: (addresses) => [AMOUNT_FEI_TO_DAO_TIMELOCK],
      description: `
      Burn 10M FEI that was sent to the DAO timelock. This will push stable backing to ~100%
      `
    },
    {
      target: 'core',
      values: '0',
      method: 'allocateTribe(address,uint256)',
      arguments: (addresses) => [addresses.tribeIDOTimelock, OTC_TRIBE_AMOUNT],
      description:
        'Send 67M TRIBE from the Treasury to the new TRIBE IDO timelock, to compensate the burned FEI shortfall'
    }
  ],
  description: `
  Remove the IDO liquidity of Fei-Tribe from Uniswap V2

  Specifically, this proposal:
  1. Accepts the pending beneficiary of the IDO liquidity timelock 
     as the Tribe DAO timelock
  2. Unlocks all liquidity - Fei-Tribe LP tokens - held by the timelock.
  3. Transfers the Fei-Tribe LP tokens to a helper contract. This helper contract
     redeems the LP tokens for the underlying FEI and TRIBE tokens in the Uniswap pool.

     It then splits the liquidity accordingly:
     a. Send 10M FEI to the DAO timelock, where it will then be burned. This is enough to 
        push the stable backing to 100%
     b. Send the remaining FEI to the new FEI timelock
     c. Send all unlocked TRIBE liquidity to the new TRIBE timelock
  4. Convert the 10M burned FEI to TRIBE (to cover the investor shortfall from burning)
     and send to the new TRIBE timelock. This is done by allocating from the Core Treasury
     the equivalent amount of TRIBE for the FEI burned.
  `
};

export default ido_liquidity_removal;
