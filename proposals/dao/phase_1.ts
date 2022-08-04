import { ethers } from 'hardhat';
import { expect } from 'chai';
import {
  DeployUpgradeFunc,
  NamedAddresses,
  SetupUpgradeFunc,
  TeardownUpgradeFunc,
  ValidateUpgradeFunc
} from '@custom-types/types';
import { getImpersonatedSigner } from '@test/helpers';
import { BigNumber } from 'ethers';
import { abi as timelockABI } from '../../artifacts/contracts/timelocks/TimelockedDelegator.sol/TimelockedDelegator.json';

const toBN = ethers.BigNumber.from;
/*

Phase 1: Clawback vesting TRIBE and FEI and remove Uniswap liquidity

1. Clawback La Tribu timelocks
2. Accept beneficiary of vesting FEI and TRIBE contracts
3. Transfer ownership of the IDO liquidity
4. Early unlock the IDO liquidity, burn the FEI and send the TRIBE to the Treasury

*/

const fipNumber = 'phase_1_clawback_remove_liquidity';

// Approximate bounds on the FEI to be burned after LP tokens redeemed
const LOWER_BOUND_FEI = ethers.constants.WeiPerEther.mul(35_000_000);
const UPPER_BOUND_FEI = ethers.constants.WeiPerEther.mul(45_000_000);

// Expected bounds on the TRIBE to be transferred to the Core Treasury after LP tokens redeemed
const LOWER_BOUND_TRIBE = ethers.constants.WeiPerEther.mul(200_000_000);
const UPPER_BOUND_TRIBE = ethers.constants.WeiPerEther.mul(300_000_000);

let initialFeiTotalSupply: BigNumber;
let initialTribeTreasuryBalance: BigNumber;
let initialIDOBeneficiaryBalance: BigNumber;

// Do any deployments
// This should exclusively include new contract deployments
const deploy: DeployUpgradeFunc = async (deployAddress: string, addresses: NamedAddresses, logging: boolean) => {
  // Deploy IDO Liquidity Remover helper contract
  const IDOLiquidityRemovalFactory = await ethers.getContractFactory('IDOLiquidityRemover');
  const idoLiquidityRemover = await IDOLiquidityRemovalFactory.deploy(addresses.core);
  await idoLiquidityRemover.deployTransaction.wait();
  console.log('IDO liquidity remover deployed to: ', idoLiquidityRemover.address);

  return {
    idoLiquidityRemover
  };
};

// Do any setup necessary for running the test.
// This could include setting up Hardhat to impersonate accounts,
// ensuring contracts have a specific state, etc.
const setup: SetupUpgradeFunc = async (addresses, oldContracts, contracts, logging) => {
  initialFeiTotalSupply = await contracts.fei.totalSupply();
  initialTribeTreasuryBalance = await contracts.tribe.balanceOf(addresses.core);
  initialIDOBeneficiaryBalance = await contracts.feiTribePair.balanceOf(addresses.feiLabsTreasuryMultisig);

  // 1. Call releaseMax on the IDO Liquidity Timelock to release all vested liquidity
  const feiLabsTreasurySigner = await getImpersonatedSigner(addresses.feiLabsTreasuryMultisig);
  await contracts.idoLiquidityTimelock.connect(feiLabsTreasurySigner).releaseMax(addresses.feiLabsTreasuryMultisig);

  // 2. Set pending beneficiary of IDO liquidity timelock to the DAO timelock
  await contracts.idoLiquidityTimelock.connect(feiLabsTreasurySigner).setPendingBeneficiary(addresses.feiDAOTimelock);

  // 3. Set pending beneficiary of vesting team timelock to the DAO timelock
  // Team vesting contracts
  const teamBeneficiarySigner = await getImpersonatedSigner(addresses.feiLabsTreasuryMultisig);
  const teamTimelock = new ethers.Contract(addresses.teamVestingTimelock, timelockABI, teamBeneficiarySigner);
  await teamTimelock.setPendingBeneficiary(addresses.feiDAOTimelock);
};

// Tears down any changes made in setup() that need to be
// cleaned up before doing any validation checks.
const teardown: TeardownUpgradeFunc = async (addresses, oldContracts, contracts, logging) => {
  console.log(`No actions to complete in teardown for fip${fipNumber}`);
};

// Run any validations required on the fip using mocha or console logging
// IE check balances, check state of contracts, etc.
const validate: ValidateUpgradeFunc = async (addresses, oldContracts, contracts, logging) => {
  // 1. Validate IDO liquidity remover configured
  expect(await contracts.idoLiquidityRemover.UNISWAP_ROUTER()).to.be.equal(addresses.uniswapRouter);
  expect(await contracts.idoLiquidityRemover.FEI_TRIBE_PAIR()).to.be.equal(addresses.feiTribePair);

  // 2. Validate La Tribu clawed back
  expect(await contracts.fei.balanceOf(addresses.laTribuFeiTimelock)).to.be.equal(0);
  expect(await contracts.tribe.balanceOf(addresses.laTribuTribeTimelock)).to.be.equal(0);

  // 3. Validate team vesting timelock accepted beneficiary
  expect(await contracts.teamVestingTimelock.beneficiary()).to.be.equal(addresses.feiDAOTimelock);

  // 4. Validate beneficiary received all vested/claimable funds from IDO timelock
  const IDOBeneficiaryBalanceDiff = (await contracts.feiTribePair.balanceOf(addresses.feiLabsTreasuryMultisig)).sub(
    initialIDOBeneficiaryBalance
  );
  expect(IDOBeneficiaryBalanceDiff).to.be.bignumber.greaterThan(toBN(0)); // should have claimed funds
  console.log('Vested funds: ', IDOBeneficiaryBalanceDiff.toString());

  // 5. IDO LP liquidity timelock should have no LP tokens or FEI or TRIBE
  expect(await contracts.feiTribePair.balanceOf(addresses.idoLiquidityTimelock)).to.be.equal(0);
  expect(await contracts.fei.balanceOf(addresses.idoLiquidityTimelock)).to.be.equal(0);
  expect(await contracts.tribe.balanceOf(addresses.idoLiquidityTimelock)).to.be.equal(0);

  // 6. IDO FEI should have been burned, TRIBE should have been sent to Treasury
  // Fei-Tribe LP worth ~$85M
  // Constant product AMM, so equal worth of FEI and TRIBE
  // $42.5M FEI, $42.5M TRIBE
  // 1 FEI = $1, 1 TRIBE ~= $0.15
  // All FEI (~42.5M) burned
  // Expect, ~280M TRIBE
  const feiBurned = initialFeiTotalSupply.sub(await contracts.fei.totalSupply());
  console.log('FEI redeemed: ', feiBurned.toString());
  expect(feiBurned).to.be.bignumber.greaterThan(LOWER_BOUND_FEI);
  expect(feiBurned).to.be.bignumber.lessThan(UPPER_BOUND_FEI);

  // Validate TRIBE sent to Treasury
  const tribeRedeemed = (await contracts.tribe.balanceOf(addresses.core)).sub(initialTribeTreasuryBalance);
  expect(tribeRedeemed).to.be.bignumber.greaterThan(LOWER_BOUND_TRIBE);
  expect(tribeRedeemed).to.be.bignumber.lessThan(UPPER_BOUND_TRIBE);
  console.log('TRIBE redeemed: ', tribeRedeemed.toString());

  // Maybe verify remaining liquidity in the Uniswap pool?

  // 7. Validate TRIBE approval revoked from Tribal Council timelock
  expect(await contracts.tribe.allowance(addresses.feiDAOTimelock, addresses.tribalCouncilTimelock)).to.equal(0);
};

export { deploy, setup, teardown, validate };
