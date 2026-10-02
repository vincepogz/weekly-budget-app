package com.example

import com.example.data.model.*
import com.example.data.repository.SampleDataProvider
import com.example.data.sync.GoogleSheetsService
import com.example.data.sync.PortableBackupManager
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.roundToInt

class ExampleUnitTest {

    @Test
    fun test_52WeekBudgetFormula_rentAndUtilities() {
        // Formula: Weekly = (Monthly * 12) / 52
        val monthlyRent = 1900.00
        val yearlyRent = monthlyRent * 12.0
        val weeklyRent = yearlyRent / 52.0
        assertEquals(22800.00, yearlyRent, 0.01)
        assertEquals(438.46, (weeklyRent * 100.0).roundToInt() / 100.0, 0.01)

        val monthlyUtilities = 150.00
        val yearlyUtilities = monthlyUtilities * 12.0
        val weeklyUtilities = yearlyUtilities / 52.0
        assertEquals(1800.00, yearlyUtilities, 0.01)
        assertEquals(34.62, (weeklyUtilities * 100.0).roundToInt() / 100.0, 0.01)

        val monthlyInsurance = 216.67
        val yearlyInsurance = 2600.00
        val weeklyInsurance = yearlyInsurance / 52.0
        assertEquals(50.00, (weeklyInsurance * 100.0).roundToInt() / 100.0, 0.01)
    }

    @Test
    fun test_contributorAllowanceCalculation() {
        // Rule: Weekly Allowance = Total Income - Shared Contributions
        val vinceIncome = 1316.69
        val vinceSharedContribution = 583.00
        val expectedAllowance = vinceIncome - vinceSharedContribution
        assertEquals(733.69, (expectedAllowance * 100.0).roundToInt() / 100.0, 0.01)
    }

    @Test
    fun test_periodMultiplierTotalExpense() {
        // 5 Weeks Cycle Multiplier
        val weeklyExpense = 672.38
        val numberOfWeeks = 5
        val budgetExpense = weeklyExpense * numberOfWeeks
        assertEquals(3361.90, (budgetExpense * 100.0).roundToInt() / 100.0, 0.01)

        // 22 Weeks Cycle Multiplier ("NO AMEX")
        val noAmexWeekly = 710.08
        val noAmexWeeks = 22
        val noAmexTotal = noAmexWeekly * noAmexWeeks
        assertEquals(15621.76, (noAmexTotal * 100.0).roundToInt() / 100.0, 0.20)
    }

    @Test
    fun test_incomeGeneratorNetTakeHome() {
        val hourlyRate = 45.00
        val hoursPerWeek = 40.0
        val weeks = 52
        val taxWeekly = 425.77
        val investWeekly = 0.0

        val weeklyGross = hourlyRate * hoursPerWeek
        val yearlyGross = weeklyGross * weeks
        val weeklyNet = weeklyGross - taxWeekly - investWeekly

        assertEquals(1800.00, weeklyGross, 0.01)
        assertEquals(93600.00, yearlyGross, 0.01)
        assertEquals(1374.23, (weeklyNet * 100.0).roundToInt() / 100.0, 0.01)
    }
}
