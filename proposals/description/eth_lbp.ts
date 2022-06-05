import { ProposalDescription } from '@custom-types/types';

const eth_lbp: ProposalDescription = {
  title: 'FIP-110: Reinforce PCV via ETH LBP and tighter spread',
  commands: [
    {
      target: 'pcvGuardianNew',
      values: '0',
      method: 'setSafeAddresses(address[])',
      arguments: [['{ethToDaiLBPSwapper}']],
      description: 'Set the ethToDai LBP swapper to be guardian Safe addresses'
    },
    ////////    ETH LBP    ////////
    {
      target: 'pcvGuardianNew',
      values: '0',
      method: 'withdrawToSafeAddress(address,address,uint256,bool,bool)',
      arguments: ['{aaveEthPCVDeposit}', '{ethToDaiLBPSwapper}', '20000000000000000000000', false, false],
      description: 'Transfer WETH from Aave to the LBP swapper'
    },
    {
      target: 'pcvGuardianNew',
      values: '0',
      method: 'withdrawToSafeAddress(address,address,uint256,bool,bool)',
      arguments: ['{compoundDaiPCVDeposit}', '{ethToDaiLBPSwapper}', '3000000000000000000000000', false, false],
      description: 'Withdraw 3M DAI from the CompoundPCVDeposit and transfer to the LBP pool'
    },
    // Swap and update CR oracle
    {
      target: 'ethToDaiLBPSwapper',
      values: '0',
      method: 'swap()',
      arguments: [],
      description: 'Start the auction and override the current no-op auction'
    },
    {
      target: 'collateralizationOracle',
      values: '0',
      method: 'addDeposit(address)',
      arguments: ['{ethToDaiLensDai}'],
      description: 'Add DAI swapper lens to the CR oracle'
    },
    {
      target: 'collateralizationOracle',
      values: '0',
      method: 'addDeposit(address)',
      arguments: ['{ethToDaiLensEth}'],
      description: 'Add ETH swapper lens to the CR oracle'
    },
    ////// Tighten ETH PSM //////////
    {
      target: 'ethPSM',
      values: '0',
      method: 'setRedeemFee(uint256)',
      arguments: ['60'],
      description: 'set PSM spread to 60'
    }
  ],
  description: `
  FIP-110: Reinforce PCV via ETH LBP and tighter spread.
  `
};

export default eth_lbp;