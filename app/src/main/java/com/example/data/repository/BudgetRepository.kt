package com.example.data.repository

import com.example.data.local.BudgetDao
import com.example.data.model.*
import com.example.data.domain.*
import com.example.data.sync.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import java.util.UUID

class BudgetRepository(
    private val budgetDao: BudgetDao,
    private val googleSheetsService: GoogleSheetsService,
    private val backupManager: PortableBackupManager
) {
    val allPeriods: Flow<List<BudgetPeriodEntity>> = budgetDao.getAllBudgetPeriods()
    val currentPeriod: Flow<BudgetPeriodEntity?> = budgetDao.getCurrentBudgetPeriod()
    val allAccounts: Flow<List<AccountEntity>> = budgetDao.getAllAccounts()
    val allTransactions: Flow<List<TransactionEntity>> = budgetDao.getAllTransactions()
    val recurringTransactions: Flow<List<RecurringTransactionEntity>> = budgetDao.getActiveRecurringTransactions()
    val incomeCalculations: Flow<List<IncomeCalculationEntity>> = budgetDao.getAllIncomeCalculations()
    val allIncomeSources: Flow<List<IncomeSourceEntity>> = budgetDao.getAllIncomeSources()

    fun getContributorsForPeriod(periodId: String): Flow<List<ContributorEntity>> =
        budgetDao.getContributorsForPeriod(periodId)

    fun getIncomeSourcesForPeriod(periodId: String): Flow<List<IncomeSourceEntity>> =
        budgetDao.getIncomeSourcesForPeriod(periodId)

    fun getAllocationsForPeriod(periodId: String): Flow<List<ContributionAllocationEntity>> =
        budgetDao.getAllocationsForPeriod(periodId)

    fun getBudgetItemsForPeriod(periodId: String): Flow<List<BudgetItemEntity>> =
        budgetDao.getBudgetItemsForPeriod(periodId)

    fun getTransactionsForPeriod(periodId: String): Flow<List<TransactionEntity>> =
        budgetDao.getTransactionsForPeriod(periodId)

    suspend fun seedDefaultDataIfEmpty() {
        val existingPeriods = allPeriods.firstOrNull()
        if (existingPeriods.isNullOrEmpty()) {
            val seed = SampleDataProvider.createSeedData()
            budgetDao.insertAccounts(seed.accounts)
            budgetDao.insertBudgetPeriods(seed.periods)
            budgetDao.insertContributors(seed.contributors)
            budgetDao.insertIncomeSources(seed.incomeSources)
            budgetDao.insertAllocations(seed.allocations)
            budgetDao.insertBudgetItems(seed.budgetItems)
            budgetDao.insertTransactions(seed.transactions)
            budgetDao.insertRecurringTransactions(seed.recurringTransactions)
            budgetDao.insertIncomeCalculations(seed.incomeCalculations)
        }
    }

    suspend fun setCurrentPeriod(periodId: String) {
        budgetDao.clearCurrentBudgetFlags()
        budgetDao.setCurrentBudgetPeriod(periodId)
    }

    suspend fun insertOrUpdatePeriod(period: BudgetPeriodEntity) {
        if (period.isCurrent) {
            budgetDao.clearCurrentBudgetFlags()
        }
        budgetDao.insertBudgetPeriod(period)
    }

    suspend fun deletePeriod(period: BudgetPeriodEntity) {
        budgetDao.deleteBudgetPeriod(period)
        budgetDao.deleteContributorsForPeriod(period.id)
        budgetDao.deleteAllocationsForPeriod(period.id)
        budgetDao.deleteBudgetItemsForPeriod(period.id)
    }

    suspend fun insertOrUpdateContributor(contributor: ContributorEntity) {
        budgetDao.insertContributor(contributor)
    }

    suspend fun updateContributorWithAllocations(
        contributor: ContributorEntity,
        allocations: List<ContributionAllocationEntity>
    ) {
        budgetDao.insertContributor(contributor)
        budgetDao.deleteAllocationsForContributor(contributor.id)
        if (allocations.isNotEmpty()) {
            budgetDao.insertAllocations(allocations)
        }
    }

    suspend fun deleteContributor(contributor: ContributorEntity) {
        budgetDao.deleteAllocationsForContributor(contributor.id)
        budgetDao.deleteContributor(contributor)
    }

    suspend fun insertOrUpdateIncomeSource(incomeSource: IncomeSourceEntity) {
        budgetDao.insertIncomeSource(incomeSource)
    }

    suspend fun deleteIncomeSource(incomeSource: IncomeSourceEntity) {
        budgetDao.deleteIncomeSource(incomeSource)
    }

    suspend fun insertOrUpdateAllocation(allocation: ContributionAllocationEntity) {
        budgetDao.insertAllocations(listOf(allocation))
    }

    suspend fun insertOrUpdateAccount(account: AccountEntity) {
        budgetDao.insertAccount(account)
    }

    suspend fun countAccountReferences(accountId: String): AccountReferenceCounts {
        val txCount = budgetDao.countTransactionsReferencingAccount(accountId)
        val allocCount = budgetDao.countAllocationsReferencingAccount(accountId)
        val itemCount = budgetDao.countBudgetItemsReferencingAccount(accountId)
        return AccountReferenceCounts(txCount, allocCount, itemCount)
    }

    suspend fun deleteAccountWithReassignment(accountToDeleteId: String, reassignToAccountId: String?) {
        if (!reassignToAccountId.isNullOrBlank() && reassignToAccountId != accountToDeleteId) {
            budgetDao.reassignSourceAccountInTransactions(accountToDeleteId, reassignToAccountId)
            budgetDao.reassignDestinationAccountInTransactions(accountToDeleteId, reassignToAccountId)
            budgetDao.reassignAllocations(accountToDeleteId, reassignToAccountId)
            budgetDao.reassignBudgetItems(accountToDeleteId, reassignToAccountId)
        }
        val account = budgetDao.getAccountById(accountToDeleteId)
        if (account != null) {
            budgetDao.deleteAccount(account)
        }
    }

    suspend fun insertOrUpdateBudgetItem(item: BudgetItemEntity) {
        budgetDao.insertBudgetItem(item)
    }

    suspend fun deleteBudgetItem(item: BudgetItemEntity) {
        budgetDao.deleteBudgetItem(item)
    }

    /**
     * Account balances are NOT stored or adjusted here. They are derived from the transaction
     * records by BalanceCalculator, so add / edit / delete / import can never leave a balance
     * out of sync with the ledger.
     */
    suspend fun addTransaction(transaction: TransactionEntity) {
        budgetDao.insertTransaction(transaction)
        autoSyncIfEnabled()
    }

    suspend fun updateTransaction(transaction: TransactionEntity) {
        budgetDao.updateTransaction(transaction)
        autoSyncIfEnabled()
    }

    suspend fun deleteTransaction(transaction: TransactionEntity) {
        budgetDao.deleteTransaction(transaction)
    }

    private suspend fun autoSyncIfEnabled() {
        if (googleSheetsService.autoSyncEnabled) {
            syncCurrentToMasterSheet()
        }
    }

    suspend fun insertOrUpdateRecurring(recurring: RecurringTransactionEntity) {
        budgetDao.insertRecurringTransaction(recurring)
    }

    suspend fun deleteRecurring(recurring: RecurringTransactionEntity) {
        budgetDao.deleteRecurringTransaction(recurring)
    }

    suspend fun insertOrUpdateIncomeCalc(calc: IncomeCalculationEntity) {
        budgetDao.insertIncomeCalculation(calc)
    }

    suspend fun deleteIncomeCalc(calc: IncomeCalculationEntity) {
        budgetDao.deleteIncomeCalculation(calc)
    }

    suspend fun getFullBudgetData(): FullBudgetData {
        return FullBudgetData(
            periods = allPeriods.firstOrNull() ?: emptyList(),
            contributors = budgetDao.getAllContributors().firstOrNull() ?: emptyList(),
            accounts = allAccounts.firstOrNull() ?: emptyList(),
            allocations = budgetDao.getAllAllocations().firstOrNull() ?: emptyList(),
            budgetItems = budgetDao.getAllBudgetItems().firstOrNull() ?: emptyList(),
            transactions = allTransactions.firstOrNull() ?: emptyList(),
            recurringTransactions = recurringTransactions.firstOrNull() ?: emptyList(),
            incomeCalculations = incomeCalculations.firstOrNull() ?: emptyList()
        )
    }

    suspend fun importFullData(data: FullBudgetData, mode: ImportConflictMode) {
        when (mode) {
            ImportConflictMode.REPLACE -> {
                budgetDao.clearBudgetPeriods()
                budgetDao.clearContributors()
                budgetDao.clearAccounts()
                budgetDao.clearAllocations()
                budgetDao.clearBudgetItems()
                budgetDao.clearTransactions()
                budgetDao.clearRecurringTransactions()
                budgetDao.clearIncomeCalculations()

                budgetDao.insertBudgetPeriods(data.periods)
                budgetDao.insertContributors(data.contributors)
                budgetDao.insertAccounts(data.accounts)
                budgetDao.insertAllocations(data.allocations)
                budgetDao.insertBudgetItems(data.budgetItems)
                budgetDao.insertTransactions(data.transactions)
                budgetDao.insertRecurringTransactions(data.recurringTransactions)
                budgetDao.insertIncomeCalculations(data.incomeCalculations)
            }
            ImportConflictMode.MERGE -> {
                budgetDao.insertBudgetPeriods(data.periods)
                budgetDao.insertContributors(data.contributors)
                budgetDao.insertAccounts(data.accounts)
                budgetDao.insertAllocations(data.allocations)
                budgetDao.insertBudgetItems(data.budgetItems)
                budgetDao.insertTransactions(data.transactions)
                budgetDao.insertRecurringTransactions(data.recurringTransactions)
                budgetDao.insertIncomeCalculations(data.incomeCalculations)
            }
            ImportConflictMode.IMPORT_AS_NEW -> {
                // Ensure existing current period remains current
                val sanitizedPeriods = data.periods.map { it.copy(id = UUID.randomUUID().toString(), isCurrent = false) }
                budgetDao.insertBudgetPeriods(sanitizedPeriods)
                budgetDao.insertAccounts(data.accounts)
                budgetDao.insertTransactions(data.transactions)
            }
        }
    }

    suspend fun importParsedSheet(parsed: ParsedSheetData) {
        budgetDao.clearCurrentBudgetFlags()
        budgetDao.insertBudgetPeriod(parsed.period.copy(isCurrent = true))
        val updatedContributors = parsed.contributors.map { it.copy(budgetPeriodId = parsed.period.id) }
        val updatedItems = parsed.budgetItems.map { it.copy(budgetPeriodId = parsed.period.id) }
        budgetDao.insertContributors(updatedContributors)
        budgetDao.insertBudgetItems(updatedItems)
    }

    suspend fun syncCurrentToMasterSheet(): SyncResult {
        val period = currentPeriod.firstOrNull() ?: return SyncResult(false, "No active budget period found")
        val contributors = getContributorsForPeriod(period.id).firstOrNull() ?: emptyList()
        val accounts = allAccounts.firstOrNull() ?: emptyList()
        val allocations = getAllocationsForPeriod(period.id).firstOrNull() ?: emptyList()
        val budgetItems = getBudgetItemsForPeriod(period.id).firstOrNull() ?: emptyList()
        val transactions = getTransactionsForPeriod(period.id).firstOrNull() ?: emptyList()

        val result = googleSheetsService.syncToGoogleSheets(
            period = period,
            contributors = contributors,
            accounts = accounts,
            allocations = allocations,
            budgetItems = budgetItems,
            transactions = transactions
        )
        if (result.success) {
            budgetDao.markTransactionsSynced(transactions.map { it.id })
        }
        return result
    }
}
