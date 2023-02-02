import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import helpers from "@nomicfoundation/hardhat-network-helpers";
import { sqrt } from "../helpers/helpers";

describe("Uniswap", function () {
  async function deploy() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();
    
    const routerAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    const router = await ethers.getContractAt("IUniswapV2Router02", routerAddress);

    const ST1 = await ethers.getContractFactory("ShitToken1");
    const st1 = await ST1.deploy();
    const ST2 = await ethers.getContractFactory("ShitToken2");
    const st2 = await ST2.deploy();

    return { router, st1, st2, owner, otherAccount };
  }

  describe("Create Liquidity Pool", function () {
    it("Run tests", async function () {
      const { router, st1, st2, owner, otherAccount } = await loadFixture(deploy);

      // Price of Token A (pA) = Reserves of Token A (rA) / Reserves of Token B (rB)
      // Initially we want to set the price of Token A to be worth 152 Token B
      
      // Reserves of Token B = 100
      const rB = ethers.utils.parseEther("100");
      // Reserves of Token A = 100 * 152
      const rA = ethers.utils.parseEther("100").mul(152);

      // Approve the router to spend the tokens
      await st1.approve(router.address, ethers.constants.MaxUint256);
      await st2.approve(router.address, ethers.constants.MaxUint256);

      // Get the current block number
      const blockNum = await ethers.provider.getBlockNumber();
      const block = await ethers.provider.getBlock(blockNum);
      const timestamp = block.timestamp;
      
      // Add liquidity
      await router.addLiquidity(
        st1.address,
        st2.address,
        rA,
        rB,
        rA,
        rB,
        owner.address,
        timestamp + 1000
      );
      
      // Quote the price of 1 Token B in Token A
      const quote = await router.quote(ethers.utils.parseEther("1"), rB, rA);
      
      // pA = rA / rB = 15200 / 100 = 152 (Token A per Token B)
      // Expect 1 Token B to be worth 152 Token A
      expect(quote).to.equal(ethers.utils.parseEther("152"));
      
      // LP Tokens should equal Math.sqrt(amount0.mul(amount1)).sub(MINIMUM_LIQUIDITY)
      // sqrt( rA * rB ) - MINIMUM_LIQUIDITY
      const MINIMUM_LIQUIDITY = 1000
      const lpTokensGuess = sqrt(rA.mul(rB)).sub(MINIMUM_LIQUIDITY);
      
      // Get the LP Token balance of the owner
      const factoryAddress = await router.factory();
      const factory = await ethers.getContractAt("IUniswapV2Factory", factoryAddress);
      const pair = await factory.getPair(st1.address, st2.address);
      const lpToken = await ethers.getContractAt("IUniswapV2Pair", pair);
      const lpTokenBalance = await lpToken.balanceOf(owner.address);
      
      // Expect the LP Token balance to equal the guess
      expect(lpTokenBalance).to.equal(lpTokensGuess);
      
      // Execute a swap of 1 Token B for Token A
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("1"),
        0,
        [st2.address, st1.address],
        otherAccount.address,
        timestamp + 1000,
      )

      // Use the constant product formula to calculate the amount of Token A that should be received
      let out = await router.getAmountOut(ethers.utils.parseEther("1"), rB, rA);
      const swapOutAmount = ethers.utils.formatEther(await st1.balanceOf(otherAccount.address))
      console.log("Amount Out: ",swapOutAmount)
      expect(swapOutAmount).to.equal(ethers.utils.formatEther(out));

      // Before Sync and Skim reserves == balance
      let reserves = await lpToken.getReserves();
      expect(reserves.reserve0).to.equal(await st1.balanceOf(pair));
      expect(reserves.reserve1).to.equal(await st2.balanceOf(pair));

      // Throw reserves off balance
      reserves = await lpToken.getReserves();
      await st1.transfer(pair, ethers.utils.parseEther("100"));
      await st2.transfer(pair, ethers.utils.parseEther("100"));
      expect(reserves.reserve0).to.not.equal(await st1.balanceOf(pair));
      expect(reserves.reserve1).to.not.equal(await st2.balanceOf(pair));

      // Sync the reserves
      await lpToken.sync();
      reserves = await lpToken.getReserves();
      expect(reserves.reserve0).to.equal(await st1.balanceOf(pair));
      expect(reserves.reserve1).to.equal(await st2.balanceOf(pair));

      // Throw reserves off balance
      reserves = await lpToken.getReserves();
      await st1.transfer(pair, ethers.utils.parseEther("100"));
      await st2.transfer(pair, ethers.utils.parseEther("100"));

      // Skim the reserves
      await lpToken.skim(otherAccount.address);
      reserves = await lpToken.getReserves();
      expect(reserves.reserve0).to.equal(await st1.balanceOf(pair));
      expect(reserves.reserve1).to.equal(await st2.balanceOf(pair));

      });
    });
    
  });
