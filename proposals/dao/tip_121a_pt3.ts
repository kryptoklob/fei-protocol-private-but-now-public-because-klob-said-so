import hre, { ethers, artifacts } from 'hardhat';
import { expect } from 'chai';
import {
  DeployUpgradeFunc,
  NamedAddresses,
  SetupUpgradeFunc,
  TeardownUpgradeFunc,
  ValidateUpgradeFunc
} from '@custom-types/types';
import { BigNumber } from 'ethers';
import { getImpersonatedSigner } from '@test/helpers';
import { forceEth } from '@test/integration/setup/utils';

/*

TIP_121a(pt. 3): Technical cleanup, minor role revokation and La Tribu clawback

*/

// Minimum amount of FEI that should have been clawed back
const MIN_LA_TRIBU_FEI_RECOVERED = ethers.constants.WeiPerEther.mul(700_000);

let initialPSMFeiBalance: BigNumber;
let initialDAOTribeBalance: BigNumber;

const fipNumber = 'tip_121a_cleanup';

// Do any deployments
// This should exclusively include new contract deployments
const deploy: DeployUpgradeFunc = async (deployAddress: string, addresses: NamedAddresses, logging: boolean) => {
  console.log(`No deploy actions for fip${fipNumber}`);
  return {
    // put returned contract objects here
  };
};

// Do any setup necessary for running the test.
// This could include setting up Hardhat to impersonate accounts,
// ensuring contracts have a specific state, etc.
const setup: SetupUpgradeFunc = async (addresses, oldContracts, contracts, logging) => {
  initialPSMFeiBalance = await contracts.fei.balanceOf(addresses.daiFixedPricePSM);
  initialDAOTribeBalance = await contracts.tribe.balanceOf(addresses.feiDAOTimelock);

  // Set pending beneficiary of Rari Infra timelocks to be Fei DAO timelock
  const tcTimelockSigner = await getImpersonatedSigner(addresses.tribalCouncilTimelock);
  await forceEth(addresses.tribalCouncilTimelock);

  await contracts.rariInfraFeiTimelock.connect(tcTimelockSigner).setPendingBeneficiary(addresses.feiDAOTimelock);
  await contracts.rariInfraTribeTimelock.connect(tcTimelockSigner).setPendingBeneficiary(addresses.feiDAOTimelock);
};

// Tears down any changes made in setup() that need to be
// cleaned up before doing any validation checks.
const teardown: TeardownUpgradeFunc = async (addresses, oldContracts, contracts, logging) => {
  console.log(`No actions to complete in teardown for fip${fipNumber}`);
};

// Run any validations required on the fip using mocha or console logging
// IE check balances, check state of contracts, etc.
const validate: ValidateUpgradeFunc = async (addresses, oldContracts, contracts, logging) => {
  // 1. No verification of revoked Tribe roles - there are seperate e2e tests for that

  // 2. Clawback of La Tribu FEI and TRIBE timelocks worked
  // Verify no funds on timelocks
  expect(await contracts.fei.balanceOf(addresses.laTribuFeiTimelock)).to.equal(0);
  expect(await contracts.tribe.balanceOf(addresses.laTribuTribeTimelock)).to.equal(0);

  // Verify Core Treasury received TRIBE
  const daoTribeGain = (await contracts.tribe.balanceOf(addresses.feiDAOTimelock)).sub(initialDAOTribeBalance);
  expect(daoTribeGain).to.equal(ethers.constants.WeiPerEther.mul(1_000_000));

  // Verify FEI moved to DAI PSM
  const psmFeiBalanceDiff = (await contracts.fei.balanceOf(addresses.daiFixedPricePSM)).sub(initialPSMFeiBalance);
  expect(psmFeiBalanceDiff).to.be.bignumber.greaterThan(MIN_LA_TRIBU_FEI_RECOVERED);

  // 3. Verify admin accepted on deprecated Rari timelocks
  expect(await contracts.rariInfraFeiTimelock.beneficiary()).to.equal(addresses.feiDAOTimelock);
  expect(await contracts.rariInfraTribeTimelock.beneficiary()).to.equal(addresses.feiDAOTimelock);
};

export { deploy, setup, teardown, validate };
