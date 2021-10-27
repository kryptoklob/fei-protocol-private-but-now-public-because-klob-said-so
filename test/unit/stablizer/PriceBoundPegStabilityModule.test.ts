import hre, { ethers } from 'hardhat';
import { expectRevert, getAddresses, getCore, deployDevelopmentWeth } from '@test/helpers';
import { expect } from 'chai';
import { Signer } from 'ethers';
import { Core, MockERC20, Fei, MockOracle, PriceBoundPSM, MockPCVDepositV2 } from '@custom-types/contracts';

const toBN = ethers.BigNumber.from;

describe('PriceBoundPegStabilityModule', function () {
  let userAddress;
  let governorAddress;
  let minterAddress;
  let pcvControllerAddress;

  const mintFeeBasisPoints = 30;
  const redeemFeeBasisPoints = 30;
  const reservesThreshold = ethers.constants.WeiPerEther.mul(10_000_000);
  const feiLimitPerSecond = ethers.constants.WeiPerEther.mul(10_000);
  const bufferCap = ethers.constants.WeiPerEther.mul(10_000_000);
  const mintAmount = ethers.constants.WeiPerEther.mul(1_000);
  const decimalsNormalizer = 0; // because the oracle price is scaled 1e18, need to divide out by that before testing
  const bpGranularity = 10_000;
  const impersonatedSigners: { [key: string]: Signer } = {};

  let core: Core;
  let asset: MockERC20;
  let fei: Fei;
  let oracle: MockOracle;
  let psm: PriceBoundPSM;
  let pcvDeposit: MockPCVDepositV2;

  before(async () => {
    const addresses = await getAddresses();

    // add any addresses you want to impersonate here
    const impersonatedAddresses = [
      addresses.userAddress,
      addresses.pcvControllerAddress,
      addresses.governorAddress,
      addresses.minterAddress,
      addresses.burnerAddress,
      addresses.beneficiaryAddress1,
      addresses.beneficiaryAddress2
    ];

    await hre.network.provider.request({
      method: 'hardhat_reset'
    });

    await deployDevelopmentWeth();

    for (const address of impersonatedAddresses) {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [address]
      });

      impersonatedSigners[address] = await ethers.getSigner(address);
    }
  });

  beforeEach(async function () {
    const addresses = await getAddresses();

    userAddress = addresses.userAddress;
    governorAddress = addresses.governorAddress;
    minterAddress = addresses.minterAddress;
    pcvControllerAddress = addresses.pcvControllerAddress;

    core = await getCore();
    fei = await ethers.getContractAt('Fei', await core.fei());
    oracle = await (await ethers.getContractFactory('MockOracle')).deploy(1);
    asset = await (await ethers.getContractFactory('MockERC20')).deploy();
    pcvDeposit = await (await ethers.getContractFactory('MockPCVDepositV2')).deploy(core.address, asset.address, 0, 0);

    psm = await (
      await ethers.getContractFactory('PriceBoundPSM')
    ).deploy(
      core.address,
      oracle.address,
      oracle.address,
      mintFeeBasisPoints,
      redeemFeeBasisPoints,
      reservesThreshold,
      feiLimitPerSecond,
      bufferCap,
      decimalsNormalizer,
      false,
      asset.address,
      pcvDeposit.address
    );

    await core.grantMinter(psm.address);
  });

  describe('Init', function () {
    it('oracle address', async function () {
      expect(await psm.oracle()).to.be.equal(oracle.address);
    });

    it('mintFeeBasisPoints', async function () {
      expect(await psm.mintFeeBasisPoints()).to.be.equal(mintFeeBasisPoints);
    });

    it('redeemFeeBasisPoints', async function () {
      expect(await psm.redeemFeeBasisPoints()).to.be.equal(redeemFeeBasisPoints);
    });

    it('reservesThreshold', async function () {
      expect(await psm.reservesThreshold()).to.be.equal(reservesThreshold);
    });

    it('rateLimitPerSecond', async function () {
      expect(await psm.rateLimitPerSecond()).to.be.equal(feiLimitPerSecond);
    });

    it('mintingBufferCap', async function () {
      expect(await psm.bufferCap()).to.be.equal(bufferCap);
    });

    it('decimalsNormalizer', async function () {
      expect(await psm.decimalsNormalizer()).to.be.equal(decimalsNormalizer);
    });

    it('doInvert', async function () {
      expect(await psm.doInvert()).to.be.equal(false);
    });

    it('token address', async function () {
      expect(await psm.token()).to.be.equal(asset.address);
    });
  });

  describe('Mint', function () {
    describe('Sells Token for FEI', function () {
      it('exchanges 10 DAI for 10 FEI', async function () {
        const ten = toBN(10);
        const userStartingFeiBalance = await fei.balanceOf(userAddress);
        const psmStartingAssetBalance = await asset.balanceOf(psm.address);
        const expectedMintAmountOut = ten.mul(bpGranularity - mintFeeBasisPoints).div(bpGranularity);

        await asset.mint(userAddress, ten);
        await asset.connect(impersonatedSigners[userAddress]).approve(psm.address, ten);

        const mintAmountOut = await psm.getMintAmountOut(ten);

        expect(mintAmountOut).to.be.equal(expectedMintAmountOut);

        await psm.connect(impersonatedSigners[userAddress]).mint(userAddress, ten, expectedMintAmountOut);

        const userEndingFeiBalance = await fei.balanceOf(userAddress);
        const psmEndingAssetBalance = await asset.balanceOf(psm.address);

        expect(userEndingFeiBalance.sub(userStartingFeiBalance)).to.be.equal(expectedMintAmountOut);
        expect(psmEndingAssetBalance.sub(psmStartingAssetBalance)).to.be.equal(ten);
        expect(await psm.buffer()).to.be.equal(bufferCap.sub(mintAmountOut));
      });

      it('exchanges 1000 DAI for 975 FEI as fee is 250 bips and exchange rate is 1:1', async function () {
        const oneK = toBN(1000);
        const newMintFee = 250;
        await psm.connect(impersonatedSigners[governorAddress]).setMintFee(newMintFee);

        const userStartingFeiBalance = await fei.balanceOf(userAddress);
        const psmStartingAssetBalance = await asset.balanceOf(psm.address);
        const expectedMintAmountOut = 975;

        await asset.mint(userAddress, oneK);
        await asset.connect(impersonatedSigners[userAddress]).approve(psm.address, oneK);

        const mintAmountOut = await psm.getMintAmountOut(oneK);

        expect(mintAmountOut).to.be.equal(expectedMintAmountOut);

        await psm.connect(impersonatedSigners[userAddress]).mint(userAddress, oneK, expectedMintAmountOut);

        const userEndingFeiBalance = await fei.balanceOf(userAddress);
        const psmEndingAssetBalance = await asset.balanceOf(psm.address);

        expect(userEndingFeiBalance.sub(userStartingFeiBalance)).to.be.equal(expectedMintAmountOut);
        expect(psmEndingAssetBalance.sub(psmStartingAssetBalance)).to.be.equal(oneK);
        expect(await psm.buffer()).to.be.equal(bufferCap.sub(mintAmountOut));
      });

      it('exchanges for appropriate amount of tokens when price is 1:1', async function () {
        const mintAmt = toBN(10_000_000);
        const userStartingFeiBalance = await fei.balanceOf(userAddress);
        const psmStartingAssetBalance = await asset.balanceOf(psm.address);
        const expectedMintAmountOut = mintAmt.mul(bpGranularity - mintFeeBasisPoints).div(bpGranularity);

        await asset.mint(userAddress, mintAmt);
        await asset.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmt);

        const mintAmountOut = await psm.getMintAmountOut(mintAmt);

        expect(mintAmountOut).to.be.equal(expectedMintAmountOut);

        await psm.connect(impersonatedSigners[userAddress]).mint(userAddress, mintAmt, expectedMintAmountOut);

        const userEndingFeiBalance = await fei.balanceOf(userAddress);
        const psmEndingAssetBalance = await asset.balanceOf(psm.address);

        expect(userEndingFeiBalance.sub(userStartingFeiBalance)).to.be.equal(expectedMintAmountOut);
        expect(psmEndingAssetBalance.sub(psmStartingAssetBalance)).to.be.equal(mintAmt);
        expect(await psm.buffer()).to.be.equal(bufferCap.sub(mintAmountOut));
      });

      it('should not exchange when expected amount out is greater than actual amount out', async function () {
        const mintAmt = toBN(10_000_000);
        const expectedMintAmountOut = mintAmt.mul(bpGranularity - mintFeeBasisPoints).div(bpGranularity);

        await asset.mint(userAddress, mintAmt);
        await asset.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmt);

        const mintAmountOut = await psm.getMintAmountOut(mintAmt);

        expect(mintAmountOut).to.be.equal(expectedMintAmountOut);

        await expectRevert(
          psm.connect(impersonatedSigners[userAddress]).mint(userAddress, mintAmt, expectedMintAmountOut.add(1)),
          'PegStabilityModule: Mint not enough out'
        );
      });

      it('fails when token is not approved to be spent by the PSM', async function () {
        await expectRevert(
          psm.connect(impersonatedSigners[userAddress]).mint(userAddress, mintAmount, 0),
          'ERC20: transfer amount exceeds balance'
        );
      });

      it('mint fails when contract is paused', async function () {
        await psm.connect(impersonatedSigners[governorAddress]).pause();
        expect(await psm.paused()).to.be.true;

        await expectRevert(
          psm.connect(impersonatedSigners[userAddress]).mint(userAddress, mintAmount, 0),
          'Pausable: paused'
        );
      });
    });
  });

  describe('Redeem', function () {
    describe('Sells FEI for Token', function () {
      beforeEach(async () => {
        await asset.mint(psm.address, mintAmount);
      });

      it('redeem fails when contract is paused', async function () {
        await oracle.setExchangeRate(ethers.constants.WeiPerEther);
        await psm.connect(impersonatedSigners[governorAddress]).pause();
        expect(await psm.paused()).to.be.true;

        await expectRevert(
          psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, 0),
          'Pausable: paused'
        );
      });

      it('redeem succeeds when user has enough funds', async function () {
        await oracle.setExchangeRate(1);
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, mintAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmount);

        const startingUserFeiBalance = await fei.balanceOf(userAddress);
        const startingUserAssetBalance = await asset.balanceOf(userAddress);

        const expectedAssetAmount = mintAmount.mul(bpGranularity - redeemFeeBasisPoints).div(bpGranularity);
        const actualAssetAmount = await psm.getRedeemAmountOut(mintAmount);
        expect(expectedAssetAmount).to.be.equal(actualAssetAmount);

        await psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, expectedAssetAmount);

        const endingUserFeiBalance = await fei.balanceOf(userAddress);
        const endingUserAssetBalance = await asset.balanceOf(userAddress);

        expect(endingUserFeiBalance).to.be.equal(startingUserFeiBalance.sub(mintAmount));
        expect(endingUserAssetBalance).to.be.equal(startingUserAssetBalance.add(actualAssetAmount));
        expect(await fei.balanceOf(psm.address)).to.be.equal(0);
        expect(await psm.buffer()).to.be.equal(bufferCap);
      });

      it('redeem succeeds when user has enough funds and DAI is $1.019', async function () {
        await oracle.setExchangeRateScaledBase(ethers.constants.WeiPerEther.mul(1019).div(1000));
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, mintAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmount);

        const startingUserFeiBalance = await fei.balanceOf(userAddress);
        const startingUserAssetBalance = await asset.balanceOf(userAddress);

        const expectedAssetAmount = mintAmount
          .mul(bpGranularity - redeemFeeBasisPoints)
          .div(bpGranularity)
          .mul(ethers.constants.WeiPerEther)
          .div(ethers.constants.WeiPerEther.mul(1019).div(1000));
        const actualAssetAmount = await psm.getRedeemAmountOut(mintAmount);

        expect(expectedAssetAmount).to.be.equal(actualAssetAmount);

        await psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, expectedAssetAmount);

        const endingUserFeiBalance = await fei.balanceOf(userAddress);
        const endingUserAssetBalance = await asset.balanceOf(userAddress);

        expect(endingUserFeiBalance).to.be.equal(startingUserFeiBalance.sub(mintAmount));
        expect(endingUserAssetBalance).to.be.equal(startingUserAssetBalance.add(actualAssetAmount));
        expect(await fei.balanceOf(psm.address)).to.be.equal(0);
        expect(await psm.buffer()).to.be.equal(bufferCap);
      });

      it('redeem succeeds when user has enough funds and DAI is $1.019 with .1 FEI', async function () {
        const pointOneFei = ethers.constants.WeiPerEther.div(10);
        await oracle.setExchangeRateScaledBase(ethers.constants.WeiPerEther.mul(1019).div(1000));
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, pointOneFei);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, pointOneFei);

        const startingUserFeiBalance = await fei.balanceOf(userAddress);
        const startingUserAssetBalance = await asset.balanceOf(userAddress);

        const expectedAssetAmount = pointOneFei
          .mul(bpGranularity - redeemFeeBasisPoints)
          .div(bpGranularity)
          .mul(ethers.constants.WeiPerEther)
          .div(ethers.constants.WeiPerEther.mul(1019).div(1000));
        const actualAssetAmount = await psm.getRedeemAmountOut(pointOneFei);

        expect(expectedAssetAmount).to.be.equal(actualAssetAmount);

        await psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, pointOneFei, expectedAssetAmount);

        const endingUserFeiBalance = await fei.balanceOf(userAddress);
        const endingUserAssetBalance = await asset.balanceOf(userAddress);

        expect(endingUserFeiBalance).to.be.equal(startingUserFeiBalance.sub(pointOneFei));
        expect(endingUserAssetBalance).to.be.equal(startingUserAssetBalance.add(actualAssetAmount));
        expect(await fei.balanceOf(psm.address)).to.be.equal(0);
        expect(await psm.buffer()).to.be.equal(bufferCap);
      });

      it('redeem succeeds when user has enough funds and DAI is $1.019 with .01 FEI', async function () {
        const pointOneFei = ethers.constants.WeiPerEther.div(100);
        await oracle.setExchangeRateScaledBase(ethers.constants.WeiPerEther.mul(1019).div(1000));
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, pointOneFei);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, pointOneFei);

        const startingUserFeiBalance = await fei.balanceOf(userAddress);
        const startingUserAssetBalance = await asset.balanceOf(userAddress);

        const expectedAssetAmount = pointOneFei
          .mul(bpGranularity - redeemFeeBasisPoints)
          .div(bpGranularity)
          .mul(ethers.constants.WeiPerEther)
          .div(ethers.constants.WeiPerEther.mul(1019).div(1000));
        const actualAssetAmount = await psm.getRedeemAmountOut(pointOneFei);

        expect(expectedAssetAmount).to.be.equal(actualAssetAmount);

        await psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, pointOneFei, expectedAssetAmount);

        const endingUserFeiBalance = await fei.balanceOf(userAddress);
        const endingUserAssetBalance = await asset.balanceOf(userAddress);

        expect(endingUserFeiBalance).to.be.equal(startingUserFeiBalance.sub(pointOneFei));
        expect(endingUserAssetBalance).to.be.equal(startingUserAssetBalance.add(actualAssetAmount));
        expect(await fei.balanceOf(psm.address)).to.be.equal(0);
        expect(await psm.buffer()).to.be.equal(bufferCap);
      });

      it('redeem succeeds when user has enough funds and DAI is $0.9801', async function () {
        await oracle.setExchangeRateScaledBase(ethers.constants.WeiPerEther.mul(9801).div(10000));
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, mintAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmount);

        const startingUserFeiBalance = await fei.balanceOf(userAddress);
        const startingUserAssetBalance = await asset.balanceOf(userAddress);

        const expectedAssetAmount = mintAmount
          .mul(bpGranularity - redeemFeeBasisPoints)
          .div(bpGranularity)
          .mul(ethers.constants.WeiPerEther)
          .div(ethers.constants.WeiPerEther.mul(9801).div(10000));

        const actualAssetAmount = await psm.getRedeemAmountOut(mintAmount);

        expect(expectedAssetAmount).to.be.equal(actualAssetAmount);
        await asset.connect(impersonatedSigners[minterAddress]).mint(psm.address, expectedAssetAmount);

        await psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, expectedAssetAmount);

        const endingUserFeiBalance = await fei.balanceOf(userAddress);
        const endingUserAssetBalance = await asset.balanceOf(userAddress);

        expect(endingUserFeiBalance).to.be.equal(startingUserFeiBalance.sub(mintAmount));
        expect(endingUserAssetBalance).to.be.equal(startingUserAssetBalance.add(actualAssetAmount));
        expect(await fei.balanceOf(psm.address)).to.be.equal(0);
        expect(await psm.buffer()).to.be.equal(bufferCap);
      });

      it('redeem succeeds when user has enough funds, DAI is $0.9801 and mint fee has been changed to 100 bips', async function () {
        await psm.connect(impersonatedSigners[governorAddress]).setMintFee(100);
        await oracle.setExchangeRateScaledBase(ethers.constants.WeiPerEther.mul(9801).div(10000));
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, mintAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmount);

        const startingUserFeiBalance = await fei.balanceOf(userAddress);
        const startingUserAssetBalance = await asset.balanceOf(userAddress);

        const expectedAssetAmount = mintAmount
          .mul(bpGranularity - 100)
          .div(bpGranularity)
          .mul(ethers.constants.WeiPerEther)
          .div(ethers.constants.WeiPerEther.mul(9801).div(10000));

        const actualAssetAmount = await psm.getRedeemAmountOut(mintAmount);

        expect(expectedAssetAmount).to.be.equal(actualAssetAmount);
        await asset.connect(impersonatedSigners[minterAddress]).mint(psm.address, expectedAssetAmount);

        await psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, expectedAssetAmount);

        const endingUserFeiBalance = await fei.balanceOf(userAddress);
        const endingUserAssetBalance = await asset.balanceOf(userAddress);

        expect(endingUserFeiBalance).to.be.equal(startingUserFeiBalance.sub(mintAmount));
        expect(endingUserAssetBalance).to.be.equal(startingUserAssetBalance.add(actualAssetAmount));
        expect(await fei.balanceOf(psm.address)).to.be.equal(0);
        expect(await psm.buffer()).to.be.equal(bufferCap);
      });

      it('redeem succeeds when user has enough funds, DAI is $0.5 and mint fee has been changed to 100 bips', async function () {
        await psm.connect(impersonatedSigners[governorAddress]).setOracleFloor(4_900);
        await oracle.setExchangeRateScaledBase(ethers.constants.WeiPerEther.div(2));

        await psm.connect(impersonatedSigners[governorAddress]).setMintFee(100);
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, mintAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmount);

        const startingUserFeiBalance = await fei.balanceOf(userAddress);
        const startingUserAssetBalance = await asset.balanceOf(userAddress);

        const expectedAssetAmount = mintAmount
          .mul(bpGranularity - 100)
          .div(bpGranularity)
          .mul(ethers.constants.WeiPerEther)
          .div(ethers.constants.WeiPerEther.div(2));

        const actualAssetAmount = await psm.getRedeemAmountOut(mintAmount);

        expect(expectedAssetAmount).to.be.equal(actualAssetAmount);
        await asset.connect(impersonatedSigners[minterAddress]).mint(psm.address, expectedAssetAmount);

        await psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, expectedAssetAmount);

        const endingUserFeiBalance = await fei.balanceOf(userAddress);
        const endingUserAssetBalance = await asset.balanceOf(userAddress);

        expect(endingUserFeiBalance).to.be.equal(startingUserFeiBalance.sub(mintAmount));
        expect(endingUserAssetBalance).to.be.equal(startingUserAssetBalance.add(actualAssetAmount));
        expect(await fei.balanceOf(psm.address)).to.be.equal(0);
        expect(await psm.buffer()).to.be.equal(bufferCap);
      });

      it('redeem succeeds when user has enough funds, DAI is $0.5 and mint fee has been changed to 500 bips', async function () {
        await psm.connect(impersonatedSigners[governorAddress]).setOracleFloor(4_900);
        await oracle.setExchangeRateScaledBase(ethers.constants.WeiPerEther.div(2));

        await psm.connect(impersonatedSigners[governorAddress]).setMintFee(500);
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, mintAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmount);

        const startingUserFeiBalance = await fei.balanceOf(userAddress);
        const startingUserAssetBalance = await asset.balanceOf(userAddress);

        const expectedAssetAmount = mintAmount
          .mul(bpGranularity - 500)
          .div(bpGranularity)
          .mul(ethers.constants.WeiPerEther)
          .div(ethers.constants.WeiPerEther.div(2));

        const actualAssetAmount = await psm.getRedeemAmountOut(mintAmount);

        expect(expectedAssetAmount).to.be.equal(actualAssetAmount);
        await asset.connect(impersonatedSigners[minterAddress]).mint(psm.address, expectedAssetAmount);

        await psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, expectedAssetAmount);

        const endingUserFeiBalance = await fei.balanceOf(userAddress);
        const endingUserAssetBalance = await asset.balanceOf(userAddress);

        expect(endingUserFeiBalance).to.be.equal(startingUserFeiBalance.sub(mintAmount));
        expect(endingUserAssetBalance).to.be.equal(startingUserAssetBalance.add(actualAssetAmount));
        expect(await fei.balanceOf(psm.address)).to.be.equal(0);
        expect(await psm.buffer()).to.be.equal(bufferCap);
      });

      it('redeem fails when oracle price is $2', async function () {
        await oracle.setExchangeRate(2);
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, mintAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(psm.address, mintAmount);
        await expectRevert(
          psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, 0),
          'PegStabilityModule: price out of bounds'
        );
      });

      it('redeem fails when expected amount out is greater than amout actual amount out', async function () {
        await expectRevert(
          psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, mintAmount),
          'PegStabilityModule: Redeem not enough out'
        );
      });

      it('fails when token is not approved to be spent by the PSM', async function () {
        await expectRevert(
          psm.connect(impersonatedSigners[userAddress]).redeem(userAddress, mintAmount, 0),
          'ERC20: transfer amount exceeds balance'
        );
      });
    });
  });

  describe('ACL', function () {
    describe('setMintFee', function () {
      it('fails when caller is not governor or admin', async function () {
        await expectRevert(psm.setMintFee(bpGranularity), 'CoreRef: Caller is not a governor or contract admin');
      });

      it('fails when mint fee is above max fee', async function () {
        const invalidNewMintFee = 501;
        await expectRevert(
          psm.connect(impersonatedSigners[governorAddress]).setMintFee(invalidNewMintFee),
          'PegStabilityModule: Mint fee exceeds max fee'
        );
      });

      it('succeeds when caller is governor', async function () {
        const newMintFee = 100;
        await psm.connect(impersonatedSigners[governorAddress]).setMintFee(newMintFee);
        expect(await psm.mintFeeBasisPoints()).to.be.equal(newMintFee);
      });
    });

    describe('setRedeemFee', function () {
      it('fails when caller is not governor or admin', async function () {
        await expectRevert(psm.setRedeemFee(bpGranularity), 'CoreRef: Caller is not a governor or contract admin');
      });

      it('fails when redeem fee is above max fee', async function () {
        const invalidNewRedeemFee = 501;
        await expectRevert(
          psm.connect(impersonatedSigners[governorAddress]).setRedeemFee(invalidNewRedeemFee),
          'PegStabilityModule: Redeem fee exceeds max fee'
        );
      });

      it('succeeds when caller is governor', async function () {
        const newRedeemFee = 100;
        await psm.connect(impersonatedSigners[governorAddress]).setRedeemFee(newRedeemFee);
        expect(await psm.redeemFeeBasisPoints()).to.be.equal(newRedeemFee);
      });
    });

    describe('setReservesThreshold', function () {
      it('fails when caller is not governor or admin', async function () {
        await expectRevert(
          psm.setReservesThreshold(reservesThreshold.mul(1000)),
          'CoreRef: Caller is not a governor or contract admin'
        );
      });

      it('succeeds when caller is governor', async function () {
        const newReserves = reservesThreshold.mul(100);
        await psm.connect(impersonatedSigners[governorAddress]).setReservesThreshold(newReserves);
        expect(await psm.reservesThreshold()).to.be.equal(newReserves);
      });
    });

    describe('setOracleFloor', function () {
      it('fails when caller is not governor or admin', async function () {
        await expectRevert(
          psm.setOracleFloor(reservesThreshold.mul(1000)),
          'CoreRef: Caller is not a governor or contract admin'
        );
      });

      it('fails when floor is 0', async function () {
        await expectRevert(
          psm.connect(impersonatedSigners[governorAddress]).setOracleFloor(0),
          'PegStabilityModule: invalid floor'
        );
      });

      it('fails when floor is greater than ceiling', async function () {
        await expectRevert(
          psm.connect(impersonatedSigners[governorAddress]).setOracleFloor(10_300),
          'PegStabilityModule: floor must be less than ceiling'
        );
      });

      it('succeeds when caller is governor', async function () {
        const newOracleFloor = 9_900;
        await psm.connect(impersonatedSigners[governorAddress]).setOracleFloor(newOracleFloor);
        const expectedNewFloor = ethers.constants.WeiPerEther.mul(99).div(100);
        expect(await psm.floor()).to.be.equal(expectedNewFloor);
      });
    });

    describe('setOracleCeiling', function () {
      it('fails when caller is not governor or admin', async function () {
        await expectRevert(
          psm.setOracleCeiling(reservesThreshold.mul(1000)),
          'CoreRef: Caller is not a governor or contract admin'
        );
      });

      it('fails when ceiling is less than floor', async function () {
        await expectRevert(
          psm.connect(impersonatedSigners[governorAddress]).setOracleCeiling(9_000),
          'PegStabilityModule: ceiling must be greater than floor'
        );
      });

      it('fails when ceiling is zero', async function () {
        await expectRevert(
          psm.connect(impersonatedSigners[governorAddress]).setOracleCeiling(0),
          'PegStabilityModule: invalid ceiling'
        );
      });

      it('succeeds when caller is governor', async function () {
        const newOraclePriceCeiling = 10_100;
        await psm.connect(impersonatedSigners[governorAddress]).setOracleCeiling(newOraclePriceCeiling);
        const expectedNewCeiling = ethers.constants.WeiPerEther.mul(101).div(100);
        expect(await psm.ceiling()).to.be.equal(expectedNewCeiling);
      });
    });

    describe('withdraw', function () {
      it('fails when caller is not PCVController', async function () {
        await expectRevert(
          psm.withdrawERC20(asset.address, userAddress, 100),
          'CoreRef: Caller is not a PCV controller'
        );
      });

      it('succeeds when caller is PCVController', async function () {
        const amount = 10_000_000;
        await asset.mint(psm.address, amount);
        await psm
          .connect(impersonatedSigners[pcvControllerAddress])
          .withdrawERC20(asset.address, userAddress, await psm.balance());

        const endingBalance = await psm.balance();
        expect(endingBalance).to.be.equal(0);
        expect(await asset.balanceOf(userAddress)).to.be.equal(amount);
      });
    });
  });

  describe('allocateSurplus', function () {
    it('sends surplus to PCVDeposit target when called', async function () {
      const startingSurplusBalance = await asset.balanceOf(pcvDeposit.address);
      await asset.mint(psm.address, reservesThreshold.mul(2));

      expect(await psm.hasSurplus()).to.be.true;
      await psm.allocateSurplus();
      expect(await psm.hasSurplus()).to.be.false;

      const endingSurplusBalance = await asset.balanceOf(pcvDeposit.address);
      const endingPSMBalance = await asset.balanceOf(psm.address);

      expect(endingSurplusBalance.sub(startingSurplusBalance)).to.be.equal(reservesThreshold);
      expect(endingPSMBalance).to.be.equal(reservesThreshold);
    });
  });

  describe('deposit', function () {
    it('sends surplus to PCVDeposit target when called', async function () {
      const startingSurplusBalance = await asset.balanceOf(pcvDeposit.address);
      await asset.mint(psm.address, reservesThreshold.mul(2));

      expect(await psm.hasSurplus()).to.be.true;
      await psm.deposit();
      expect(await psm.hasSurplus()).to.be.false;

      const endingSurplusBalance = await asset.balanceOf(pcvDeposit.address);
      const endingPSMBalance = await asset.balanceOf(psm.address);

      expect(endingSurplusBalance.sub(startingSurplusBalance)).to.be.equal(reservesThreshold);
      expect(endingPSMBalance).to.be.equal(reservesThreshold);
    });

    it('succeeds when called', async function () {
      const tx = await (await psm.deposit()).wait();
      expect(tx.logs.length).to.be.equal(0);
    });
  });
});
