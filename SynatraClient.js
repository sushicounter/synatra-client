import * as anchor from "@coral-xyz/anchor";
import {
  getMint,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import idl from "./synatra-idl.json" assert { type: "json" };

const { Program, web3, setProvider, AnchorProvider, BN } = anchor;
const { ComputeBudgetProgram, SystemProgram, PublicKey, Connection } = web3;
const SOLANA_TOKEN_ADDRESS = "So11111111111111111111111111111111111111111";
const SYNATRA_PROGRAM_ADDRESS = "synatfE5AvWtbDT9sSvDsF9gmeqR9qeq3FA84bhxWur";

/**
 * @typedef {Object} Pool
 * @property {number} id
 * @property {import('@solana/web3.js').PublicKey} manager
 * @property {import('@solana/web3.js').PublicKey} oracle
 * @property {import('@solana/web3.js').PublicKey} stakeToken
 * @property {import('@solana/web3.js').PublicKey} receiptToken
 * @property {number} stakeRate
 * @property {number} unstakeRate
 * @property {number} receiptMaxSupply
 * @property {number} nonce
 */

export class SynatraClient {
  /**
   * @param {string} rpcUrl
   * @param {number} [priorityFeeMicroLamports=0]
   */
  constructor(rpcUrl, priorityFeeMicroLamports = 0) {
    /** @type {import('@solana/web3.js').PublicKey} */
    this.programPublicKey = new PublicKey(SYNATRA_PROGRAM_ADDRESS);
    /** @type {import('@solana/web3.js').Connection} */
    this.connection = new Connection(rpcUrl);
    /** @type {import('@coral-xyz/anchor').AnchorProvider} */
    this.provider = new AnchorProvider(
      this.connection,
      {},
      { commitment: "confirmed" }
    );
    /** @type {import('@coral-xyz/anchor').Program} */
    this.program = new Program(idl, this.programPublicKey, this.provider);
    /** @type {number} */
    this.priorityFeeMicroLamports = priorityFeeMicroLamports;
    /** @type {import('@solana/web3.js').PublicKey} */
    this.globalPublicKey = this._getPda("global");
    /** @type {import('@solana/web3.js').PublicKey|undefined} */
    this.userPublicKey = undefined;
    setProvider(this.provider);
  }

  /**
   * @param {import('@coral-xyz/anchor').Wallet} wallet
   * @returns {void}
   */
  setWallet(wallet) {
    this.provider.wallet = wallet;
    this.userPublicKey = wallet.publicKey;
  }

  /**
   * @returns {void}
   */
  removeWallet() {
    this.provider.wallet = {};
    this.userPublicKey = undefined;
  }

  /**
   * @param {number} priorityFeeMicroLamports
   * @returns {void}
   */
  setPriorityFee(priorityFeeMicroLamports) {
    this.priorityFeeMicroLamports = priorityFeeMicroLamports;
  }

  /**
   * @returns {import('@solana/web3.js').TransactionInstruction}
   * @private
   */
  _addPriorityFee() {
    return ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: this.priorityFeeMicroLamports,
    });
  }

  /**
   * @param {string} seed
   * @returns {import('@solana/web3.js').PublicKey}
   * @private
   */
  _getPda(seed) {
    const encoder = new TextEncoder();
    const [pdaPublicKey] = PublicKey.findProgramAddressSync(
      [encoder.encode(seed)],
      this.programPublicKey
    );
    return pdaPublicKey;
  }

  /**
   * @param {import('@solana/web3.js').PublicKey} userPublicKey
   * @param {import('@solana/web3.js').PublicKey} tokenPublicKey
   * @returns {import('@solana/web3.js').PublicKey}
   * @private
   */
  _getAta(userPublicKey, tokenPublicKey) {
    const [ataPublicKey] = PublicKey.findProgramAddressSync(
      [
        userPublicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        tokenPublicKey.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ataPublicKey;
  }

  /**
   * @param {number} poolId
   * @returns {import('@solana/web3.js').PublicKey}
   * @private
   */
  _getPoolPublicKey(poolId) {
    return this._getPda(`pool-${poolId}`);
  }

  /**
   * @param {number} poolId
   * @returns {Promise<Pool|null>}
   */
  async getPool(poolId) {
    const poolPublicKey = this._getPoolPublicKey(poolId);
    let pool = null;
    try {
      pool = await this.program.account.pool.fetch(poolPublicKey);
      pool.id = Number(pool.id);
      pool.stakeRate = Number(pool.stakeRate);
      pool.unstakeRate = Number(pool.unstakeRate);
      pool.nonce = Number(pool.nonce);
    } catch (err) {
      console.error(`pool not found:`, err);
    }
    return pool;
  }

  /**
   * @param {import('@solana/web3.js').PublicKey} tokenPublicKey
   * @returns {Promise<number>}
   */
  async getCurrentSupply(tokenPublicKey) {
    const tokenMint = await getMint(this.connection, tokenPublicKey);
    return parseInt(tokenMint.supply.toString());
  }

  /**
   * @param {number} poolId
   * @param {number} amount
   * @returns {Promise<string>} Transaction signature
   */
  async stake(poolId, amount) {
    if (!this.userPublicKey) throw new Error("No wallet set");

    const poolPublicKey = this._getPoolPublicKey(poolId);
    const pool = await this.getPool(poolId);
    if (!pool) throw new Error("Pool not found");

    const { stakeToken, receiptToken } = pool;
    const userReceiptAta = this._getAta(this.userPublicKey, receiptToken);

    if (stakeToken.toString() === SOLANA_TOKEN_ADDRESS) {
      return this.program.methods
        .stakeSol(new BN(amount))
        .accounts({
          signer: this.userPublicKey,
          pool: poolPublicKey,
          receiptToken,
          userReceiptAta,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions(this._addPriorityFee())
        .rpc();
    }

    const userStakeAta = this._getAta(this.userPublicKey, stakeToken);
    const poolStakeAta = this._getAta(poolPublicKey, stakeToken);

    return this.program.methods
      .stakeToken(new BN(amount))
      .accounts({
        signer: this.userPublicKey,
        pool: poolPublicKey,
        stakeToken,
        receiptToken,
        userStakeAta,
        userReceiptAta,
        poolStakeAta,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(this._addPriorityFee())
      .rpc();
  }

  /**
   * @param {number} poolId
   * @param {number} receiptAmount
   * @returns {Promise<string>} Transaction signature
   */
  async unstake(poolId, receiptAmount) {
    if (!this.userPublicKey) throw new Error("No wallet set");

    const poolPublicKey = this._getPoolPublicKey(poolId);
    const pool = await this.getPool(poolId);
    if (!pool) throw new Error("Pool not found");

    const { receiptToken, nonce } = pool;
    const claimRecordPublicKey = this._getPda(`claim-${poolId}-${nonce}`);
    const userReceiptAta = this._getAta(this.userPublicKey, receiptToken);

    return this.program.methods
      .unstake(new BN(receiptAmount))
      .accounts({
        signer: this.userPublicKey,
        pool: poolPublicKey,
        receiptToken,
        userReceiptAta,
        claimRecord: claimRecordPublicKey,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(this._addPriorityFee())
      .rpc();
  }
}
