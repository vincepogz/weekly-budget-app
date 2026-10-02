package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.data.repository.SampleDataProvider
import com.example.data.sync.FullBudgetData
import com.example.data.sync.PortableBackupManager
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

    @Test
    fun `read string from context`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val appName = context.getString(R.string.app_name)
        assertEquals("Weekly Budget", appName)
    }

    @Test
    fun `test portable backup serialization and roundtrip`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val backupManager = PortableBackupManager(context)
        val seed = SampleDataProvider.createSeedData()
        val data = FullBudgetData(
            periods = seed.periods,
            contributors = seed.contributors,
            accounts = seed.accounts,
            allocations = seed.allocations,
            budgetItems = seed.budgetItems,
            transactions = seed.transactions,
            recurringTransactions = seed.recurringTransactions,
            incomeCalculations = seed.incomeCalculations
        )

        val jsonString = backupManager.createJsonBackup(data)
        assertTrue(jsonString.contains("format_version"))

        val previewResult = backupManager.parsePreview(jsonString)
        assertTrue(previewResult.isSuccess)
        val preview = previewResult.getOrThrow()
        assertEquals(1, preview.formatVersion)
        assertEquals(4, preview.periodCount)
        assertEquals(7, preview.accountCount)

        val fullResult = backupManager.parseFullData(jsonString)
        assertTrue(fullResult.isSuccess)
        val restored = fullResult.getOrThrow()
        assertEquals(data.periods.size, restored.periods.size)
        assertEquals(data.accounts.size, restored.accounts.size)
        assertEquals(data.budgetItems.size, restored.budgetItems.size)
    }
}
