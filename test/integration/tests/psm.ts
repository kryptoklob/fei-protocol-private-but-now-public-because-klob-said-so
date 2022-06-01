import chai, { expect } from 'chai';
import CBN from 'chai-bn';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { NamedContracts } from '@custom-types/types';
import { expectRevert, getAddresses, getImpersonatedSigner, resetFork, time } from '@test/helpers';
import { TestEndtoEndCoordinator } from '@test/integration/setup';
import proposals from '@test/integration/proposals_config';
import { forceEth } from '@test/integration/setup/utils';
import { Contract, Signer } from 'ethers';
import { expectApprox } from '@test/helpers';
import { WETH9 } from '@custom-types/contracts';

const toBN = ethers.BigNumber.from;

describe('e2e-peg-stability-module', function () {
  const impersonatedSigners: { [key: string]: Signer } = {};
  let contracts: NamedContracts;
  let deployAddress: string;
  let e2eCoord: TestEndtoEndCoordinator;
  let daiPCVDripController: Contract;
  let doLogging: boolean;
  let ethPSMRouter: Contract;
  let userAddress;
  let minterAddress;
  let governorAddress;
  let weth: Contract;
  let dai: Contract;
  let raiPriceBoundPSM: Contract;
  let ethPSM: Contract;
  let fei: Contract;
  let rai: Contract;
  let core: Contract;
  let feiDAOTimelock;
  let beneficiaryAddress1;
  let guardianAddress;
  let daiFixedPricePSM: Contract;

  before(async () => {
    chai.use(CBN(ethers.BigNumber));
    chai.use(solidity);
  });

  before(async function () {
    // Setup test environment and get contracts
    const version = 1;
    deployAddress = (await ethers.getSigners())[0].address;
    if (!deployAddress) throw new Error(`No deploy address!`);
    const addresses = await getAddresses();

    doLogging = Boolean(process.env.LOGGING);

    const config = {
      logging: doLogging,
      deployAddress: deployAddress,
      version: version
    };

    e2eCoord = new TestEndtoEndCoordinator(config, proposals);

    doLogging && console.log(`Loading environment...`);
    ({ contracts } = await e2eCoord.loadEnvironment());
    ({
      dai,
      weth,
      daiFixedPricePSM,
      ethPSM,
      ethPSMRouter,
      fei,
      core,
      daiPCVDripController,
      feiDAOTimelock,
      raiPriceBoundPSM,
      rai
    } = contracts);
    doLogging && console.log(`Environment loaded.`);
    weth = contracts.weth as WETH9;

    // add any addresses you want to impersonate here
    const impersonatedAddresses = [
      addresses.userAddress,
      addresses.pcvControllerAddress,
      addresses.governorAddress,
      addresses.minterAddress,
      addresses.burnerAddress,
      addresses.beneficiaryAddress1,
      addresses.beneficiaryAddress2,
      addresses.guardianAddress,
      contracts.feiDAOTimelock.address
    ];

    ({ userAddress, minterAddress, beneficiaryAddress1, guardianAddress, governorAddress } = addresses);

    await core.grantMinter(minterAddress);

    for (const address of impersonatedAddresses) {
      impersonatedSigners[address] = await getImpersonatedSigner(address);
    }
  });

  describe('weth-router', async () => {
    describe('redeem', async () => {
      const redeemAmount = 10_000_000;
      before(async () => {
        const paused = await ethPSM.redeemPaused();
        if (paused) {
          await ethPSM.unpauseRedeem();
        }
      });

      beforeEach(async () => {
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, redeemAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(ethPSMRouter.address, redeemAmount);
      });

      it('exchanges 10,000,000 FEI for 1994 ETH', async () => {
        const startingFEIBalance = await fei.balanceOf(userAddress);
        const startingETHBalance = await ethers.provider.getBalance(beneficiaryAddress1);
        const expectedEthAmount = await ethPSMRouter.getRedeemAmountOut(redeemAmount);

        await ethPSMRouter
          .connect(impersonatedSigners[userAddress])
          ['redeem(address,uint256,uint256)'](beneficiaryAddress1, redeemAmount, expectedEthAmount);

        const endingFEIBalance = await fei.balanceOf(userAddress);
        const endingETHBalance = await ethers.provider.getBalance(beneficiaryAddress1);

        expect(endingETHBalance.sub(startingETHBalance)).to.be.equal(expectedEthAmount);
        expect(startingFEIBalance.sub(endingFEIBalance)).to.be.equal(redeemAmount);
      });

      it('exchanges 5,000,000 FEI for 997 ETH', async () => {
        const startingFEIBalance = await fei.balanceOf(userAddress);
        const startingETHBalance = await ethers.provider.getBalance(beneficiaryAddress1);
        const expectedEthAmount = await ethPSMRouter.getRedeemAmountOut(redeemAmount / 2);

        await ethPSMRouter
          .connect(impersonatedSigners[userAddress])
          ['redeem(address,uint256,uint256)'](beneficiaryAddress1, redeemAmount / 2, expectedEthAmount);

        const endingFEIBalance = await fei.balanceOf(userAddress);
        const endingETHBalance = await ethers.provider.getBalance(beneficiaryAddress1);
        expect(endingETHBalance.sub(startingETHBalance)).to.be.equal(expectedEthAmount);
        expect(startingFEIBalance.sub(endingFEIBalance)).to.be.equal(redeemAmount / 2);
      });

      it('passthrough getRedeemAmountOut returns same value as PSM', async () => {
        const actualEthAmountRouter = await ethPSMRouter.getRedeemAmountOut(redeemAmount);
        const actualEthAmountPSM = await ethPSM.getRedeemAmountOut(redeemAmount);
        expect(actualEthAmountPSM).to.be.equal(actualEthAmountRouter);
      });
    });

    describe('mint', function () {
      const mintAmount = 2_000;

      before(async function () {
        const paused = await ethPSM.paused();
        if (paused) {
          // if minting is paused, unpause for e2e tests
          await ethPSM.unpause();
        }
      });

      beforeEach(async () => {
        await forceEth(userAddress);
      });

      it('mint succeeds with 1 ether', async () => {
        const minAmountOut = await ethPSMRouter.getMintAmountOut(ethers.constants.WeiPerEther);
        const userStartingFEIBalance = await fei.balanceOf(userAddress);

        await ethPSMRouter
          .connect(impersonatedSigners[userAddress])
          ['mint(address,uint256,uint256)'](userAddress, minAmountOut, ethers.constants.WeiPerEther, {
            value: ethers.constants.WeiPerEther
          });

        const userEndingFEIBalance = await fei.balanceOf(userAddress);
        expect(userEndingFEIBalance.sub(userStartingFEIBalance)).to.be.gte(minAmountOut);
      });

      it('mint succeeds with 2 ether', async () => {
        const ethAmountIn = toBN(2).mul(ethers.constants.WeiPerEther);
        const minAmountOut = await ethPSMRouter.getMintAmountOut(ethAmountIn);
        const userStartingFEIBalance = await fei.balanceOf(userAddress);

        await ethPSMRouter
          .connect(impersonatedSigners[userAddress])
          ['mint(address,uint256,uint256)'](userAddress, minAmountOut, ethAmountIn, { value: ethAmountIn });

        const userEndingFEIBalance = await fei.balanceOf(userAddress);
        expect(userEndingFEIBalance.sub(userStartingFEIBalance)).to.be.equal(minAmountOut);
      });

      it('passthrough getMintAmountOut returns same value as PSM', async () => {
        const actualEthAmountRouter = await ethPSMRouter.getMintAmountOut(mintAmount);
        const actualEthAmountPSM = await ethPSM.getMintAmountOut(mintAmount);
        expect(actualEthAmountPSM).to.be.equal(actualEthAmountRouter);
      });
    });
  });

  describe('weth-psm', async () => {
    describe('redeem', function () {
      const redeemAmount = 10_000_000;
      beforeEach(async () => {
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, redeemAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(ethPSM.address, redeemAmount);
      });

      it('exchanges 10,000,000 FEI for WETH', async () => {
        const startingFEIBalance = await fei.balanceOf(userAddress);
        const startingWETHBalance = await weth.balanceOf(userAddress);
        const expectedEthAmount = await ethPSM.getRedeemAmountOut(redeemAmount);

        await ethPSM.connect(impersonatedSigners[userAddress]).redeem(userAddress, redeemAmount, expectedEthAmount);

        const endingFEIBalance = await fei.balanceOf(userAddress);
        const endingWETHBalance = await weth.balanceOf(userAddress);

        expect(endingWETHBalance.sub(startingWETHBalance)).to.be.equal(expectedEthAmount);
        expect(startingFEIBalance.sub(endingFEIBalance)).to.be.equal(redeemAmount);
        expect(expectedEthAmount).to.be.gt(0);
      });

      it('exchanges 5,000,000 FEI for WETH', async () => {
        const startingFEIBalance = await fei.balanceOf(userAddress);
        const startingWETHBalance = await weth.balanceOf(userAddress);
        const expectedEthAmount = await ethPSM.getRedeemAmountOut(redeemAmount / 2);

        await ethPSM.connect(impersonatedSigners[userAddress]).redeem(userAddress, redeemAmount / 2, expectedEthAmount);

        const endingFEIBalance = await fei.balanceOf(userAddress);
        const endingWETHBalance = await weth.balanceOf(userAddress);

        expect(endingWETHBalance.sub(startingWETHBalance)).to.be.equal(expectedEthAmount);
        expect(startingFEIBalance.sub(endingFEIBalance)).to.be.equal(redeemAmount / 2);
        expect(expectedEthAmount).to.be.gt(0); //if you receive 0 weth, there is an oracle failure or improperly setup oracle
      });
    });

    describe('mint', function () {
      const mintAmount = toBN(2).mul(ethers.constants.WeiPerEther);

      beforeEach(async () => {
        await forceEth(userAddress);
        await weth.connect(impersonatedSigners[userAddress]).deposit({ value: mintAmount });
        await weth.connect(impersonatedSigners[userAddress]).approve(ethPSM.address, mintAmount);
      });

      it('mint succeeds with 1 WETH', async () => {
        const minAmountOut = await ethPSM.getMintAmountOut(ethers.constants.WeiPerEther);
        const userStartingFEIBalance = await fei.balanceOf(userAddress);

        await ethPSM.connect(impersonatedSigners[userAddress]).mint(userAddress, mintAmount.div(2), minAmountOut);

        const userEndingFEIBalance = await fei.balanceOf(userAddress);
        expect(userEndingFEIBalance.sub(userStartingFEIBalance)).to.be.gte(minAmountOut);
        expect(minAmountOut).to.be.gt(0);
      });

      it('mint succeeds with 2 WETH', async () => {
        const ethAmountIn = toBN(2).mul(ethers.constants.WeiPerEther);
        const minAmountOut = await ethPSMRouter.getMintAmountOut(ethAmountIn);
        const userStartingFEIBalance = await fei.balanceOf(userAddress);

        await ethPSM.connect(impersonatedSigners[userAddress]).mint(userAddress, mintAmount, minAmountOut);

        const userEndingFEIBalance = await fei.balanceOf(userAddress);
        expect(userEndingFEIBalance.sub(userStartingFEIBalance)).to.be.equal(minAmountOut);
        expect(minAmountOut).to.be.gt(0);
      });
    });
  });

  describe('dai-psm pcv drip controller', async () => {
    before(async function () {
      // make sure there is enough DAI available to the dripper and on the PSM
      const DAI_HOLDER = '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7'; // curve 3pool
      const signer = await getImpersonatedSigner(DAI_HOLDER);
      await forceEth(DAI_HOLDER);
      await contracts.dai.connect(signer).transfer(
        contracts.compoundDaiPCVDeposit.address,
        '100000000000000000000000000' // 100M
      );
      await contracts.compoundDaiPCVDeposit.deposit();
      await contracts.dai.connect(signer).transfer(
        daiFixedPricePSM.address,
        '5500000000000000000000000' // 5.5M
      );
    });

    beforeEach(async () => {
      await time.increase('2000');
    });

    it('does not drip when the dai PSM is above the threshold', async () => {
      expect(await daiPCVDripController.isTimeEnded()).to.be.true;
      expect(await daiPCVDripController.dripEligible()).to.be.false;
      await expectRevert(daiPCVDripController.drip(), 'PCVDripController: not eligible');
    });

    it('does drip when the dai PSM is under the threshold', async () => {
      const timelock = await getImpersonatedSigner(feiDAOTimelock.address);
      await daiFixedPricePSM
        .connect(timelock)
        .withdrawERC20(
          dai.address,
          contracts.compoundDaiPCVDeposit.address,
          await dai.balanceOf(daiFixedPricePSM.address)
        );
      await contracts.compoundDaiPCVDeposit.deposit();

      expect(await dai.balanceOf(daiFixedPricePSM.address)).to.be.equal(0);

      await daiPCVDripController.drip();

      expect(await dai.balanceOf(daiFixedPricePSM.address)).to.be.equal(await daiPCVDripController.dripAmount());
    });
  });

  describe('dai_psm', async () => {
    describe('redeem', function () {
      const redeemAmount = 500_000;
      beforeEach(async () => {
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, redeemAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(daiFixedPricePSM.address, redeemAmount);

        const isPaused = await daiFixedPricePSM.paused();
        if (isPaused) {
          await daiFixedPricePSM.unpause();
        }

        const isRedeemPaused = await daiFixedPricePSM.redeemPaused();
        if (isRedeemPaused) {
          await daiFixedPricePSM.unpauseRedeem();
        }
      });

      it('exchanges 500,000 FEI for DAI', async () => {
        const startingFEIBalance = await fei.balanceOf(userAddress);
        const startingDAIBalance = await dai.balanceOf(userAddress);
        const expectedDAIAmount = await daiFixedPricePSM.getRedeemAmountOut(redeemAmount);

        await daiFixedPricePSM
          .connect(impersonatedSigners[userAddress])
          .redeem(userAddress, redeemAmount, expectedDAIAmount);

        const endingFEIBalance = await fei.balanceOf(userAddress);
        const endingDAIBalance = await dai.balanceOf(userAddress);

        expect(endingDAIBalance.sub(startingDAIBalance)).to.be.equal(expectedDAIAmount);
        expect(startingFEIBalance.sub(endingFEIBalance)).to.be.equal(redeemAmount);
        expect(expectedDAIAmount).to.be.gt(0);
      });

      it('DAI price sanity check', async () => {
        const actualDAIAmountOut = await daiFixedPricePSM.getRedeemAmountOut(redeemAmount);
        await expectApprox(actualDAIAmountOut, redeemAmount);
      });
    });

    describe('mint', function () {
      const mintAmount = 500_000;

      beforeEach(async () => {
        const daiAccount = '0xbb2e5c2ff298fd96e166f90c8abacaf714df14f8';
        const daiSigner = await getImpersonatedSigner(daiAccount);
        await forceEth(daiAccount);
        await dai.connect(daiSigner).transfer(userAddress, mintAmount);
        await dai.connect(impersonatedSigners[userAddress]).approve(daiFixedPricePSM.address, mintAmount);
      });

      it('mint succeeds with 500_000 DAI', async () => {
        const minAmountOut = await daiFixedPricePSM.getMintAmountOut(mintAmount / 2);
        const userStartingFEIBalance = await fei.balanceOf(userAddress);
        const psmStartingDAIBalance = await dai.balanceOf(daiFixedPricePSM.address);

        await daiFixedPricePSM
          .connect(impersonatedSigners[userAddress])
          .mint(userAddress, mintAmount / 2, minAmountOut);

        const psmEndingDAIBalance = await dai.balanceOf(daiFixedPricePSM.address);
        const userEndingFEIBalance = await fei.balanceOf(userAddress);

        expect(userEndingFEIBalance.sub(userStartingFEIBalance)).to.be.gte(minAmountOut);
        expect(psmEndingDAIBalance.sub(psmStartingDAIBalance)).to.be.equal(mintAmount / 2);
      });

      it('DAI price sanity check', async () => {
        const actualDAIAmountOut = await daiFixedPricePSM.getMintAmountOut(mintAmount);
        await expectApprox(actualDAIAmountOut, mintAmount);
      });
    });
  });

  describe('rai_psm', async () => {
    describe('redeem', function () {
      const redeemAmount = 1000;
      beforeEach(async () => {
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, redeemAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(raiPriceBoundPSM.address, redeemAmount);

        // Ensure RAI PSM has sufficient balance to redeem against
        const raiWhale = '0x618788357d0ebd8a37e763adab3bc575d54c2c7d';
        await forceEth(raiWhale);
        const raiWhaleSigner = await getImpersonatedSigner(raiWhale);
        await rai.connect(raiWhaleSigner).transfer(raiPriceBoundPSM.address, redeemAmount);

        // Set floor to something sufficiently low for tests to pass - RAI price on-chain fluctuates
        await raiPriceBoundPSM.connect(impersonatedSigners[userAddress]).setOracleFloorBasisPoints(25000);
      });

      it('exchanges 1000 FEI for rai', async () => {
        const startingFEIBalance = await fei.balanceOf(userAddress);
        const startingraiBalance = await rai.balanceOf(userAddress);
        const expectedraiAmount = await raiPriceBoundPSM.getRedeemAmountOut(redeemAmount);

        await raiPriceBoundPSM
          .connect(impersonatedSigners[userAddress])
          .redeem(userAddress, redeemAmount, expectedraiAmount);

        const endingFEIBalance = await fei.balanceOf(userAddress);
        const endingraiBalance = await rai.balanceOf(userAddress);

        expect(endingraiBalance.sub(startingraiBalance)).to.be.equal(expectedraiAmount);
        expect(startingFEIBalance.sub(endingFEIBalance)).to.be.equal(redeemAmount);
        expect(expectedraiAmount).to.be.gt(0);
      });

      it('exchanges 500 FEI for rai', async () => {
        const startingFEIBalance = await fei.balanceOf(userAddress);
        const startingraiBalance = await rai.balanceOf(userAddress);
        const expectedraiAmount = await raiPriceBoundPSM.getRedeemAmountOut(redeemAmount / 2);

        await raiPriceBoundPSM
          .connect(impersonatedSigners[userAddress])
          .redeem(userAddress, redeemAmount / 2, expectedraiAmount);

        const endingFEIBalance = await fei.balanceOf(userAddress);
        const endingraiBalance = await rai.balanceOf(userAddress);

        expect(endingraiBalance.sub(startingraiBalance)).to.be.equal(expectedraiAmount);
        expect(startingFEIBalance.sub(endingFEIBalance)).to.be.equal(redeemAmount / 2);
        expect(expectedraiAmount).to.be.gt(0); //if you receive 0 weth, there is an oracle failure or improperly setup oracle
      });

      it('rai price sanity check', async () => {
        const actualraiAmountOut = await raiPriceBoundPSM.getRedeemAmountOut(redeemAmount);
        await expectApprox(actualraiAmountOut, redeemAmount);
      });
    });

    describe('mint', function () {
      const mintAmount = 10_000_000;

      beforeEach(async () => {
        const raiAccount = '0x618788357d0ebd8a37e763adab3bc575d54c2c7d';
        const raiSigner = await getImpersonatedSigner(raiAccount);
        await forceEth(raiAccount);
        await rai.connect(raiSigner).transfer(userAddress, mintAmount);
        await rai.connect(impersonatedSigners[userAddress]).approve(raiPriceBoundPSM.address, mintAmount * 2);

        // Set floor to something sufficiently low for tests to pass - RAI price on-chain fluctuates
        await raiPriceBoundPSM.connect(impersonatedSigners[userAddress]).setOracleFloorBasisPoints(2500);
      });

      it('cannot mint because the rai psm is paused', async () => {
        await expect(
          raiPriceBoundPSM.connect(impersonatedSigners[userAddress]).mint(userAddress, mintAmount, mintAmount)
        ).to.be.revertedWith('PegStabilityModule: Minting paused');
      });

      it('mint succeeds with 5_000_000 rai', async () => {
        await raiPriceBoundPSM.connect(impersonatedSigners[feiDAOTimelock.address]).unpauseMint();
        const minAmountOut = await raiPriceBoundPSM.getMintAmountOut(mintAmount / 2);
        const userStartingFEIBalance = await fei.balanceOf(userAddress);
        const psmStartingraiBalance = await rai.balanceOf(raiPriceBoundPSM.address);

        await raiPriceBoundPSM
          .connect(impersonatedSigners[userAddress])
          .mint(userAddress, mintAmount / 2, minAmountOut);

        const psmEndingraiBalance = await rai.balanceOf(raiPriceBoundPSM.address);
        const userEndingFEIBalance = await fei.balanceOf(userAddress);

        expect(userEndingFEIBalance.sub(userStartingFEIBalance)).to.be.gte(minAmountOut);
        expect(psmEndingraiBalance.sub(psmStartingraiBalance)).to.be.equal(mintAmount / 2);
      });

      it('mint succeeds with 10_000_000 rai', async () => {
        await raiPriceBoundPSM.connect(impersonatedSigners[feiDAOTimelock.address]).unpauseMint();
        const minAmountOut = await raiPriceBoundPSM.getMintAmountOut(mintAmount);
        const userStartingFEIBalance = await fei.balanceOf(userAddress);
        const psmStartingraiBalance = await rai.balanceOf(raiPriceBoundPSM.address);

        await raiPriceBoundPSM.connect(impersonatedSigners[userAddress]).mint(userAddress, mintAmount, minAmountOut);

        const psmEndingraiBalance = await rai.balanceOf(raiPriceBoundPSM.address);
        const userEndingFEIBalance = await fei.balanceOf(userAddress);

        expect(userEndingFEIBalance.sub(userStartingFEIBalance)).to.be.equal(minAmountOut);
        expect(psmEndingraiBalance.sub(psmStartingraiBalance)).to.be.equal(mintAmount);
      });

      it('rai price sanity check', async () => {
        const actualraiAmountOut = await raiPriceBoundPSM.getMintAmountOut(mintAmount);
        await expectApprox(actualraiAmountOut, mintAmount);
      });
    });
  });
});
