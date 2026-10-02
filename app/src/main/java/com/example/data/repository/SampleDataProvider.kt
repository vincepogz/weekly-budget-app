package com.example.data.repository

import com.example.data.model.*
import java.util.UUID

object SampleDataProvider {
    fun createSeedData(): SeedData {
        val accountJointChecking = AccountEntity(
            id = "acc_joint_checking",
            name = "Joint Checking",
            type = AccountType.CHECKING.name,
            startingBalance = 2450.00,
            currentBalance = 2450.00,
            targetAmount = 5000.00,
            colorHex = "#006C4C"
        )
        val accountAllowances = AccountEntity(
            id = "acc_allowances",
            name = "Allowances",
            type = AccountType.ALLOWANCE.name,
            startingBalance = 850.00,
            currentBalance = 850.00,
            targetAmount = 1000.00,
            colorHex = "#2B6CB0"
        )
        val accountSavings = AccountEntity(
            id = "acc_savings",
            name = "Joint Savings",
            type = AccountType.SAVINGS.name,
            startingBalance = 12500.00,
            currentBalance = 12500.00,
            targetAmount = 20000.00,
            colorHex = "#2C7A7B"
        )
        val accountCruise = AccountEntity(
            id = "acc_cruise",
            name = "Cruise Sinking Fund",
            type = AccountType.GOAL.name,
            startingBalance = 1800.00,
            currentBalance = 1800.00,
            targetAmount = 3500.00,
            colorHex = "#D69E2E"
        )
        val accountInvest = AccountEntity(
            id = "acc_invest",
            name = "Investments",
            type = AccountType.INVESTMENT.name,
            startingBalance = 15400.00,
            currentBalance = 15400.00,
            targetAmount = 25000.00,
            colorHex = "#6B46C1"
        )
        val accountCarHsbc = AccountEntity(
            id = "acc_car_hsbc",
            name = "Car (HSBC Sav)",
            type = AccountType.SAVINGS.name,
            startingBalance = 3200.00,
            currentBalance = 3200.00,
            targetAmount = 5000.00,
            colorHex = "#C53030"
        )
        val accountBaonCapital = AccountEntity(
            id = "acc_baon_capital",
            name = "Baon (Capital Sav)",
            type = AccountType.SAVINGS.name,
            startingBalance = 900.00,
            currentBalance = 900.00,
            targetAmount = 1500.00,
            colorHex = "#4A5568"
        )

        val accounts = listOf(
            accountJointChecking,
            accountAllowances,
            accountSavings,
            accountCruise,
            accountInvest,
            accountCarHsbc,
            accountBaonCapital
        )

        // 1. Current Active Period: "NEW YEAR" (5 Weeks: 12/29/25 - 1/4/26)
        val p1Id = "period_new_year_2026"
        val period1 = BudgetPeriodEntity(
            id = p1Id,
            name = "NEW YEAR (5 Wks)",
            numberOfWeeks = 5,
            currentWeek = 40,
            startDate = "2025-12-29",
            endDate = "2026-01-04",
            note = "Reference Weekly Budget with Joint Checking, Cruise, and Invest allocations",
            isCurrent = true
        )

        val c1Vince = ContributorEntity(
            id = "contrib_p1_vince",
            budgetPeriodId = p1Id,
            name = "VINCE",
            income1 = 1316.69,
            income2 = 0.0,
            income3 = 0.0,
            weeklyAllowance = 733.69
        )
        val c1Jenn = ContributorEntity(
            id = "contrib_p1_jenn",
            budgetPeriodId = p1Id,
            name = "JENN",
            income1 = 0.0,
            income2 = 0.0,
            income3 = 0.0,
            weeklyAllowance = 0.0
        )
        val c1Others = ContributorEntity(
            id = "contrib_p1_others",
            budgetPeriodId = p1Id,
            name = "OTHERS",
            income1 = 88.62,
            income2 = 0.0,
            income3 = 0.0,
            weeklyAllowance = 0.0
        )
        val contributors1 = listOf(c1Vince, c1Jenn, c1Others)

        val alloc1VinceJoint = ContributionAllocationEntity(
            id = UUID.randomUUID().toString(),
            budgetPeriodId = p1Id,
            contributorId = c1Vince.id,
            accountId = accountJointChecking.id,
            amount = 583.00,
            percentage = 44.0
        )
        val alloc1OthersJoint = ContributionAllocationEntity(
            id = UUID.randomUUID().toString(),
            budgetPeriodId = p1Id,
            contributorId = c1Others.id,
            accountId = accountJointChecking.id,
            amount = 88.62,
            percentage = 100.0
        )
        val allocations1 = listOf(alloc1VinceJoint, alloc1OthersJoint)

        val items1 = listOf(
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "HOUSE", subCategory = "RENT", weeklyAmount = 438.46, monthlyAmount = 1900.00, yearlyAmount = 22800.00, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "HOUSE", subCategory = "UTILITIES", weeklyAmount = 34.62, monthlyAmount = 150.00, yearlyAmount = 1800.00, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "HOUSE", subCategory = "MAINTENANCE", weeklyAmount = 0.0, monthlyAmount = 0.0, yearlyAmount = 0.0, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "LIVING EXPENSE", subCategory = "LAUNDRY", weeklyAmount = 0.0, monthlyAmount = 0.0, yearlyAmount = 0.0, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "LIVING EXPENSE", subCategory = "GETAWAY", weeklyAmount = 0.0, monthlyAmount = 0.0, yearlyAmount = 0.0, targetAccountId = accountCruise.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "FOOD", subCategory = "GROCERY", weeklyAmount = 57.69, monthlyAmount = 250.00, yearlyAmount = 3000.00, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "FOOD", subCategory = "EATING OUT", weeklyAmount = 34.62, monthlyAmount = 150.00, yearlyAmount = 1800.00, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "TRANSPORTATION", subCategory = "CAR", weeklyAmount = 11.54, monthlyAmount = 50.00, yearlyAmount = 600.00, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "TRANSPORTATION", subCategory = "CAR REPAIR", weeklyAmount = 0.0, monthlyAmount = 0.0, yearlyAmount = 0.0, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "TRANSPORTATION", subCategory = "MTA/UBER", weeklyAmount = 0.0, monthlyAmount = 0.0, yearlyAmount = 0.0, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "BILLS", subCategory = "INSURANCE", weeklyAmount = 50.00, monthlyAmount = 216.67, yearlyAmount = 2600.00, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "BILLS", subCategory = "PHONE", weeklyAmount = 22.38, monthlyAmount = 97.00, yearlyAmount = 1164.01, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "BILLS", subCategory = "INTERNET", weeklyAmount = 15.00, monthlyAmount = 64.98, yearlyAmount = 779.76, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "BILLS", subCategory = "LOAN", weeklyAmount = 0.0, monthlyAmount = 0.0, yearlyAmount = 0.0, targetAccountId = accountJointChecking.id),
            BudgetItemEntity(id = UUID.randomUUID().toString(), budgetPeriodId = p1Id, category = "SUBSCRIPTIONS", subCategory = "SUBSCRIPTIONS", weeklyAmount = 8.08, monthlyAmount = 35.00, yearlyAmount = 420.00, targetAccountId = accountJointChecking.id)
        )

        // 2. Period: "NO AMEX" (22 Weeks)
        val p2Id = "period_no_amex_2023"
        val period2 = BudgetPeriodEntity(
            id = p2Id,
            name = "NO AMEX (22 Wks)",
            numberOfWeeks = 22,
            currentWeek = 40,
            startDate = "2023-01-02",
            endDate = "2023-06-05",
            note = "Long cycle without Amex card, multi-earner Vince & Jenn",
            isCurrent = false
        )
        val c2Vince = ContributorEntity(id = "contrib_p2_vince", budgetPeriodId = p2Id, name = "VINCE", income1 = 250.00, weeklyAllowance = 0.0)
        val c2Jenn = ContributorEntity(id = "contrib_p2_jenn", budgetPeriodId = p2Id, name = "JENN", income1 = 400.00, weeklyAllowance = 140.0)
        val c2Others = ContributorEntity(id = "contrib_p2_others", budgetPeriodId = p2Id, name = "OTHERS", income1 = 196.15, weeklyAllowance = 0.0)
        val contributors2 = listOf(c2Vince, c2Jenn, c2Others)

        // 3. Period: "JENN BROKE" (15 Weeks)
        val p3Id = "period_jenn_broke_2020"
        val period3 = BudgetPeriodEntity(
            id = p3Id,
            name = "JENN BROKE (15 Wks)",
            numberOfWeeks = 15,
            currentWeek = 40,
            startDate = "2020-09-14",
            endDate = "2020-12-27",
            note = "*Vince contribute $65.00 HSBC + $315 CC. Baon & Car buckets",
            isCurrent = false
        )
        val c3Vince = ContributorEntity(id = "contrib_p3_vince", budgetPeriodId = p3Id, name = "VINCE", income1 = 315.00, income2 = 326.38, weeklyAllowance = 51.38)
        val c3Jenn = ContributorEntity(id = "contrib_p3_jenn", budgetPeriodId = p3Id, name = "JENN", income1 = 209.35, income2 = 240.00, weeklyAllowance = 34.35)
        val contributors3 = listOf(c3Vince, c3Jenn)

        // 4. Period: "SCHOOL 2019" (14 Weeks)
        val p4Id = "period_school_2019"
        val period4 = BudgetPeriodEntity(
            id = p4Id,
            name = "SCHOOL (14 Wks)",
            numberOfWeeks = 14,
            currentWeek = 40,
            startDate = "2026-09-28",
            endDate = "2026-10-04",
            note = "Semester student budget",
            isCurrent = false
        )
        val c4Vince = ContributorEntity(id = "contrib_p4_vince", budgetPeriodId = p4Id, name = "VINCE", income1 = 640.00, weeklyAllowance = 90.0)
        val c4Jenn = ContributorEntity(id = "contrib_p4_jenn", budgetPeriodId = p4Id, name = "JENN", income1 = 150.00, weeklyAllowance = 90.0)
        val contributors4 = listOf(c4Vince, c4Jenn)

        val periods = listOf(period1, period2, period3, period4)
        val allContributors = contributors1 + contributors2 + contributors3 + contributors4

        // Real transactions for period 1
        val transactions = listOf(
            TransactionEntity(
                id = UUID.randomUUID().toString(),
                budgetPeriodId = p1Id,
                accountId = accountJointChecking.id,
                contributorId = c1Vince.id,
                category = "HOUSE",
                subCategory = "RENT",
                amount = 438.46,
                type = TransactionType.WITHDRAWAL.name,
                date = "2026-10-01",
                note = "Weekly rent share (Monthly $1,900)",
                payee = "Landlord",
                cleared = true
            ),
            TransactionEntity(
                id = UUID.randomUUID().toString(),
                budgetPeriodId = p1Id,
                accountId = accountJointChecking.id,
                contributorId = c1Vince.id,
                category = "FOOD",
                subCategory = "GROCERY",
                amount = 62.50,
                type = TransactionType.WITHDRAWAL.name,
                date = "2026-10-02",
                note = "Trader Joe's groceries",
                payee = "Trader Joe's"
            ),
            TransactionEntity(
                id = UUID.randomUUID().toString(),
                budgetPeriodId = p1Id,
                accountId = accountJointChecking.id,
                contributorId = c1Vince.id,
                category = "FOOD",
                subCategory = "EATING OUT",
                amount = 28.75,
                type = TransactionType.WITHDRAWAL.name,
                date = "2026-10-02",
                note = "Dinner ramen",
                payee = "Ippudo"
            ),
            TransactionEntity(
                id = UUID.randomUUID().toString(),
                budgetPeriodId = p1Id,
                accountId = accountJointChecking.id,
                contributorId = c1Vince.id,
                category = "INCOME",
                subCategory = "PAYCHECK",
                amount = 583.00,
                type = TransactionType.DEPOSIT.name,
                date = "2026-10-02",
                note = "Vince Weekly Joint Checking Contribution (44%)",
                payee = "Employer Direct Deposit",
                cleared = true
            ),
            TransactionEntity(
                id = UUID.randomUUID().toString(),
                budgetPeriodId = p1Id,
                accountId = accountJointChecking.id,
                contributorId = c1Others.id,
                category = "INCOME",
                subCategory = "CONTRIBUTION",
                amount = 88.62,
                type = TransactionType.DEPOSIT.name,
                date = "2026-10-02",
                note = "Others weekly joint contribution (100%)",
                payee = "Others",
                cleared = true
            ),
            TransactionEntity(
                id = UUID.randomUUID().toString(),
                budgetPeriodId = p1Id,
                accountId = accountJointChecking.id,
                toAccountId = accountCruise.id,
                category = "TRANSFER",
                subCategory = "SAVINGS",
                amount = 50.00,
                type = TransactionType.TRANSFER.name,
                date = "2026-10-02",
                note = "Transfer to Cruise Sinking Fund",
                cleared = true
            )
        )

        // Recurring transactions
        val recurring = listOf(
            RecurringTransactionEntity(
                id = UUID.randomUUID().toString(),
                title = "Apartment Rent",
                amount = 438.46,
                type = TransactionType.WITHDRAWAL.name,
                accountId = accountJointChecking.id,
                category = "HOUSE",
                subCategory = "RENT",
                frequency = "WEEKLY",
                nextDueDate = "2026-10-09"
            ),
            RecurringTransactionEntity(
                id = UUID.randomUUID().toString(),
                title = "Internet Bill",
                amount = 15.00,
                type = TransactionType.WITHDRAWAL.name,
                accountId = accountJointChecking.id,
                category = "BILLS",
                subCategory = "INTERNET",
                frequency = "WEEKLY",
                nextDueDate = "2026-10-07"
            ),
            RecurringTransactionEntity(
                id = UUID.randomUUID().toString(),
                title = "Phone Service",
                amount = 22.38,
                type = TransactionType.WITHDRAWAL.name,
                accountId = accountJointChecking.id,
                category = "BILLS",
                subCategory = "PHONE",
                frequency = "WEEKLY",
                nextDueDate = "2026-10-15"
            ),
            RecurringTransactionEntity(
                id = UUID.randomUUID().toString(),
                title = "Vince Paycheck Deposit",
                amount = 1316.69,
                type = TransactionType.DEPOSIT.name,
                accountId = accountJointChecking.id,
                category = "INCOME",
                subCategory = "SALARY",
                frequency = "WEEKLY",
                nextDueDate = "2026-10-09"
            )
        )

        // Weekly Income Generator table
        val incomeCalculations = listOf(
            IncomeCalculationEntity(
                id = UUID.randomUUID().toString(),
                contributorName = "VINCE",
                source = "SUMMER INTERNSHIP",
                hourlyRate = 45.00,
                hoursPerWeek = 40.0,
                numberOfWeeks = 52,
                weeklyGross = 1800.00,
                yearlyGross = 93600.00,
                weeklyTax = 425.77,
                investment = 0.0,
                weeklyNet = 1374.23,
                reported = 93600.00
            ),
            IncomeCalculationEntity(
                id = UUID.randomUUID().toString(),
                contributorName = "JENELYN",
                source = "PRIMARY WORK",
                hourlyRate = 25.00,
                hoursPerWeek = 35.0,
                numberOfWeeks = 52,
                weeklyGross = 875.00,
                yearlyGross = 45500.00,
                weeklyTax = 180.00,
                investment = 50.0,
                weeklyNet = 645.00,
                reported = 45500.00
            )
        )

        val incomeSources = listOf(
            IncomeSourceEntity(id = "inc_p1_vince_1", contributorId = c1Vince.id, budgetPeriodId = p1Id, label = "Primary Paycheck", weeklyAmount = 1316.69),
            IncomeSourceEntity(id = "inc_p1_others_1", contributorId = c1Others.id, budgetPeriodId = p1Id, label = "Side Income", weeklyAmount = 88.62),
            IncomeSourceEntity(id = "inc_p2_vince_1", contributorId = c2Vince.id, budgetPeriodId = p2Id, label = "Salary", weeklyAmount = 250.00),
            IncomeSourceEntity(id = "inc_p2_jenn_1", contributorId = c2Jenn.id, budgetPeriodId = p2Id, label = "Salary", weeklyAmount = 400.00),
            IncomeSourceEntity(id = "inc_p2_others_1", contributorId = c2Others.id, budgetPeriodId = p2Id, label = "Allowance", weeklyAmount = 196.15),
            IncomeSourceEntity(id = "inc_p3_vince_1", contributorId = c3Vince.id, budgetPeriodId = p3Id, label = "Job 1", weeklyAmount = 315.00),
            IncomeSourceEntity(id = "inc_p3_vince_2", contributorId = c3Vince.id, budgetPeriodId = p3Id, label = "Job 2", weeklyAmount = 326.38),
            IncomeSourceEntity(id = "inc_p3_jenn_1", contributorId = c3Jenn.id, budgetPeriodId = p3Id, label = "Job 1", weeklyAmount = 209.35),
            IncomeSourceEntity(id = "inc_p3_jenn_2", contributorId = c3Jenn.id, budgetPeriodId = p3Id, label = "Job 2", weeklyAmount = 240.00),
            IncomeSourceEntity(id = "inc_p4_vince_1", contributorId = c4Vince.id, budgetPeriodId = p4Id, label = "Stipend", weeklyAmount = 640.00),
            IncomeSourceEntity(id = "inc_p4_jenn_1", contributorId = c4Jenn.id, budgetPeriodId = p4Id, label = "Work Study", weeklyAmount = 150.00)
        )

        return SeedData(
            periods = periods,
            contributors = allContributors,
            incomeSources = incomeSources,
            accounts = accounts,
            allocations = allocations1,
            budgetItems = items1,
            transactions = transactions,
            recurringTransactions = recurring,
            incomeCalculations = incomeCalculations
        )
    }
}

data class SeedData(
    val periods: List<BudgetPeriodEntity>,
    val contributors: List<ContributorEntity>,
    val incomeSources: List<IncomeSourceEntity>,
    val accounts: List<AccountEntity>,
    val allocations: List<ContributionAllocationEntity>,
    val budgetItems: List<BudgetItemEntity>,
    val transactions: List<TransactionEntity>,
    val recurringTransactions: List<RecurringTransactionEntity>,
    val incomeCalculations: List<IncomeCalculationEntity>
)
