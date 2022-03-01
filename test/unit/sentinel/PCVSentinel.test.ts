import { balance, expectRevert, getAddresses, getCore, getImpersonatedSigner } from '@test/helpers';
import { expect } from 'chai';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import {
  Core,
  MockERC20__factory,
  MockPCVDepositV2__factory,
  PCVDeposit,
  PCVSentinel,
  MockERC20,
  NoOpGuard,
  BalanceGuard,
  MultiActionGuard,
  ReEntrancyGuard
} from '@custom-types/contracts';
import chai from 'chai';
import { forceEth, forceSpecificEth } from '@test/integration/setup/utils';

// This will theoretically make the error stack actually print!
chai.config.includeStack = true;

// Import if needed, just a helper.
// const toBN = ethers.BigNumber.from;

describe.only('PCV Sentinel', function () {
  // variable decs for vars that you want to use in multiple tests
  // typeing contracts specifically to what kind they are will catch before you run them!
  let core: Core;
  let pcvSentinel: PCVSentinel;
  let noOpGuard: NoOpGuard;
  let balanceGuard: BalanceGuard;
  let multiActionGuard: MultiActionGuard;
  let reEntrancyGuard: ReEntrancyGuard;

  let userAddress: string;
  let userAddress2: string;
  let pcvControllerAddress: string;
  let governorAddress: string;
  let guardianAddress: string;

  const impersonatedSigners: { [key: string]: Signer } = {};

  before(async () => {
    // add any addresses that you want to get here
    const addresses = await getAddresses();

    userAddress = addresses.userAddress;
    userAddress2 = addresses.secondUserAddress;
    pcvControllerAddress = addresses.pcvControllerAddress;
    governorAddress = addresses.governorAddress;
    guardianAddress = addresses.guardianAddress;

    // add any addresses you want to impersonate here
    const impersonatedAddresses = [userAddress, pcvControllerAddress, governorAddress, guardianAddress];

    for (const address of impersonatedAddresses) {
      impersonatedSigners[address] = await getImpersonatedSigner(address);
    }
  });

  beforeEach(async () => {
    // If the forked-network state needs to be reset between each test, run this
    // await network.provider.request({method: 'hardhat_reset', params: []});

    // Do any pre-test setup here
    core = await getCore();

    const pcvSentinelFactory = await ethers.getContractFactory('PCVSentinel');
    const noOpGuardFactory = await ethers.getContractFactory('NoOpGuard');
    const balanceGuardFactory = await ethers.getContractFactory('BalanceGuard');
    const multiActionGuardFactory = await ethers.getContractFactory('MultiActionGuard');
    const reEntrancyGuardFactory = await ethers.getContractFactory('ReEntrancyGuard');

    pcvSentinel = await (await pcvSentinelFactory.deploy(core.address)).deployed();
    noOpGuard = await (await noOpGuardFactory.deploy()).deployed();
    balanceGuard = await (await balanceGuardFactory.deploy()).deployed();
    multiActionGuard = await (await multiActionGuardFactory.deploy()).deployed();
    reEntrancyGuard = await (await reEntrancyGuardFactory.deploy()).deployed();

    // To deploy a contract, import and use the contract factory specific to that contract
    // note that the signer supplied is optional
  });

  // Try and do as much deployment in beforeEach, and as much testing in the actual functions
  describe('sentinel setup and view funcs', async () => {
    it('has no guards upon deployment', async () => {
      expect((await pcvSentinel.allGuards()).length).to.equal(0);
    });

    it('reports guards after they are added', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(noOpGuard.address);
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(balanceGuard.address);
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(multiActionGuard.address);
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(reEntrancyGuard.address);

      expect((await pcvSentinel.allGuards()).length).to.equal(4);
      expect(await pcvSentinel.isGuard(noOpGuard.address)).to.equal(true);
      expect(await pcvSentinel.isGuard(balanceGuard.address)).to.equal(true);
      expect(await pcvSentinel.isGuard(multiActionGuard.address)).to.equal(true);
      expect(await pcvSentinel.isGuard(reEntrancyGuard.address)).to.equal(true);
      expect(await pcvSentinel.isGuard(userAddress)).to.equal(false);
    });
  });

  describe('sentinel with no-op guard', async () => {
    it('adds and checks and protecs', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(noOpGuard.address);
      expect(await pcvSentinel.isGuard(noOpGuard.address)).to.equal(true);
      await expect(pcvSentinel.protec(noOpGuard.address)).to.emit(pcvSentinel, 'Protected');
    });
  });

  describe('sentinel with basic condition check', async () => {
    it('adds and checks and protecs', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(balanceGuard.address);
      expect(await pcvSentinel.isGuard(balanceGuard.address)).to.equal(true);
      await expect(pcvSentinel.protec(balanceGuard.address)).to.emit(pcvSentinel, 'Protected');
    });

    it('reverts if condition not met', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(balanceGuard.address);
      await forceSpecificEth(balanceGuard.address, '1');
      await expect(pcvSentinel.protec(balanceGuard.address)).to.be.revertedWith('No need to protec.');
    });
  });

  describe('sentinel with multi-action guard', async () => {
    it('adds and checks and protecs', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(multiActionGuard.address);
      await expect(pcvSentinel.protec(multiActionGuard.address)).to.emit(pcvSentinel, 'Protected');
    });
  });

  describe('sentinel with several guards', async () => {
    it('does not execute failing guards when failures are allowed', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(balanceGuard.address);

      await forceSpecificEth(balanceGuard.address, '1');

      await expect(
        pcvSentinel.protecMany(true, [
          balanceGuard.address, // should not execute
          balanceGuard.address, // should not execute
          balanceGuard.address // should not execute
        ])
      )
        .to.emit(pcvSentinel, 'ProtecFailure')
        .and.to.not.emit(pcvSentinel, 'Protected');
    });

    it('reverts when failures are not allowed', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(balanceGuard.address);

      await forceSpecificEth(balanceGuard.address, '1');

      await expect(
        pcvSentinel.protecMany(false, [
          balanceGuard.address, // should not execute
          balanceGuard.address, // should not execute
          balanceGuard.address // should not execute
        ])
      ).to.be.reverted;
    });

    it('catches failures gracefully', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(noOpGuard.address);
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(balanceGuard.address);
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(multiActionGuard.address);
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(reEntrancyGuard.address);

      await forceSpecificEth(balanceGuard.address, '1');

      await expect(
        pcvSentinel.protecMany(true, [
          noOpGuard.address, // should execute
          multiActionGuard.address, // should execute
          reEntrancyGuard.address // should execute *and* revert
        ])
      )
        .to.emit(pcvSentinel, 'ProtecFailure')
        .withArgs(reEntrancyGuard.address)
        .and.to.emit(pcvSentinel, 'Protected')
        .withArgs(multiActionGuard.address)
        .and.to.emit(pcvSentinel, 'Protected')
        .withArgs(noOpGuard.address);
    });
  });

  describe('sentinel access control', async () => {
    it('prevents normal user from adding guards', async () => {
      await expect(pcvSentinel.connect(impersonatedSigners[userAddress]).knight(noOpGuard.address)).to.be.revertedWith(
        'CoreRef: Caller is not governor or guardian or admin'
      );
    });

    it('prevents normal user from removing guards', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(noOpGuard.address);
      await expect(pcvSentinel.connect(impersonatedSigners[userAddress]).slay(noOpGuard.address)).to.be.revertedWith(
        'CoreRef: Caller is not governor or guardian or admin'
      );
    });

    it('prevents re-entrancy/calling self', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(reEntrancyGuard.address);
      await expect(pcvSentinel.protec(reEntrancyGuard.address)).to.be.revertedWith('Nyeh!');
    });

    it('allows guardian to slay & knight', async () => {
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).knight(noOpGuard.address);
      expect(await pcvSentinel.isGuard(noOpGuard.address)).to.equal(true);
      await pcvSentinel.connect(impersonatedSigners[guardianAddress]).slay(noOpGuard.address);
      expect(await pcvSentinel.isGuard(noOpGuard.address)).to.equal(false);
    });
  });
});