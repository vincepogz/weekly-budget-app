package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "budget_periods")
data class BudgetPeriodEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val name: String,
    val numberOfWeeks: Int = 1,
    val currentWeek: Int = 1,
    val startDate: String = "",
    val endDate: String = "",
    val note: String = "",
    val isCurrent: Boolean = false
)

@Entity(tableName = "contributors")
data class ContributorEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val budgetPeriodId: String,
    val name: String,
    val income1: Double = 0.0,
    val income2: Double = 0.0,
    val income3: Double = 0.0,
    val weeklyAllowance: Double = 0.0,
    val note: String = ""
) {
    val totalIncome: Double get() = income1 + income2 + income3
}

@Entity(tableName = "income_sources")
data class IncomeSourceEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val contributorId: String,
    val budgetPeriodId: String,
    val label: String = "Primary Income",
    val weeklyAmount: Double = 0.0
)

enum class AccountType {
    CHECKING,
    SAVINGS,
    GOAL,
    ALLOWANCE,
    INVESTMENT,
    DEBT
}

@Entity(tableName = "accounts")
data class AccountEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val name: String,
    val type: String = AccountType.CHECKING.name,
    val startingBalance: Double = 0.0,
    /**
     * Legacy column, no longer maintained. Balances are now derived from [startingBalance]
     * plus the transaction records (see BalanceCalculator), so there is a single source of truth.
     */
    val currentBalance: Double = 0.0,
    val targetAmount: Double = 0.0,
    val colorHex: String = "#006C4C"
)

@Entity(tableName = "contribution_allocations")
data class ContributionAllocationEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val budgetPeriodId: String,
    val contributorId: String,
    val accountId: String,
    val amount: Double = 0.0,
    val percentage: Double = 0.0
)

@Entity(tableName = "budget_items")
data class BudgetItemEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val budgetPeriodId: String,
    val category: String, // HOUSE, LIVING EXPENSE, FOOD, TRANSPORTATION, BILLS, SUBSCRIPTIONS, OTHER
    val subCategory: String, // RENT, UTILITIES, GROCERY, etc.
    val weeklyAmount: Double = 0.0,
    val monthlyAmount: Double = 0.0,
    val yearlyAmount: Double = 0.0,
    val targetAccountId: String? = null
)

/**
 * The three transaction types. The enum [name] is what gets stored in the database,
 * backups, and the Google Sheet ledger.
 *
 * Older builds stored EXPENSE / INCOME; [fromStored] maps those to WITHDRAWAL / DEPOSIT so
 * old backups and old sheet rows keep working.
 */
enum class TransactionType(val label: String) {
    WITHDRAWAL("Withdrawal"),
    DEPOSIT("Deposit"),
    TRANSFER("Transfer");

    companion object {
        fun fromStored(raw: String?): TransactionType = when (raw?.trim()?.uppercase()) {
            "DEPOSIT", "INCOME" -> DEPOSIT
            "TRANSFER" -> TRANSFER
            else -> WITHDRAWAL // "WITHDRAWAL", legacy "EXPENSE", or anything unrecognised
        }
    }
}

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val budgetPeriodId: String = "",
    val accountId: String,
    val toAccountId: String? = null,
    val contributorId: String? = null,
    val category: String = "",
    val subCategory: String = "",
    val amount: Double = 0.0,
    val type: String = TransactionType.WITHDRAWAL.name,
    val date: String = "",
    val note: String = "",
    val payee: String = "",
    val tag: String = "",
    val isRecurring: Boolean = false,
    val syncedToMasterSheet: Boolean = false,
    /** Only cleared transactions contribute to an account's Cleared Balance. */
    val cleared: Boolean = false,
    /** Epoch millis when the record was entered, for tie-breaking sorts. */
    val createdAt: Long = System.currentTimeMillis()
) {
    val transactionType: TransactionType get() = TransactionType.fromStored(type)
}

@Entity(tableName = "recurring_transactions")
data class RecurringTransactionEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val title: String,
    val amount: Double,
    val type: String = TransactionType.WITHDRAWAL.name,
    val accountId: String,
    val category: String,
    val subCategory: String,
    val frequency: String = "WEEKLY", // WEEKLY, BI_WEEKLY, MONTHLY
    val nextDueDate: String = "",
    val active: Boolean = true
)

@Entity(tableName = "income_calculations")
data class IncomeCalculationEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val contributorName: String,
    val source: String,
    val hourlyRate: Double = 0.0,
    val hoursPerWeek: Double = 40.0,
    val numberOfWeeks: Int = 52,
    val weeklyGross: Double = 0.0,
    val yearlyGross: Double = 0.0,
    val weeklyTax: Double = 0.0,
    val investment: Double = 0.0,
    val weeklyNet: Double = 0.0,
    val reported: Double = 0.0
)
