import { assertDefined } from "$lib/utils/assertions";
import { log } from "$lib/utils/logger";
import { type Transaction } from "mssql";
import type * as sql from "mssql";

/**
 * Wraps an external transaction. It uses it for commit and rollback etc.
 * If none passed in => Create own transaction.
 * "begin", "commit" and "rollback" ONLY if we created our own transaction.
 */
export class TransWrapper {
  private _trans: Transaction;
  private _externalTrans = false;

  constructor(trans: Transaction | null, pool: sql.ConnectionPool | null) {
    if (!trans) {
      assertDefined(pool, "pool must be defined if transaction is null.");
      this._trans = pool.transaction();
    } else {
      this._trans = trans;
      this._externalTrans = true;
    }
  }

  public get trans() {
    return this._trans;
  }

  public request(): sql.Request {
    return this.trans.request();
  }

  /**
   * Begin only if we do not have an external transaction.
   */
  public async begin() {
    if (!this._externalTrans) {
      log.debug(`No external transaction => begin own one.`);
      await this.trans.begin();
    }
  }

  /**
   * Commit only if we do not have an external transaction.
   */
  public async commit() {
    if (!this._externalTrans) {
      log.debug(`No external transaction => commit own one.`);
      await this.trans.commit();
    }
  }

  /**
   * Rollback only if we do not have an external transaction.
   */
  public async rollback() {
    if (!this._externalTrans) {
      log.debug(`No external transaction => rollback own one.`);
      await this.trans.rollback();
    }
  }
}
