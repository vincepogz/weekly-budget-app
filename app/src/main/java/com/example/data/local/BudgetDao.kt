package com.example.data.local

import androidx.room.*
import com.example.data.model.*
import kotlinx.coroutines.flow.Flow

@Dao
interface BudgetDao {
    // Budget Periods
    @Query("SELECT * FROM budget_periods ORDER BY startDate DESC")
    fun getAllBudgetPeriods(): Flow<List<BudgetPeriodEntity>>

    @Query("SELECT * FROM budget_periods WHERE isCurrent = 1 LIMIT 1")
    fun getCurrentBudgetPeriod(): Flow<BudgetPeriodEntity?>

    @Query("SELECT * FROM budget_periods WHERE id = :id LIMIT 1")
    suspend fun getBudgetPeriodById(id: String): BudgetPeriodEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBudgetPeriod(period: BudgetPeriodEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBudgetPeriods(periods: List<BudgetPeriodEntity>)

    @Update
    suspend fun updateBudgetPeriod(period: BudgetPeriodEntity)

    @Query("UPDATE budget_periods SET isCurrent = 0")
    suspend fun clearCurrentBudgetFlags()

    @Query("UPDATE budget_periods SET isCurrent = 1 WHERE id = :id")
    suspend fun setCurrentBudgetPeriod(id: String)

    @Delete
    suspend fun deleteBudgetPeriod(period: BudgetPeriodEntity)

    // Contributors & Income Sources
    @Query("SELECT * FROM contributors WHERE budgetPeriodId = :periodId")
    fun getContributorsForPeriod(periodId: String): Flow<List<ContributorEntity>>

    @Query("SELECT * FROM contributors")
    fun getAllContributors(): Flow<List<ContributorEntity>>

    @Query("SELECT * FROM income_sources WHERE budgetPeriodId = :periodId")
    fun getIncomeSourcesForPeriod(periodId: String): Flow<List<IncomeSourceEntity>>

    @Query("SELECT * FROM income_sources")
    fun getAllIncomeSources(): Flow<List<IncomeSourceEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertContributors(contributors: List<ContributorEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertContributor(contributor: ContributorEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertIncomeSource(incomeSource: IncomeSourceEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertIncomeSources(incomeSources: List<IncomeSourceEntity>)

    @Update
    suspend fun updateContributor(contributor: ContributorEntity)

    @Update
    suspend fun updateIncomeSource(incomeSource: IncomeSourceEntity)

    @Delete
    suspend fun deleteContributor(contributor: ContributorEntity)

    @Delete
    suspend fun deleteIncomeSource(incomeSource: IncomeSourceEntity)

    @Query("DELETE FROM contributors WHERE budgetPeriodId = :periodId")
    suspend fun deleteContributorsForPeriod(periodId: String)

    @Query("DELETE FROM income_sources WHERE budgetPeriodId = :periodId")
    suspend fun deleteIncomeSourcesForPeriod(periodId: String)

    // Accounts
    @Query("SELECT * FROM accounts ORDER BY name ASC")
    fun getAllAccounts(): Flow<List<AccountEntity>>

    @Query("SELECT * FROM accounts WHERE id = :id LIMIT 1")
    suspend fun getAccountById(id: String): AccountEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAccount(account: AccountEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAccounts(accounts: List<AccountEntity>)

    @Update
    suspend fun updateAccount(account: AccountEntity)

    @Delete
    suspend fun deleteAccount(account: AccountEntity)

    // Contribution Allocations
    @Query("SELECT * FROM contribution_allocations WHERE budgetPeriodId = :periodId")
    fun getAllocationsForPeriod(periodId: String): Flow<List<ContributionAllocationEntity>>

    @Query("SELECT * FROM contribution_allocations")
    fun getAllAllocations(): Flow<List<ContributionAllocationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAllocations(allocations: List<ContributionAllocationEntity>)

    @Query("DELETE FROM contribution_allocations WHERE budgetPeriodId = :periodId")
    suspend fun deleteAllocationsForPeriod(periodId: String)

    @Query("DELETE FROM contribution_allocations WHERE contributorId = :contributorId")
    suspend fun deleteAllocationsForContributor(contributorId: String)

    // Budget Items
    @Query("SELECT * FROM budget_items WHERE budgetPeriodId = :periodId ORDER BY category ASC, subCategory ASC")
    fun getBudgetItemsForPeriod(periodId: String): Flow<List<BudgetItemEntity>>

    @Query("SELECT * FROM budget_items")
    fun getAllBudgetItems(): Flow<List<BudgetItemEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBudgetItem(item: BudgetItemEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBudgetItems(items: List<BudgetItemEntity>)

    @Update
    suspend fun updateBudgetItem(item: BudgetItemEntity)

    @Delete
    suspend fun deleteBudgetItem(item: BudgetItemEntity)

    @Query("DELETE FROM budget_items WHERE budgetPeriodId = :periodId")
    suspend fun deleteBudgetItemsForPeriod(periodId: String)

    // Transactions
    @Query("SELECT * FROM transactions WHERE budgetPeriodId = :periodId ORDER BY date DESC, createdAt DESC")
    fun getTransactionsForPeriod(periodId: String): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions ORDER BY date DESC, createdAt DESC")
    fun getAllTransactions(): Flow<List<TransactionEntity>>

    @Query("SELECT COUNT(*) FROM transactions WHERE accountId = :accountId OR toAccountId = :accountId")
    suspend fun countTransactionsReferencingAccount(accountId: String): Int

    @Query("SELECT COUNT(*) FROM contribution_allocations WHERE accountId = :accountId")
    suspend fun countAllocationsReferencingAccount(accountId: String): Int

    @Query("SELECT COUNT(*) FROM budget_items WHERE targetAccountId = :accountId")
    suspend fun countBudgetItemsReferencingAccount(accountId: String): Int

    @Query("UPDATE transactions SET accountId = :newAccountId WHERE accountId = :oldAccountId")
    suspend fun reassignSourceAccountInTransactions(oldAccountId: String, newAccountId: String)

    @Query("UPDATE transactions SET toAccountId = :newAccountId WHERE toAccountId = :oldAccountId")
    suspend fun reassignDestinationAccountInTransactions(oldAccountId: String, newAccountId: String)

    @Query("UPDATE contribution_allocations SET accountId = :newAccountId WHERE accountId = :oldAccountId")
    suspend fun reassignAllocations(oldAccountId: String, newAccountId: String)

    @Query("UPDATE budget_items SET targetAccountId = :newAccountId WHERE targetAccountId = :oldAccountId")
    suspend fun reassignBudgetItems(oldAccountId: String, newAccountId: String)

    @Query("SELECT * FROM transactions WHERE syncedToMasterSheet = 0")
    suspend fun getUnsyncedTransactions(): List<TransactionEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(transaction: TransactionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransactions(transactions: List<TransactionEntity>)

    @Update
    suspend fun updateTransaction(transaction: TransactionEntity)

    @Delete
    suspend fun deleteTransaction(transaction: TransactionEntity)

    @Query("UPDATE transactions SET syncedToMasterSheet = 1 WHERE id IN (:ids)")
    suspend fun markTransactionsSynced(ids: List<String>)

    // Recurring Transactions
    @Query("SELECT * FROM recurring_transactions WHERE active = 1")
    fun getActiveRecurringTransactions(): Flow<List<RecurringTransactionEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRecurringTransaction(recurring: RecurringTransactionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRecurringTransactions(recurring: List<RecurringTransactionEntity>)

    @Update
    suspend fun updateRecurringTransaction(recurring: RecurringTransactionEntity)

    @Delete
    suspend fun deleteRecurringTransaction(recurring: RecurringTransactionEntity)

    // Income Calculations
    @Query("SELECT * FROM income_calculations")
    fun getAllIncomeCalculations(): Flow<List<IncomeCalculationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertIncomeCalculations(calcs: List<IncomeCalculationEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertIncomeCalculation(calc: IncomeCalculationEntity)

    @Update
    suspend fun updateIncomeCalculation(calc: IncomeCalculationEntity)

    @Delete
    suspend fun deleteIncomeCalculation(calc: IncomeCalculationEntity)

    // Bulk Clear for Reset / Restore
    @Query("DELETE FROM budget_periods")
    suspend fun clearBudgetPeriods()

    @Query("DELETE FROM contributors")
    suspend fun clearContributors()

    @Query("DELETE FROM accounts")
    suspend fun clearAccounts()

    @Query("DELETE FROM contribution_allocations")
    suspend fun clearAllocations()

    @Query("DELETE FROM budget_items")
    suspend fun clearBudgetItems()

    @Query("DELETE FROM transactions")
    suspend fun clearTransactions()

    @Query("DELETE FROM recurring_transactions")
    suspend fun clearRecurringTransactions()

    @Query("DELETE FROM income_calculations")
    suspend fun clearIncomeCalculations()
}
