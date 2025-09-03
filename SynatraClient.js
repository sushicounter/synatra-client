import {
  getMint,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
const { Program, web3, setProvider, AnchorProvider, Wallet } = anchor
const { BN } = anchor.default
const { Connection, PublicKey, SystemProgram, ComputeBudgetProgram } = web3;
import idl from "./synatra-idl.json" with { type: "json" };

const SOLANA_TOKEN_ADDRESS = "So11111111111111111111111111111111111111111";
const SYNATRA_API_URL = "https://api.synatra.xyz";
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

/**
 * @typedef {Object} Claim
 * @property {string} address
 * @property {string} user
 * @property {string} poolId
 * @property {string} poolAddress
 * @property {number} receiptAmount
 * @property {number} nonce
 * @property {number} unstakeRate
 * @property {string} unstakeTransaction
 * @property {string} unstakeDate
 * @property {number} claimAmount
 * @property {boolean} fulfilled
 * @property {string} fulfilledTransaction
 * @property {string} fulfilledDate
 * @property {boolean} claimed
 * @property {string} claimedTransaction
 * @property {string} claimedDate
 */

export class SynatraClient {
  /**
   * @param {string} rpcUrl
   * @param {import('@solana/web3.js').Keypair} [userKeypair]
   * @param {string} [synatraApiUrl=SYNATRA_API_URL]
   * @param {number} [priorityFeeMicroLamports=0]
   * @param {boolean} [enableLogging=false]
   */
  constructor(
    rpcUrl,
    userKeypair = null,
    synatraApiUrl = SYNATRA_API_URL,
    priorityFeeMicroLamports = 0,
    enableLogging = false
  ) {
    /** @type {import('@solana/web3.js').PublicKey} */
    this.programPublicKey = new PublicKey(SYNATRA_PROGRAM_ADDRESS);
    /** @type {import('@solana/web3.js').Connection} */
    this.connection = new Connection(rpcUrl);
    /** @type {import('@coral-xyz/anchor').AnchorProvider} */
    this.provider = new AnchorProvider(
      this.connection,
      userKeypair ? new Wallet(userKeypair) : {},
      {
        commitment: 'confirmed',
      }
    )
    /** @type {import('@coral-xyz/anchor').Program} */
    this.program = new Program(idl, this.programPublicKey, this.provider)
    /** @type {number} */
    this.priorityFeeMicroLamports = priorityFeeMicroLamports;
    /** @type {import('@solana/web3.js').PublicKey} */
    this.globalPublicKey = this._getPda("global");
    /** @type {import('@solana/web3.js').PublicKey|undefined} */
    this.userPublicKey = userKeypair ? userKeypair.publicKey : undefined;
    /** @type {string} */
    this.synatraApiUrl = synatraApiUrl;
    /** @type {boolean} */
    this.enableLogging = enableLogging;
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
   * @returns {void}
   * @private
   */
  _validateWallet() {
    if (!this.userPublicKey) throw new Error("No wallet set");
  }

  /**
   * @param {number} poolId
   * @returns {void}
   * @private
   */
  _validatePoolId(poolId) {
    if (typeof poolId !== "number" || poolId < 0) throw new Error("Invalid pool ID");
  }

  /**
   * @param {number} amount
   * @returns {void}
   * @private
   */
  _validateAmount(amount) {
    if (typeof amount !== "number" || amount <= 0) throw new Error("Amount must be positive");
  }


  /**
   * @param {import('@solana/web3.js').PublicKey} tokenMint
   * @param {number} requiredAmount
   * @returns {Promise<void>}
   * @private
   */
  async _validateTokenBalance(tokenMint, requiredAmount) {
    if (tokenMint.toString() === SOLANA_TOKEN_ADDRESS) {
      const balance = await this.connection.getBalance(this.userPublicKey);
      if (balance < requiredAmount) throw new Error("Insufficient SOL balance");
    } else {
      const userTokenAta = this._getAta(this.userPublicKey, tokenMint);
      try {
        const balance = await this.connection.getTokenAccountBalance(userTokenAta);
        if (Number(balance.value.amount) < requiredAmount) {
          throw new Error("Insufficient token balance");
        }
      } catch (err) {
        throw new Error("Token account not found or insufficient balance");
      }
    }
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
    this._validatePoolId(poolId);
    const poolPublicKey = this._getPoolPublicKey(poolId);
    let pool = null;
    try {
      pool = await this.program.account.pool.fetch(poolPublicKey);
      pool.id = Number(pool.id);
      pool.stakeRate = Number(pool.stakeRate);
      pool.unstakeRate = Number(pool.unstakeRate);
      pool.nonce = Number(pool.nonce);
    } catch (err) {
      if (this.enableLogging) {
        console.error(`pool not found:`, err);
      }
    }
    return pool;
  }

  /**
   * @param {number} poolId
   * @returns {Promise<number>}
   */
  async getCurrentSupply(poolId) {
    const pool = await this.getPool(poolId);
    if (!pool) throw new Error("Pool not found");
    const tokenMint = await getMint(this.connection, pool.receiptToken);
    return parseInt(tokenMint.supply.toString());
  }

  /**
   * @param {number} poolId
   * @param {number} amount
   * @returns {Promise<string>} Transaction signature
   */
  async stake(poolId, amount) {
    this._validateWallet();
    this._validateAmount(amount);
    
    const pool = await this.getPool(poolId);
    if (!pool) throw new Error("Pool not found");
    const poolPublicKey = this._getPoolPublicKey(poolId);
    
    // Validate user has enough balance
    const { stakeToken, receiptToken } = pool;
    await this._validateTokenBalance(stakeToken, amount);

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
    this._validateWallet();
    this._validateAmount(receiptAmount);
    
    const pool = await this.getPool(poolId);
    if (!pool) throw new Error("Pool not found");
    const poolPublicKey = this._getPoolPublicKey(poolId);
    
    // Validate user has enough receipt tokens
    const { receiptToken, nonce } = pool;
    await this._validateTokenBalance(receiptToken, receiptAmount);
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

  /**
   * @returns {Promise<Claim[]>}
   */
  async getClaims() {
    this._validateWallet();
    try {
      const response = await fetch(
        `${this.synatraApiUrl}/claims/users/${this.userPublicKey.toString()}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error("Network error: Unable to fetch claims");
      }
      throw err;
    }
  }
}
