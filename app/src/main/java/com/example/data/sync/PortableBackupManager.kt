package com.example.data.sync

import android.content.Context
import com.example.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.text.SimpleDateFormat
import java.util.*
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

enum class ImportConflictMode {
    REPLACE,
    MERGE,
    IMPORT_AS_NEW
}

data class ExportPackagePreview(
    val formatVersion: Int,
    val schemaVersion: Int,
    val appVersion: String,
    val exportTimestamp: String,
    val periodCount: Int,
    val contributorCount: Int,
    val accountCount: Int,
    val budgetItemCount: Int,
    val transactionCount: Int,
    val recurringCount: Int,
    val incomeCalcCount: Int
)

data class FullBudgetData(
    val periods: List<BudgetPeriodEntity>,
    val contributors: List<ContributorEntity>,
    val incomeSources: List<IncomeSourceEntity> = emptyList(),
    val accounts: List<AccountEntity>,
    val allocations: List<ContributionAllocationEntity>,
    val budgetItems: List<BudgetItemEntity>,
    val transactions: List<TransactionEntity>,
    val recurringTransactions: List<RecurringTransactionEntity>,
    val incomeCalculations: List<IncomeCalculationEntity>
)

class PortableBackupManager(private val context: Context) {

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    /**
     * Creates a portable JSON backup string containing the manifest and all entities.
     */
    fun createJsonBackup(data: FullBudgetData): String {
        val root = JSONObject()

        val manifest = JSONObject().apply {
            put("format_version", 1)
            put("schema_version", 2)
            put("app_version", "1.0.0")
            put("export_timestamp", dateFormat.format(Date()))
            put("period_count", data.periods.size)
            put("contributor_count", data.contributors.size)
            put("account_count", data.accounts.size)
            put("budget_item_count", data.budgetItems.size)
            put("transaction_count", data.transactions.size)
            put("recurring_count", data.recurringTransactions.size)
            put("income_calc_count", data.incomeCalculations.size)
        }
        root.put("manifest", manifest)

        // Periods
        val periodsArray = JSONArray()
        data.periods.forEach { p ->
            periodsArray.put(JSONObject().apply {
                put("id", p.id)
                put("name", p.name)
                put("numberOfWeeks", p.numberOfWeeks)
                put("currentWeek", p.currentWeek)
                put("startDate", p.startDate)
                put("endDate", p.endDate)
                put("note", p.note)
                put("isCurrent", p.isCurrent)
            })
        }
        root.put("periods", periodsArray)

        // Contributors
        val contribArray = JSONArray()
        data.contributors.forEach { c ->
            contribArray.put(JSONObject().apply {
                put("id", c.id)
                put("budgetPeriodId", c.budgetPeriodId)
                put("name", c.name)
                put("income1", c.income1)
                put("income2", c.income2)
                put("income3", c.income3)
                put("weeklyAllowance", c.weeklyAllowance)
            })
        }
        root.put("contributors", contribArray)

        // Income Sources
        val incomeSourcesArray = JSONArray()
        data.incomeSources.forEach { inc ->
            incomeSourcesArray.put(JSONObject().apply {
                put("id", inc.id)
                put("contributorId", inc.contributorId)
                put("budgetPeriodId", inc.budgetPeriodId)
                put("label", inc.label)
                put("weeklyAmount", inc.weeklyAmount)
            })
        }
        root.put("income_sources", incomeSourcesArray)

        // Accounts
        val accountsArray = JSONArray()
        data.accounts.forEach { a ->
            accountsArray.put(JSONObject().apply {
                put("id", a.id)
                put("name", a.name)
                put("type", a.type)
                put("startingBalance", a.startingBalance)
                put("currentBalance", a.currentBalance)
                put("targetAmount", a.targetAmount)
                put("colorHex", a.colorHex)
            })
        }
        root.put("accounts", accountsArray)

        // Allocations
        val allocArray = JSONArray()
        data.allocations.forEach { al ->
            allocArray.put(JSONObject().apply {
                put("id", al.id)
                put("budgetPeriodId", al.budgetPeriodId)
                put("contributorId", al.contributorId)
                put("accountId", al.accountId)
                put("amount", al.amount)
                put("percentage", al.percentage)
            })
        }
        root.put("allocations", allocArray)

        // Budget Items
        val itemsArray = JSONArray()
        data.budgetItems.forEach { b ->
            itemsArray.put(JSONObject().apply {
                put("id", b.id)
                put("budgetPeriodId", b.budgetPeriodId)
                put("category", b.category)
                put("subCategory", b.subCategory)
                put("weeklyAmount", b.weeklyAmount)
                put("monthlyAmount", b.monthlyAmount)
                put("yearlyAmount", b.yearlyAmount)
                put("targetAccountId", b.targetAccountId)
            })
        }
        root.put("budget_items", itemsArray)

        // Transactions
        val transArray = JSONArray()
        data.transactions.forEach { t ->
            transArray.put(JSONObject().apply {
                put("id", t.id)
                put("budgetPeriodId", t.budgetPeriodId)
                put("accountId", t.accountId)
                put("toAccountId", t.toAccountId)
                put("contributorId", t.contributorId)
                put("category", t.category)
                put("subCategory", t.subCategory)
                put("amount", t.amount)
                put("type", t.type)
                put("date", t.date)
                put("note", t.note)
                put("payee", t.payee)
                put("tag", t.tag)
                put("isRecurring", t.isRecurring)
                put("cleared", t.cleared)
                put("createdAt", t.createdAt)
            })
        }
        root.put("transactions", transArray)

        // Recurring Transactions
        val recArray = JSONArray()
        data.recurringTransactions.forEach { r ->
            recArray.put(JSONObject().apply {
                put("id", r.id)
                put("title", r.title)
                put("amount", r.amount)
                put("type", r.type)
                put("accountId", r.accountId)
                put("category", r.category)
                put("subCategory", r.subCategory)
                put("frequency", r.frequency)
                put("nextDueDate", r.nextDueDate)
                put("active", r.active)
            })
        }
        root.put("recurring_transactions", recArray)

        // Income Calculations
        val incomeArray = JSONArray()
        data.incomeCalculations.forEach { ic ->
            incomeArray.put(JSONObject().apply {
                put("id", ic.id)
                put("contributorName", ic.contributorName)
                put("source", ic.source)
                put("hourlyRate", ic.hourlyRate)
                put("hoursPerWeek", ic.hoursPerWeek)
                put("numberOfWeeks", ic.numberOfWeeks)
                put("weeklyGross", ic.weeklyGross)
                put("yearlyGross", ic.yearlyGross)
                put("weeklyTax", ic.weeklyTax)
                put("investment", ic.investment)
                put("weeklyNet", ic.weeklyNet)
                put("reported", ic.reported)
            })
        }
        root.put("income_calculations", incomeArray)

        return root.toString(2)
    }

    /**
     * Generates a zip archive file (budget-app-export.zip) containing separated files
     * plus manifest.json as specified in requirement 6.
     */
    suspend fun createZipExport(data: FullBudgetData, targetFile: File): Result<File> = withContext(Dispatchers.IO) {
        try {
            FileOutputStream(targetFile).use { fos ->
                ZipOutputStream(BufferedOutputStream(fos)).use { zos ->
                    // 1. manifest.json
                    val manifest = JSONObject().apply {
                        put("format_version", 1)
                        put("schema_version", 2)
                        put("app_version", "1.0.0")
                        put("export_timestamp", dateFormat.format(Date()))
                        put("dataset_id", UUID.randomUUID().toString())
                        put("periods_count", data.periods.size)
                        put("transactions_count", data.transactions.size)
                    }
                    writeZipEntry(zos, "manifest.json", manifest.toString(2))

                    // 2. data files
                    val jsonString = createJsonBackup(data)
                    writeZipEntry(zos, "budget-package.json", jsonString)

                    // 3. metadata
                    writeZipEntry(zos, "metadata/README.txt", "Weekly Budget Portable Package - Valid for cross-device restoration.")
                }
            }
            Result.success(targetFile)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun writeZipEntry(zos: ZipOutputStream, entryName: String, content: String) {
        val entry = ZipEntry(entryName)
        zos.putNextEntry(entry)
        zos.write(content.toByteArray(Charsets.UTF_8))
        zos.closeEntry()
    }

    /**
     * Inspects a JSON or ZIP backup and produces a preview without committing changes.
     */
    fun parsePreview(jsonContent: String): Result<ExportPackagePreview> {
        return try {
            val root = JSONObject(jsonContent)
            val manifest = root.optJSONObject("manifest") ?: JSONObject()
            val preview = ExportPackagePreview(
                formatVersion = manifest.optInt("format_version", 1),
                schemaVersion = manifest.optInt("schema_version", 1),
                appVersion = manifest.optString("app_version", "1.0"),
                exportTimestamp = manifest.optString("export_timestamp", "Unknown"),
                periodCount = root.optJSONArray("periods")?.length() ?: 0,
                contributorCount = root.optJSONArray("contributors")?.length() ?: 0,
                accountCount = root.optJSONArray("accounts")?.length() ?: 0,
                budgetItemCount = root.optJSONArray("budget_items")?.length() ?: 0,
                transactionCount = root.optJSONArray("transactions")?.length() ?: 0,
                recurringCount = root.optJSONArray("recurring_transactions")?.length() ?: 0,
                incomeCalcCount = root.optJSONArray("income_calculations")?.length() ?: 0
            )
            Result.success(preview)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Parses the full data from a JSON backup.
     */
    fun parseFullData(jsonContent: String): Result<FullBudgetData> {
        return try {
            val root = JSONObject(jsonContent)

            val periods = mutableListOf<BudgetPeriodEntity>()
            root.optJSONArray("periods")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    periods.add(
                        BudgetPeriodEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            name = o.optString("name", "Imported Budget"),
                            numberOfWeeks = o.optInt("numberOfWeeks", 1),
                            currentWeek = o.optInt("currentWeek", 1),
                            startDate = o.optString("startDate", ""),
                            endDate = o.optString("endDate", ""),
                            note = o.optString("note", ""),
                            isCurrent = o.optBoolean("isCurrent", false)
                        )
                    )
                }
            }

            val contributors = mutableListOf<ContributorEntity>()
            root.optJSONArray("contributors")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    contributors.add(
                        ContributorEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            budgetPeriodId = o.optString("budgetPeriodId", ""),
                            name = o.optString("name", "Contributor"),
                            income1 = o.optDouble("income1", 0.0),
                            income2 = o.optDouble("income2", 0.0),
                            income3 = o.optDouble("income3", 0.0),
                            weeklyAllowance = o.optDouble("weeklyAllowance", 0.0)
                        )
                    )
                }
            }

            val incomeSources = mutableListOf<IncomeSourceEntity>()
            root.optJSONArray("income_sources")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    incomeSources.add(
                        IncomeSourceEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            contributorId = o.optString("contributorId", ""),
                            budgetPeriodId = o.optString("budgetPeriodId", ""),
                            label = o.optString("label", "Income"),
                            weeklyAmount = o.optDouble("weeklyAmount", 0.0)
                        )
                    )
                }
            }

            val accounts = mutableListOf<AccountEntity>()
            root.optJSONArray("accounts")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    accounts.add(
                        AccountEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            name = o.optString("name", "Account"),
                            type = o.optString("type", AccountType.CHECKING.name),
                            startingBalance = o.optDouble("startingBalance", 0.0),
                            currentBalance = o.optDouble("currentBalance", 0.0),
                            targetAmount = o.optDouble("targetAmount", 0.0),
                            colorHex = o.optString("colorHex", "#006C4C")
                        )
                    )
                }
            }

            val allocations = mutableListOf<ContributionAllocationEntity>()
            root.optJSONArray("allocations")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    allocations.add(
                        ContributionAllocationEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            budgetPeriodId = o.optString("budgetPeriodId", ""),
                            contributorId = o.optString("contributorId", ""),
                            accountId = o.optString("accountId", ""),
                            amount = o.optDouble("amount", 0.0),
                            percentage = o.optDouble("percentage", 0.0)
                        )
                    )
                }
            }

            val items = mutableListOf<BudgetItemEntity>()
            root.optJSONArray("budget_items")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    items.add(
                        BudgetItemEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            budgetPeriodId = o.optString("budgetPeriodId", ""),
                            category = o.optString("category", "OTHER"),
                            subCategory = o.optString("subCategory", "GENERAL"),
                            weeklyAmount = o.optDouble("weeklyAmount", 0.0),
                            monthlyAmount = o.optDouble("monthlyAmount", 0.0),
                            yearlyAmount = o.optDouble("yearlyAmount", 0.0),
                            targetAccountId = o.optString("targetAccountId", null)
                        )
                    )
                }
            }

            val transactions = mutableListOf<TransactionEntity>()
            root.optJSONArray("transactions")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    transactions.add(
                        TransactionEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            budgetPeriodId = o.optString("budgetPeriodId", ""),
                            accountId = o.optString("accountId", ""),
                            toAccountId = if (o.has("toAccountId") && !o.isNull("toAccountId")) o.getString("toAccountId") else null,
                            contributorId = if (o.has("contributorId") && !o.isNull("contributorId")) o.getString("contributorId") else null,
                            category = o.optString("category", ""),
                            subCategory = o.optString("subCategory", ""),
                            amount = o.optDouble("amount", 0.0),
                            // Old backups say EXPENSE / INCOME; fromStored maps them to the new names.
                            type = TransactionType.fromStored(o.optString("type", "")).name,
                            date = o.optString("date", ""),
                            note = o.optString("note", ""),
                            payee = o.optString("payee", ""),
                            tag = o.optString("tag", ""),
                            isRecurring = o.optBoolean("isRecurring", false),
                            // Backups from before cleared tracking have no such key. Those rows
                            // were already counted in the old running balance, so treat them as
                            // cleared (same rule as the v1 -> v2 database migration).
                            cleared = o.optBoolean("cleared", true),
                            createdAt = o.optLong("createdAt", System.currentTimeMillis())
                        )
                    )
                }
            }

            val recurring = mutableListOf<RecurringTransactionEntity>()
            root.optJSONArray("recurring_transactions")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    recurring.add(
                        RecurringTransactionEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            title = o.optString("title", "Recurring"),
                            amount = o.optDouble("amount", 0.0),
                            type = TransactionType.fromStored(o.optString("type", "")).name,
                            accountId = o.optString("accountId", ""),
                            category = o.optString("category", ""),
                            subCategory = o.optString("subCategory", ""),
                            frequency = o.optString("frequency", "WEEKLY"),
                            nextDueDate = o.optString("nextDueDate", ""),
                            active = o.optBoolean("active", true)
                        )
                    )
                }
            }

            val incomeCalcs = mutableListOf<IncomeCalculationEntity>()
            root.optJSONArray("income_calculations")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    incomeCalcs.add(
                        IncomeCalculationEntity(
                            id = o.optString("id", UUID.randomUUID().toString()),
                            contributorName = o.optString("contributorName", ""),
                            source = o.optString("source", ""),
                            hourlyRate = o.optDouble("hourlyRate", 0.0),
                            hoursPerWeek = o.optDouble("hoursPerWeek", 40.0),
                            numberOfWeeks = o.optInt("numberOfWeeks", 52),
                            weeklyGross = o.optDouble("weeklyGross", 0.0),
                            yearlyGross = o.optDouble("yearlyGross", 0.0),
                            weeklyTax = o.optDouble("weeklyTax", 0.0),
                            investment = o.optDouble("investment", 0.0),
                            weeklyNet = o.optDouble("weeklyNet", 0.0),
                            reported = o.optDouble("reported", 0.0)
                        )
                    )
                }
            }

            Result.success(
                FullBudgetData(
                    periods = periods,
                    contributors = contributors,
                    incomeSources = incomeSources,
                    accounts = accounts,
                    allocations = allocations,
                    budgetItems = items,
                    transactions = transactions,
                    recurringTransactions = recurring,
                    incomeCalculations = incomeCalcs
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Extracts and reads a package from a ZIP input stream.
     */
    fun readFromZip(inputStream: InputStream): Result<FullBudgetData> {
        return try {
            val zis = ZipInputStream(inputStream)
            var entry = zis.nextEntry
            var jsonContent: String? = null

            while (entry != null) {
                if (entry.name.endsWith(".json") && !entry.name.contains("manifest")) {
                    val reader = BufferedReader(InputStreamReader(zis))
                    jsonContent = reader.readText()
                    break
                }
                entry = zis.nextEntry
            }
            if (jsonContent != null) {
                parseFullData(jsonContent)
            } else {
                Result.failure(IllegalArgumentException("No valid budget json found in zip archive"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Exports transactions as CSV text.
     */
    fun exportTransactionsCsv(transactions: List<TransactionEntity>, accounts: List<AccountEntity>): String {
        fun q(value: String) = "\"" + value.replace("\"", "\"\"") + "\""
        fun nameOf(id: String?) = accounts.find { it.id == id }?.name ?: id.orEmpty()

        val sb = StringBuilder()
        sb.append("ID,Date,Account,Type,Amount,Cleared,Category,SubCategory,Description,TransferAccount,CreatedAt\n")
        transactions.forEach { t ->
            val type = t.transactionType
            val transferTo = if (type == TransactionType.TRANSFER) nameOf(t.toAccountId) else ""
            val description = if (t.payee.isNotBlank()) "${t.payee} - ${t.note}" else t.note
            sb.append(
                listOf(
                    q(t.id), q(t.date), q(nameOf(t.accountId)), q(type.name), t.amount.toString(),
                    t.cleared.toString(), q(t.category), q(t.subCategory), q(description), q(transferTo),
                    t.createdAt.toString()
                ).joinToString(",")
            ).append("\n")
        }
        return sb.toString()
    }
}
