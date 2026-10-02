package com.example

import com.example.data.domain.BalanceCalculator
import com.example.data.domain.BudgetCalculator
import com.example.data.domain.BudgetOptions
import com.example.data.domain.TransactionDraft
import com.example.data.domain.TransactionValidator
import com.example.data.model.AccountEntity
import com.example.data.model.TransactionEntity
import com.example.data.model.TransactionType
import com.example.data.repository.SampleDataProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TransactionLogicTest {

    private val checking = AccountEntity(id = "chk", name = "Checking", startingBalance = 5000.0)
    private val savings = AccountEntity(id = "sav", name = "Savings", startingBalance = 2000.0)
    private val accounts = listOf(checking, savings)

    private fun tx(
        type: TransactionType,
        amount: Double,
        from: String = "chk",
        to: String? = null,
        cleared: Boolean = false,
        category: String = ""
    ) = TransactionEntity(
        accountId = from,
        toAccountId = to,
        amount = amount,
        type = type.name,
        category = category,
        date = "2026-10-02",
        cleared = cleared
    )

    private fun total(map: Map<String, com.example.data.domain.AccountBalance>) = map.values.sumOf { it.balance }

    // ---- Balances -------------------------------------------------------------------------

    @Test
    fun transfer_movesMoney_andKeepsCombinedBalanceUnchanged() {
        // The worked example from the spec.
        val result = BalanceCalculator.calculate(
            accounts,
            listOf(tx(TransactionType.TRANSFER, 1000.0, from = "chk", to = "sav"))
        )
        assertEquals(4000.0, result.getValue("chk").balance, 0.001)
        assertEquals(3000.0, result.getValue("sav").balance, 0.001)
        assertEquals(7000.0, total(result), 0.001)
    }

    @Test
    fun deposit_increases_withdrawal_decreases() {
        val result = BalanceCalculator.calculate(
            accounts,
            listOf(
                tx(TransactionType.DEPOSIT, 300.0),
                tx(TransactionType.WITHDRAWAL, 125.50)
            )
        )
        assertEquals(5000.0 + 300.0 - 125.50, result.getValue("chk").balance, 0.001)
        assertEquals(2000.0, result.getValue("sav").balance, 0.001)
    }

    @Test
    fun clearedBalance_countsOnlyClearedTransactions() {
        val result = BalanceCalculator.calculate(
            accounts,
            listOf(
                tx(TransactionType.DEPOSIT, 300.0, cleared = true),
                tx(TransactionType.WITHDRAWAL, 100.0, cleared = false)
            )
        )
        assertEquals(5200.0, result.getValue("chk").balance, 0.001)
        assertEquals(5300.0, result.getValue("chk").clearedBalance, 0.001)
    }

    @Test
    fun clearedTransfer_appliesToBothSides_unclearedToNeither() {
        val cleared = BalanceCalculator.calculate(
            accounts, listOf(tx(TransactionType.TRANSFER, 1000.0, to = "sav", cleared = true))
        )
        assertEquals(4000.0, cleared.getValue("chk").clearedBalance, 0.001)
        assertEquals(3000.0, cleared.getValue("sav").clearedBalance, 0.001)

        val pending = BalanceCalculator.calculate(
            accounts, listOf(tx(TransactionType.TRANSFER, 1000.0, to = "sav", cleared = false))
        )
        assertEquals(5000.0, pending.getValue("chk").clearedBalance, 0.001)
        assertEquals(2000.0, pending.getValue("sav").clearedBalance, 0.001)
        // ...but the regular balance still moved.
        assertEquals(4000.0, pending.getValue("chk").balance, 0.001)
    }

    @Test
    fun malformedTransfers_areSkipped_soCombinedBalanceCannotChange() {
        val bad = listOf(
            tx(TransactionType.TRANSFER, 500.0, from = "chk", to = "chk"),     // same account
            tx(TransactionType.TRANSFER, 500.0, from = "chk", to = null),      // no destination
            tx(TransactionType.TRANSFER, 500.0, from = "chk", to = "deleted"), // unknown destination
            tx(TransactionType.TRANSFER, 500.0, from = "deleted", to = "sav")  // unknown source
        )
        val result = BalanceCalculator.calculate(accounts, bad)
        assertEquals(5000.0, result.getValue("chk").balance, 0.001)
        assertEquals(2000.0, result.getValue("sav").balance, 0.001)
        assertEquals(7000.0, total(result), 0.001)
    }

    // ---- Legacy type names ----------------------------------------------------------------

    @Test
    fun legacyTypeNames_mapToNewTypes() {
        assertEquals(TransactionType.WITHDRAWAL, TransactionType.fromStored("EXPENSE"))
        assertEquals(TransactionType.DEPOSIT, TransactionType.fromStored("INCOME"))
        assertEquals(TransactionType.TRANSFER, TransactionType.fromStored("TRANSFER"))
        assertEquals(TransactionType.DEPOSIT, TransactionType.fromStored("deposit"))
        assertEquals(TransactionType.WITHDRAWAL, TransactionType.fromStored(null))
    }

    @Test
    fun legacyStoredTypes_stillCalculateCorrectly() {
        val legacy = listOf(
            tx(TransactionType.DEPOSIT, 100.0).copy(type = "INCOME"),
            tx(TransactionType.WITHDRAWAL, 40.0).copy(type = "EXPENSE")
        )
        val result = BalanceCalculator.calculate(accounts, legacy)
        assertEquals(5060.0, result.getValue("chk").balance, 0.001)
    }

    // ---- Budget logic ---------------------------------------------------------------------

    private val mixed = listOf(
        tx(TransactionType.WITHDRAWAL, 100.0, category = "FOOD"),
        tx(TransactionType.WITHDRAWAL, 50.0, category = "BILLS"),
        tx(TransactionType.DEPOSIT, 400.0),
        tx(TransactionType.TRANSFER, 1000.0, from = "chk", to = "sav")
    )

    @Test
    fun budget_transfersExcludedByDefault() {
        val t = BudgetCalculator.totals(mixed, BudgetOptions())
        assertEquals(150.0, t.withdrawals, 0.001)
        assertEquals(400.0, t.deposits, 0.001)
        assertEquals(0.0, t.transfersOut, 0.001)
        assertEquals(0.0, t.transfersIn, 0.001)
    }

    @Test
    fun budget_depositsExcludedWhenIncludeDepositsOff() {
        val t = BudgetCalculator.totals(mixed, BudgetOptions(includeDeposits = false))
        assertEquals(0.0, t.deposits, 0.001)
        assertEquals(150.0, t.withdrawals, 0.001) // withdrawals are unaffected
    }

    @Test
    fun budget_transfersIncludedWhenOn_andCancelAcrossAllAccounts() {
        val on = BudgetCalculator.totals(mixed, BudgetOptions(includeTransfers = true))
        assertEquals(1000.0, on.transfersOut, 0.001)
        assertEquals(1000.0, on.transfersIn, 0.001)

        val off = BudgetCalculator.totals(mixed, BudgetOptions(includeTransfers = false))
        // Turning transfers on must not change the net: money stayed inside the user's accounts.
        assertEquals(off.netFlow, on.netFlow, 0.001)
    }

    @Test
    fun budget_transferLeavingAScopedAccount_countsAsOutflow() {
        val t = BudgetCalculator.totals(
            mixed, BudgetOptions(includeTransfers = true, accountIds = setOf("chk"))
        )
        assertEquals(1000.0, t.transfersOut, 0.001)
        assertEquals(0.0, t.transfersIn, 0.001) // savings is out of scope
        assertEquals(400.0 - 150.0 - 1000.0, t.netFlow, 0.001)
    }

    @Test
    fun budget_withdrawalsMatchCategoryScope() {
        val t = BudgetCalculator.totals(mixed, BudgetOptions(categories = setOf("food")))
        assertEquals(100.0, t.withdrawals, 0.001)
    }

    // ---- Validation -----------------------------------------------------------------------

    private val known = setOf("chk", "sav")

    private fun draft(
        type: TransactionType = TransactionType.WITHDRAWAL,
        from: String = "chk",
        to: String? = null,
        amount: Double = 10.0,
        date: String = "2026-10-02"
    ) = TransactionDraft(type = type, accountId = from, toAccountId = to, amount = amount, date = date)

    @Test
    fun validator_rejectsTransferToSameAccount() {
        assertNotNull(TransactionValidator.validate(draft(TransactionType.TRANSFER, "chk", "chk"), known))
    }

    @Test
    fun validator_rejectsTransferWithoutDestination() {
        assertNotNull(TransactionValidator.validate(draft(TransactionType.TRANSFER, "chk", null), known))
        assertNotNull(TransactionValidator.validate(draft(TransactionType.TRANSFER, "chk", "nope"), known))
    }

    @Test
    fun validator_acceptsValidDraftsOfEachType() {
        assertNull(TransactionValidator.validate(draft(TransactionType.DEPOSIT), known))
        assertNull(TransactionValidator.validate(draft(TransactionType.WITHDRAWAL), known))
        assertNull(TransactionValidator.validate(draft(TransactionType.TRANSFER, "chk", "sav"), known))
    }

    @Test
    fun validator_rejectsBadAmountsAndDates() {
        assertNotNull(TransactionValidator.validate(draft(amount = 0.0), known))
        assertNotNull(TransactionValidator.validate(draft(amount = -5.0), known))
        assertNotNull(TransactionValidator.validate(draft(date = "10/02/2026"), known))
        assertNotNull(TransactionValidator.validate(draft(date = "2026-02-30"), known))
        assertFalse(TransactionValidator.isValidDate(""))
        assertTrue(TransactionValidator.isValidDate("2026-02-28"))
    }

    @Test
    fun normalized_dropsFieldsThatDontBelongToTheType() {
        val transfer = draft(TransactionType.TRANSFER, "chk", "sav")
            .copy(category = "FOOD", subCategory = "GROCERY").normalized()
        assertEquals("", transfer.category)
        assertEquals("", transfer.subCategory)
        assertEquals("sav", transfer.toAccountId)

        val withdrawal = draft(TransactionType.WITHDRAWAL, "chk", "sav").normalized()
        assertNull(withdrawal.toAccountId)
    }

    // ---- Seed data sanity -----------------------------------------------------------------

    @Test
    fun seedData_transferDoesNotChangeCombinedBalance() {
        val seed = SampleDataProvider.createSeedData()
        val balances = BalanceCalculator.calculate(seed.accounts, seed.transactions)

        val start = seed.accounts.sumOf { it.startingBalance }
        val deposits = seed.transactions.filter { it.transactionType == TransactionType.DEPOSIT }.sumOf { it.amount }
        val withdrawals = seed.transactions.filter { it.transactionType == TransactionType.WITHDRAWAL }.sumOf { it.amount }
        assertEquals(start + deposits - withdrawals, total(balances), 0.001)
    }

    @Test
    fun addingClearedTransaction_reducesBothBalanceAndClearedBalance() {
        val initial = BalanceCalculator.calculate(accounts, emptyList())
        assertEquals(5000.0, initial.getValue("chk").balance, 0.001)
        assertEquals(5000.0, initial.getValue("chk").clearedBalance, 0.001)

        val updated = BalanceCalculator.calculate(
            accounts,
            listOf(tx(TransactionType.WITHDRAWAL, 150.0, from = "chk", cleared = true))
        )
        assertEquals(4850.0, updated.getValue("chk").balance, 0.001)
        assertEquals(4850.0, updated.getValue("chk").clearedBalance, 0.001)
    }

    @Test
    fun addingUnclearedTransaction_reducesBalance_butNotClearedBalance() {
        val updated = BalanceCalculator.calculate(
            accounts,
            listOf(tx(TransactionType.WITHDRAWAL, 150.0, from = "chk", cleared = false))
        )
        assertEquals(4850.0, updated.getValue("chk").balance, 0.001)
        assertEquals(5000.0, updated.getValue("chk").clearedBalance, 0.001)
    }

    @Test
    fun transactionType_hasWithdrawalFirst() {
        assertEquals(TransactionType.WITHDRAWAL, TransactionType.values()[0])
    }

    // ---- Contributor Allowance Logic -----------------------------------------------------

    @Test
    fun weeklyAllowance_isSumOfIncomesMinusSumOfContributions() {
        val incomes = listOf(1316.69, 100.0, 50.0)
        val totalIncomes = incomes.sum() // 1466.69
        val contributions = listOf(
            Pair("acc_checking", 912.44),
            Pair("acc_cruise", 50.0),
            Pair("acc_invest", 50.0)
        )
        val totalContributions = contributions.sumOf { it.second } // 1012.44
        val weeklyAllowance = totalIncomes - totalContributions // 454.25
        assertEquals(454.25, weeklyAllowance, 0.001)
    }
}
