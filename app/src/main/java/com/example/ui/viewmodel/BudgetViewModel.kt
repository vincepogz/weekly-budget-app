package com.example.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.domain.AccountBalance
import com.example.data.domain.BalanceCalculator
import com.example.data.domain.BudgetCalculator
import com.example.data.domain.BudgetOptions
import com.example.data.domain.BudgetTotals
import com.example.data.domain.TransactionDraft
import com.example.data.domain.TransactionValidator
import com.example.data.local.BudgetDatabase
import com.example.data.local.BudgetSettings
import com.example.data.model.*
import com.example.data.repository.BudgetRepository
import com.example.data.sync.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.io.File
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.*

data class BudgetUiState(
    val periods: List<BudgetPeriodEntity> = emptyList(),
    val currentPeriod: BudgetPeriodEntity? = null,
    val contributors: List<ContributorEntity> = emptyList(),
    val accounts: List<AccountEntity> = emptyList(),
    val allocations: List<ContributionAllocationEntity> = emptyList(),
    val budgetItems: List<BudgetItemEntity> = emptyList(),
    val transactions: List<TransactionEntity> = emptyList(),
    val allTransactions: List<TransactionEntity> = emptyList(),
    val recurringTransactions: List<RecurringTransactionEntity> = emptyList(),
    val incomeCalculations: List<IncomeCalculationEntity> = emptyList(),
    val isSyncing: Boolean = false,
    val syncStatusMessage: String? = null,
    val lastSyncTimestamp: String = "Never",
    val masterSheetId: String = "",
    val masterSheetName: String = "Weekly Budget Master File",
    /** Balance and cleared balance per account id, derived from ALL transactions. */
    val accountBalances: Map<String, AccountBalance> = emptyMap(),
    val includeDeposits: Boolean = true,
    val includeTransfers: Boolean = false,
    val selectedPeriodTab: Int = 0 // 0: Dashboard, 1: Budget Breakdown, 2: Cash Flow, 3: Transactions, 4: Accounts & Sync
) {
    val totalWeeklyIncome: Double get() = contributors.sumOf { it.totalIncome }
    val totalWeeklyExpenses: Double get() = budgetItems.sumOf { it.weeklyAmount }
    val numberOfWeeks: Int get() = currentPeriod?.numberOfWeeks ?: 1
    val periodTotalExpense: Double get() = totalWeeklyExpenses * numberOfWeeks
    val weeklyNetCashFlow: Double get() = totalWeeklyIncome - totalWeeklyExpenses
    val periodGrandTotalBalance: Double get() = weeklyNetCashFlow * numberOfWeeks

    val budgetOptions: BudgetOptions
        get() = BudgetOptions(includeDeposits = includeDeposits, includeTransfers = includeTransfers)

    /** Actuals for the current period, respecting Include Deposits / Include Transfers. */
    val actualTotals: BudgetTotals get() = BudgetCalculator.totals(transactions, budgetOptions)

    val actualExpensesThisPeriod: Double get() = actualTotals.withdrawals
    val actualIncomeThisPeriod: Double get() = actualTotals.deposits

    fun balanceOf(accountId: String): Double = accountBalances[accountId]?.balance ?: 0.0
    fun clearedBalanceOf(accountId: String): Double = accountBalances[accountId]?.clearedBalance ?: 0.0

    /** Transfers move money between your own accounts, so they cancel out in these totals. */
    val totalAccountBalances: Double get() = accountBalances.values.sumOf { it.balance }
    val totalClearedBalance: Double get() = accountBalances.values.sumOf { it.clearedBalance }
}

class BudgetViewModel(application: Application) : AndroidViewModel(application) {

    private val db = BudgetDatabase.getDatabase(application)
    private val sheetsService = GoogleSheetsService(application)
    private val backupManager = PortableBackupManager(application)
    private val repository = BudgetRepository(db.budgetDao(), sheetsService, backupManager)
    private val budgetSettings = BudgetSettings(application)

    private val _uiState = MutableStateFlow(
        BudgetUiState(
            lastSyncTimestamp = sheetsService.lastSyncTimestamp,
            masterSheetId = sheetsService.masterSheetId,
            masterSheetName = sheetsService.masterSheetName,
            includeDeposits = budgetSettings.includeDeposits,
            includeTransfers = budgetSettings.includeTransfers
        )
    )
    val uiState: StateFlow<BudgetUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.seedDefaultDataIfEmpty()
            observeDatabase()
        }
    }

    private fun observeDatabase() {
        viewModelScope.launch {
            combine(
                repository.allPeriods,
                repository.currentPeriod,
                repository.allAccounts,
                repository.allTransactions
            ) { periods, currentPeriod, accounts, transactions ->
                val active = currentPeriod ?: periods.firstOrNull { it.isCurrent } ?: periods.firstOrNull()
                ActiveCoreData(periods, active, accounts, transactions)
            }.collectLatest { core ->
                _uiState.update { current ->
                    current.copy(
                        periods = core.periods,
                        currentPeriod = core.currentPeriod,
                        accounts = core.accounts,
                        // Balances must see every transaction, not just this period's.
                        accountBalances = BalanceCalculator.calculate(core.accounts, core.transactions),
                        allTransactions = core.transactions,
                        transactions = core.transactions.filter {
                            core.currentPeriod == null || it.budgetPeriodId.isEmpty() || it.budgetPeriodId == core.currentPeriod.id
                        },
                        lastSyncTimestamp = sheetsService.lastSyncTimestamp,
                        masterSheetId = sheetsService.masterSheetId,
                        masterSheetName = sheetsService.masterSheetName
                    )
                }

                // If active period changed, observe period-specific sub-collections
                core.currentPeriod?.let { period ->
                    observePeriodDetails(period.id)
                }
            }
        }

        viewModelScope.launch {
            repository.recurringTransactions.collectLatest { recurring ->
                _uiState.update { it.copy(recurringTransactions = recurring) }
            }
        }

        viewModelScope.launch {
            repository.incomeCalculations.collectLatest { calcs ->
                _uiState.update { it.copy(incomeCalculations = calcs) }
            }
        }
    }

    private fun observePeriodDetails(periodId: String) {
        viewModelScope.launch {
            combine(
                repository.getContributorsForPeriod(periodId),
                repository.getAllocationsForPeriod(periodId),
                repository.getBudgetItemsForPeriod(periodId)
            ) { contributors, allocations, budgetItems ->
                Triple(contributors, allocations, budgetItems)
            }.collectLatest { (contributors, allocations, budgetItems) ->
                _uiState.update { it.copy(contributors = contributors, allocations = allocations, budgetItems = budgetItems) }
            }
        }
    }

    private data class ActiveCoreData(
        val periods: List<BudgetPeriodEntity>,
        val currentPeriod: BudgetPeriodEntity?,
        val accounts: List<AccountEntity>,
        val transactions: List<TransactionEntity>
    )

    fun selectPeriod(periodId: String) {
        viewModelScope.launch {
            repository.setCurrentPeriod(periodId)
        }
    }

    fun selectTab(index: Int) {
        _uiState.update { it.copy(selectedPeriodTab = index) }
    }

    fun createNewPeriod(name: String, weeks: Int, startDate: String, endDate: String, note: String) {
        viewModelScope.launch {
            val newPeriod = BudgetPeriodEntity(
                name = name,
                numberOfWeeks = weeks.coerceAtLeast(1),
                currentWeek = 1,
                startDate = startDate,
                endDate = endDate,
                note = note,
                isCurrent = true
            )
            repository.insertOrUpdatePeriod(newPeriod)
            repository.setCurrentPeriod(newPeriod.id)
        }
    }

    fun updateBudgetItemFrequency(item: BudgetItemEntity, field: String, value: Double) {
        viewModelScope.launch {
            val updated = when (field.lowercase()) {
                "weekly" -> {
                    val w = value
                    val m = (w * 52.0) / 12.0
                    val y = w * 52.0
                    item.copy(weeklyAmount = w, monthlyAmount = m, yearlyAmount = y)
                }
                "monthly" -> {
                    val m = value
                    val y = m * 12.0
                    val w = (m * 12.0) / 52.0
                    item.copy(weeklyAmount = w, monthlyAmount = m, yearlyAmount = y)
                }
                "yearly" -> {
                    val y = value
                    val m = y / 12.0
                    val w = y / 52.0
                    item.copy(weeklyAmount = w, monthlyAmount = m, yearlyAmount = y)
                }
                else -> item
            }
            repository.insertOrUpdateBudgetItem(updated)
        }
    }

    fun addBudgetItem(category: String, subCategory: String, amount: Double, frequency: String) {
        val period = uiState.value.currentPeriod ?: return
        viewModelScope.launch {
            val (w, m, y) = when (frequency.lowercase()) {
                "monthly" -> Triple((amount * 12.0) / 52.0, amount, amount * 12.0)
                "yearly" -> Triple(amount / 52.0, amount / 12.0, amount)
                else -> Triple(amount, (amount * 52.0) / 12.0, amount * 52.0)
            }
            val newItem = BudgetItemEntity(
                budgetPeriodId = period.id,
                category = category.trim().uppercase(),
                subCategory = subCategory.trim().uppercase(),
                weeklyAmount = w,
                monthlyAmount = m,
                yearlyAmount = y
            )
            repository.insertOrUpdateBudgetItem(newItem)
        }
    }

    fun deleteBudgetItem(item: BudgetItemEntity) {
        viewModelScope.launch {
            repository.deleteBudgetItem(item)
        }
    }

    /** Creates a transaction, or edits the existing one when [draft] has an id. */
    fun saveTransaction(draft: TransactionDraft) {
        val clean = draft.normalized()
        val error = TransactionValidator.validate(clean, uiState.value.accounts.map { it.id }.toSet())
        if (error != null) {
            _uiState.update { it.copy(syncStatusMessage = error) }
            return
        }
        val existing = clean.id?.let { id -> uiState.value.transactions.firstOrNull { it.id == id } }
        viewModelScope.launch {
            if (existing != null) {
                // copy() keeps period, contributor, payee, tag and recurring info untouched.
                repository.updateTransaction(
                    existing.copy(
                        accountId = clean.accountId,
                        toAccountId = clean.toAccountId,
                        amount = clean.amount,
                        type = clean.type.name,
                        date = clean.date,
                        category = clean.category,
                        subCategory = clean.subCategory,
                        note = clean.note,
                        cleared = clean.cleared,
                        syncedToMasterSheet = false
                    )
                )
                _uiState.update { it.copy(syncStatusMessage = "Transaction updated.") }
            } else {
                repository.addTransaction(
                    TransactionEntity(
                        budgetPeriodId = uiState.value.currentPeriod?.id ?: "",
                        accountId = clean.accountId,
                        toAccountId = clean.toAccountId,
                        amount = clean.amount,
                        type = clean.type.name,
                        date = clean.date,
                        category = clean.category,
                        subCategory = clean.subCategory,
                        note = clean.note,
                        cleared = clean.cleared
                    )
                )
                _uiState.update { it.copy(syncStatusMessage = "Transaction added.") }
            }
        }
    }

    fun setIncludeDeposits(enabled: Boolean) {
        budgetSettings.includeDeposits = enabled
        _uiState.update { it.copy(includeDeposits = enabled) }
    }

    fun setIncludeTransfers(enabled: Boolean) {
        budgetSettings.includeTransfers = enabled
        _uiState.update { it.copy(includeTransfers = enabled) }
    }

    fun deleteTransaction(transaction: TransactionEntity) {
        viewModelScope.launch {
            repository.deleteTransaction(transaction)
        }
    }

    fun addOrUpdateContributor(name: String, inc1: Double, inc2: Double, inc3: Double, allowance: Double, existingId: String? = null, note: String = "") {
        saveContributorWithContributions(
            name = name,
            incomes = listOf(inc1, inc2, inc3).filter { it > 0 },
            allowance = allowance,
            note = note,
            contributions = emptyList(),
            existingId = existingId
        )
    }

    fun saveContributorWithContributions(
        name: String,
        incomes: List<Double>,
        allowance: Double,
        note: String,
        contributions: List<Pair<String, Double>>,
        existingId: String? = null
    ) {
        val period = uiState.value.currentPeriod ?: return
        viewModelScope.launch {
            val contribId = existingId ?: UUID.randomUUID().toString()
            val inc1 = incomes.getOrNull(0) ?: 0.0
            val inc2 = incomes.getOrNull(1) ?: 0.0
            val inc3 = incomes.getOrNull(2) ?: 0.0
            val totalInc = incomes.sum()

            val contrib = ContributorEntity(
                id = contribId,
                budgetPeriodId = period.id,
                name = name.trim().uppercase(),
                income1 = inc1,
                income2 = inc2,
                income3 = inc3,
                weeklyAllowance = allowance,
                note = note.trim()
            )

            val allocEntities = contributions.map { (accId, amt) ->
                val pct = if (totalInc > 0) (amt / totalInc) * 100.0 else 0.0
                ContributionAllocationEntity(
                    id = UUID.randomUUID().toString(),
                    budgetPeriodId = period.id,
                    contributorId = contribId,
                    accountId = accId,
                    amount = amt,
                    percentage = pct
                )
            }

            repository.updateContributorWithAllocations(contrib, allocEntities)
        }
    }

    fun deleteContributor(contributor: ContributorEntity) {
        viewModelScope.launch {
            repository.deleteContributor(contributor)
        }
    }

    fun deleteIncomeCalculation(calc: IncomeCalculationEntity) {
        viewModelScope.launch {
            repository.deleteIncomeCalc(calc)
        }
    }

    fun addAccount(name: String, type: AccountType, startingBalance: Double, targetAmount: Double, colorHex: String) {
        viewModelScope.launch {
            val acc = AccountEntity(
                name = name.trim(),
                type = type.name,
                startingBalance = startingBalance,
                currentBalance = startingBalance,
                targetAmount = targetAmount,
                colorHex = colorHex
            )
            repository.insertOrUpdateAccount(acc)
        }
    }

    fun addIncomeCalculation(name: String, source: String, rate: Double, hours: Double, weeks: Int, tax: Double, invest: Double) {
        viewModelScope.launch {
            val weeklyGross = rate * hours
            val yearlyGross = weeklyGross * weeks
            val weeklyNet = weeklyGross - tax - invest
            val entity = IncomeCalculationEntity(
                contributorName = name.trim().uppercase(),
                source = source.trim().uppercase(),
                hourlyRate = rate,
                hoursPerWeek = hours,
                numberOfWeeks = weeks,
                weeklyGross = weeklyGross,
                yearlyGross = yearlyGross,
                weeklyTax = tax,
                investment = invest,
                weeklyNet = weeklyNet,
                reported = yearlyGross
            )
            repository.insertOrUpdateIncomeCalc(entity)
        }
    }

    fun triggerGoogleSheetsSync() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true, syncStatusMessage = "Syncing budget to Google Sheets...") }
            val result = repository.syncCurrentToMasterSheet()
            _uiState.update {
                it.copy(
                    isSyncing = false,
                    syncStatusMessage = result.message,
                    lastSyncTimestamp = sheetsService.lastSyncTimestamp
                )
            }
        }
    }

    fun updateMasterSheetConfig(sheetId: String, name: String) {
        sheetsService.masterSheetId = sheetId
        sheetsService.masterSheetName = name
        _uiState.update {
            it.copy(
                masterSheetId = sheetId,
                masterSheetName = name,
                syncStatusMessage = "Google Sheet Master configured: $name"
            )
        }
    }

    fun importSpreadsheetText(csvOrTabText: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true, syncStatusMessage = "Parsing spreadsheet structure...") }
            try {
                val parsed = sheetsService.parseSpreadsheetText(csvOrTabText)
                repository.importParsedSheet(parsed)
                _uiState.update {
                    it.copy(
                        isSyncing = false,
                        syncStatusMessage = "Successfully imported '${parsed.period.name}' with ${parsed.contributors.size} contributors and ${parsed.budgetItems.size} line items!"
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSyncing = false, syncStatusMessage = "Import error: ${e.localizedMessage}")
                }
            }
        }
    }

    fun exportBackup(targetFile: File, onComplete: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            val data = repository.getFullBudgetData()
            val result = backupManager.createZipExport(data, targetFile)
            if (result.isSuccess) {
                onComplete(true, "Successfully exported portable backup to ${targetFile.name}")
            } else {
                onComplete(false, "Export failed: ${result.exceptionOrNull()?.localizedMessage}")
            }
        }
    }

    fun importZipBackup(inputStream: InputStream, mode: ImportConflictMode, onComplete: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            val result = backupManager.readFromZip(inputStream)
            if (result.isSuccess) {
                val data = result.getOrThrow()
                repository.importFullData(data, mode)
                onComplete(true, "Restored ${data.periods.size} budget periods, ${data.accounts.size} accounts, and ${data.transactions.size} transactions.")
            } else {
                onComplete(false, "Import failed: ${result.exceptionOrNull()?.localizedMessage}")
            }
        }
    }

    fun resetToSeedData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true) }
            val seed = com.example.data.repository.SampleDataProvider.createSeedData()
            val fullData = FullBudgetData(
                periods = seed.periods,
                contributors = seed.contributors,
                accounts = seed.accounts,
                allocations = seed.allocations,
                budgetItems = seed.budgetItems,
                transactions = seed.transactions,
                recurringTransactions = seed.recurringTransactions,
                incomeCalculations = seed.incomeCalculations
            )
            repository.importFullData(fullData, ImportConflictMode.REPLACE)
            _uiState.update { it.copy(isSyncing = false, syncStatusMessage = "Reset to original reference budget spreadsheet tabs.") }
        }
    }

    fun clearStatusMessage() {
        _uiState.update { it.copy(syncStatusMessage = null) }
    }
}
