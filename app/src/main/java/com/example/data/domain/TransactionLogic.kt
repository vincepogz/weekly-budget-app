package com.example.data.domain

import com.example.data.model.AccountEntity
import com.example.data.model.TransactionEntity
import com.example.data.model.TransactionType
import java.text.SimpleDateFormat
import java.util.Locale

/*
 * Transaction-type rules in one place, with no Android dependencies, so the Dashboard,
 * Accounts, Budget and Ledger screens all use the same math and it can be unit tested.
 */

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Account References
// ---------------------------------------------------------------------------

data class AccountReferenceCounts(
    val transactions: Int,
    val allocations: Int,
    val items: Int
)

data class AccountBalance(
    /** Starting balance + every transaction. */
    val balance: Double,
    /** Starting balance + only transactions marked Cleared. */
    val clearedBalance: Double
)

object BalanceCalculator {

    /**
     * Balance = starting balance + Deposits - Withdrawals, and for a Transfer the source account
     * loses the amount while the destination gains it.
     *
     * Pass ALL transactions (every budget period), not just the current period's.
     *
     * A transfer is only applied when both sides are valid (see [isValidTransfer]). Applying one
     * side only would silently create or destroy money in the combined balance, so a malformed
     * transfer is skipped entirely instead.
     *
     * A transfer is a single record with a single Cleared flag, and that flag applies to both
     * the source and destination side.
     */
    fun calculate(
        accounts: List<AccountEntity>,
        transactions: List<TransactionEntity>
    ): Map<String, AccountBalance> {
        val balance = accounts.associate { it.id to it.startingBalance }.toMutableMap()
        val cleared = accounts.associate { it.id to it.startingBalance }.toMutableMap()

        fun apply(accountId: String, delta: Double, isCleared: Boolean) {
            val current = balance[accountId] ?: return
            balance[accountId] = current + delta
            if (isCleared) cleared[accountId] = (cleared[accountId] ?: 0.0) + delta
        }

        for (t in transactions) {
            when (t.transactionType) {
                TransactionType.DEPOSIT -> apply(t.accountId, t.amount, t.cleared)
                TransactionType.WITHDRAWAL -> apply(t.accountId, -t.amount, t.cleared)
                TransactionType.TRANSFER -> {
                    if (isValidTransfer(t, balance.keys)) {
                        apply(t.accountId, -t.amount, t.cleared)
                        apply(t.toAccountId!!, t.amount, t.cleared)
                    }
                }
            }
        }

        return accounts.associate { acc ->
            acc.id to AccountBalance(
                balance = balance.getValue(acc.id),
                clearedBalance = cleared.getValue(acc.id)
            )
        }
    }

    /** A transfer needs a destination that is a known account and differs from the source. */
    fun isValidTransfer(t: TransactionEntity, knownAccountIds: Set<String>): Boolean {
        val to = t.toAccountId
        return !to.isNullOrBlank() &&
            to != t.accountId &&
            t.accountId in knownAccountIds &&
            to in knownAccountIds
    }
}

// ---------------------------------------------------------------------------
// Budget calculations
// ---------------------------------------------------------------------------

/**
 * @param includeDeposits  Deposits count toward the budget only when this is ON.
 * @param includeTransfers Transfers count toward the budget only when this is ON; otherwise
 *                         they are excluded entirely.
 * @param accountIds       Optional account scope; null means all accounts.
 * @param categories       Optional category scope for withdrawals; null means all categories.
 */
data class BudgetOptions(
    val includeDeposits: Boolean = true,
    val includeTransfers: Boolean = false,
    val accountIds: Set<String>? = null,
    val categories: Set<String>? = null
)

data class BudgetTotals(
    val withdrawals: Double = 0.0,
    val deposits: Double = 0.0,
    val transfersOut: Double = 0.0,
    val transfersIn: Double = 0.0
) {
    val netFlow: Double get() = deposits + transfersIn - withdrawals - transfersOut
}

object BudgetCalculator {

    /**
     * - Withdrawal: always a budget expense when it matches the account/category scope.
     * - Deposit: counted only when Include Deposits is ON.
     * - Transfer: counted only when Include Transfers is ON. It is never income or expense: the
     *   source side is reported as transfersOut and the destination side as transfersIn, each
     *   only if that account is in scope. With all accounts in scope the two sides cancel in
     *   [BudgetTotals.netFlow], so a transfer between your own accounts cannot change your total.
     */
    fun totals(transactions: List<TransactionEntity>, options: BudgetOptions): BudgetTotals {
        var withdrawals = 0.0
        var deposits = 0.0
        var transfersOut = 0.0
        var transfersIn = 0.0

        fun inAccountScope(id: String) = options.accountIds?.contains(id) ?: true
        val categoryScope = options.categories?.map { it.trim().uppercase() }?.toSet()

        for (t in transactions) {
            when (t.transactionType) {
                TransactionType.WITHDRAWAL -> {
                    val categoryOk = categoryScope?.contains(t.category.trim().uppercase()) ?: true
                    if (inAccountScope(t.accountId) && categoryOk) withdrawals += t.amount
                }
                TransactionType.DEPOSIT -> {
                    if (options.includeDeposits && inAccountScope(t.accountId)) deposits += t.amount
                }
                TransactionType.TRANSFER -> {
                    val to = t.toAccountId
                    if (options.includeTransfers && !to.isNullOrBlank() && to != t.accountId) {
                        if (inAccountScope(t.accountId)) transfersOut += t.amount
                        if (inAccountScope(to)) transfersIn += t.amount
                    }
                }
            }
        }
        return BudgetTotals(withdrawals, deposits, transfersOut, transfersIn)
    }
}

// ---------------------------------------------------------------------------
// Draft + validation (used by the form and, again, by the ViewModel)
// ---------------------------------------------------------------------------

/** What the Add/Edit Transaction form produces. [id] is null for a new transaction. */
data class TransactionDraft(
    val id: String? = null,
    val type: TransactionType,
    val accountId: String,
    val toAccountId: String? = null,
    val amount: Double,
    val date: String,
    val category: String = "",
    val subCategory: String = "",
    val note: String = "",
    val cleared: Boolean = false
) {
    /** Drops fields that don't belong to the selected type so stale values aren't stored. */
    fun normalized(): TransactionDraft = when (type) {
        TransactionType.TRANSFER -> copy(category = "", subCategory = "")
        TransactionType.DEPOSIT, TransactionType.WITHDRAWAL -> copy(toAccountId = null)
    }
}

object TransactionValidator {

    fun isValidDate(raw: String): Boolean {
        if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(raw)) return false
        return try {
            SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }.parse(raw) != null
        } catch (e: Exception) {
            false
        }
    }

    /** Returns a user-facing error message, or null if the draft is valid. */
    fun validate(draft: TransactionDraft, knownAccountIds: Set<String>): String? {
        if (draft.amount <= 0.0 || draft.amount.isNaN() || draft.amount.isInfinite()) {
            return "Enter an amount greater than zero."
        }
        if (!isValidDate(draft.date)) return "Enter the date as YYYY-MM-DD."
        if (draft.accountId !in knownAccountIds) {
            return if (draft.type == TransactionType.TRANSFER) "Choose a From account." else "Choose an account."
        }
        if (draft.type == TransactionType.TRANSFER) {
            val to = draft.toAccountId
            if (to.isNullOrBlank() || to !in knownAccountIds) return "Choose a To account."
            if (to == draft.accountId) return "From and To accounts must be different."
        }
        return null
    }
}
